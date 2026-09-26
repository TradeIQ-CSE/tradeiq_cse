import {
  Global,
  Inject,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../config/redis.config';
import {
  hostPortOf,
  logConnectionEventsThrottled,
} from './redis-connection-logging';
import { REDIS_CLIENT } from './redis.constants';
import { RateLimitCounter } from './rate-limit-counter';
import { RedisRateLimitCounter } from './redis-rate-limit-counter';

const logger = new Logger('RedisModule');

// Global: every module that needs the rate-limit counter (PR 4's limiter,
// later the key lookup cache) injects RateLimitCounter directly rather than
// importing RedisModule itself.
@Global()
@Module({
  imports: [ConfigModule.forFeature(redisConfig)],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.getOrThrow<string>('redis.url');

        // Fail-open, not fail-fast: a Redis that is down at boot must not
        // stop this service from starting or serving traffic (ADR 0010).
        // enableOfflineQueue: false and a short connectTimeout make any one
        // call fail quickly instead of queuing forever; the default
        // auto-reconnect is left on so the client keeps trying in the
        // background and recovers on its own once Redis comes back.
        const client = new Redis(url, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          // Linear backoff, 200ms per attempt, capped at 2s (ioredis's own
          // default grows exponentially with no cap) so a flapping Redis
          // doesn't leave the client silent for too long.
          retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        });

        logConnectionEventsThrottled(client, logger, hostPortOf(url));

        return client;
      },
    },
    {
      provide: RateLimitCounter,
      useClass: RedisRateLimitCounter,
    },
  ],
  exports: [REDIS_CLIENT, RateLimitCounter],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  // So e2e tests (and a real shutdown) don't leave an open TCP handle behind.
  // quit() is graceful (waits for in-flight commands); disconnect() is the
  // fallback when Redis is unreachable and quit() would otherwise hang on a
  // reply that never comes.
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

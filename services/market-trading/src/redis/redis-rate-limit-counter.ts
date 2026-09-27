import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RateLimitCounter } from './rate-limit-counter';

// INCR then EXPIRE ... NX in one round trip, so a crash between the two
// commands can never leave a counter that increments forever. EXPIRE NX only
// sets the TTL when the key has none yet — i.e. only on the request that just
// created it — which is what "TTL set once, on creation" requires (Redis 7).
const INCREMENT_AND_EXPIRE_ONCE = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1], 'NX')
return count
`;

@Injectable()
export class RedisRateLimitCounter implements RateLimitCounter {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(
      INCREMENT_AND_EXPIRE_ONCE,
      1,
      key,
      ttlSeconds,
    );
    return Number(result);
  }

  async peek(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value === null ? 0 : Number(value);
  }
}

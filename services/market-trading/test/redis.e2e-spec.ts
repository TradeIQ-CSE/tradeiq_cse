process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

import { randomUUID } from 'crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import redisConfig from '../src/config/redis.config';
import { RateLimitCounter } from '../src/redis/rate-limit-counter';
import { RedisModule } from '../src/redis/redis.module';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

// Against a real Redis at REDIS_URL. Every key this suite creates carries a
// unique prefix and is deleted afterwards, so a failed run never leaves
// counters behind for the next one.
describe('Redis (e2e)', () => {
  let moduleRef: TestingModule;
  let counter: RateLimitCounter;
  let client: Redis;
  const prefix = `redis-e2e:${randomUUID()}:`;
  const createdKeys: string[] = [];

  const key = (name: string) => {
    const k = `${prefix}${name}`;
    createdKeys.push(k);
    return k;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [redisConfig] }),
        RedisModule,
      ],
    }).compile();

    counter = moduleRef.get(RateLimitCounter);
    client = moduleRef.get(REDIS_CLIENT);

    // enableOfflineQueue is off (by design — see redis.module.ts), so a
    // command issued before the initial handshake finishes is rejected
    // outright rather than queued. Wait for it here, once, rather than
    // making every test below race the connection.
    if (client.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        client.once('ready', resolve);
        client.once('error', reject);
      });
    }
  });

  afterAll(async () => {
    // try/finally: a failed cleanup delete must not skip closing the
    // client, or a failure here leaves the suite's Redis connection open.
    try {
      if (createdKeys.length > 0) {
        await client.del(...createdKeys);
      }
    } finally {
      await moduleRef.close();
    }
  });

  it('increments twice: 1 then 2', async () => {
    const k = key('increments');
    expect(await counter.increment(k, 60)).toBe(1);
    expect(await counter.increment(k, 60)).toBe(2);
  });

  it('sets a TTL bounded by ttlSeconds, and only on creation', async () => {
    const k = key('ttl');
    await counter.increment(k, 60);
    const ttl = await client.ttl(k);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('peek returns the current count without incrementing it', async () => {
    const k = key('peek');
    await counter.increment(k, 60);
    await counter.increment(k, 60);
    expect(await counter.peek(k)).toBe(2);
    expect(await counter.peek(k)).toBe(2);
  });

  it('peek on a key that was never created is 0', async () => {
    expect(await counter.peek(key('never-created'))).toBe(0);
  });

  // ADR 0010's fail-open rule depends on this: the limiter above this counter
  // must see a fast rejection, not a hang, to decide to let the request
  // through. This is the counter's half of that contract. Compiles a second
  // copy of the real RedisModule (the same connection options the app uses,
  // not a hand-rolled client) pointed at an unused port, so this proves
  // something about what RedisModule actually does.
  it('rejects quickly against an unreachable Redis instead of hanging', async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://127.0.0.1:6390';

    let unreachableModuleRef: TestingModule | undefined;
    try {
      unreachableModuleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [redisConfig],
            ignoreEnvFile: true,
          }),
          RedisModule,
        ],
      }).compile();

      const unreachableCounter =
        unreachableModuleRef.get<RateLimitCounter>(RateLimitCounter);

      const startedAt = Date.now();
      await expect(
        unreachableCounter.increment('unreachable-key', 60),
      ).rejects.toThrow();
      expect(Date.now() - startedAt).toBeLessThan(2000);
    } finally {
      // In a finally so the reconnecting client can't hold the Jest process
      // open even if the assertions above throw.
      if (unreachableModuleRef) {
        await unreachableModuleRef.close();
      }
      process.env.REDIS_URL = previousRedisUrl;
    }
  });
});

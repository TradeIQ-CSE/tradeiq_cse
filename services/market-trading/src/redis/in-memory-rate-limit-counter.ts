import { RateLimitCounter } from './rate-limit-counter';

interface Entry {
  count: number;
  expiresAtMs: number;
}

// A drop-in stand-in for RedisRateLimitCounter so PR 4's limiter and its
// tests never need a real Redis. Same contract: TTL is set only when the key
// is created, and an expired key behaves exactly like a missing one.
//
// Not @Injectable(): the constructor takes a `now: () => number` function
// that Nest DI cannot resolve, so this is registered with
// `useValue: new InMemoryRateLimitCounter()` (or constructed directly in
// tests), never `useClass`.
export class InMemoryRateLimitCounter implements RateLimitCounter {
  private readonly store = new Map<string, Entry>();

  // The clock is a parameter so a test can pin time instead of racing real TTLs.
  constructor(private readonly now: () => number = Date.now) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = this.now();
    const existing = this.store.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) {
      const entry: Entry = { count: 1, expiresAtMs: nowMs + ttlSeconds * 1000 };
      this.store.set(key, entry);
      return entry.count;
    }
    existing.count += 1;
    return existing.count;
  }

  async peek(key: string): Promise<number> {
    const nowMs = this.now();
    const existing = this.store.get(key);
    if (!existing || existing.expiresAtMs <= nowMs) return 0;
    return existing.count;
  }
}

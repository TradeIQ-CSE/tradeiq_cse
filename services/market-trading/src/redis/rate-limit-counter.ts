// The rate-limit policy (window size, the 100/hour default, what happens when
// the store is unreachable) lives in the PR 4 interceptor, not here. This is
// just a counter with a TTL: increment it, or read it back.
export abstract class RateLimitCounter {
  /**
   * Adds one to `key` and returns the new count. Sets the key to expire
   * after `ttlSeconds` when it is created (an existing key's TTL is left
   * alone). Throws if the store is unreachable.
   */
  abstract increment(key: string, ttlSeconds: number): Promise<number>;

  /**
   * The current count, 0 when the key does not exist. Throws if the store is
   * unreachable.
   */
  abstract peek(key: string): Promise<number>;
}

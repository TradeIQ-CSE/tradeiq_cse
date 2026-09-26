import { Injectable } from '@nestjs/common';

// PR 4's ApiKeyGuard hot path: hash -> { apiKeyId }, positive hits only (a
// miss always falls through to Postgres, so a wrong guess is never cached
// and never speeds up a future guess). 60 s TTL, bounded size, oldest entry
// evicted first — this is a small speed-up for the common case, never the
// source of truth. DeveloperKeysService.revoke()/regenerate() call
// invalidate() so a revoked or replaced key stops working on this instance
// immediately, without waiting for the TTL.
//
// Shared between the public API (src/public-api) and key management
// (src/developer-api) via this module, so neither imports the other.
@Injectable()
export class ApiKeyCache {
  private static readonly TTL_MS = 60_000;
  private static readonly MAX_ENTRIES = 10_000;

  private readonly store = new Map<
    string,
    { apiKeyId: string; expiresAt: number }
  >();

  get(hash: string): { apiKeyId: string } | undefined {
    const entry = this.store.get(hash);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(hash);
      return undefined;
    }
    return { apiKeyId: entry.apiKeyId };
  }

  set(hash: string, apiKeyId: string): void {
    // Map preserves insertion order, so the first key returned by the
    // iterator is the oldest one — evicting it before inserting a genuinely
    // new entry keeps the cache within its bound without a separate LRU
    // structure. A re-set of an existing hash does not evict anything: the
    // size does not grow.
    if (!this.store.has(hash) && this.store.size >= ApiKeyCache.MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(hash, {
      apiKeyId,
      expiresAt: Date.now() + ApiKeyCache.TTL_MS,
    });
  }

  invalidate(hash: string): void {
    this.store.delete(hash);
  }
}

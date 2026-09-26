import { ApiKeyCache } from './api-key-cache.service';

describe('ApiKeyCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is empty for a hash that was never set', () => {
    const cache = new ApiKeyCache();
    expect(cache.get('unknown-hash')).toBeUndefined();
  });

  it('returns a positive hit', () => {
    const cache = new ApiKeyCache();
    cache.set('hash-a', 'key-a');
    expect(cache.get('hash-a')).toEqual({ apiKeyId: 'key-a' });
  });

  it('expires an entry after 60 seconds', () => {
    const cache = new ApiKeyCache();
    cache.set('hash-a', 'key-a');

    jest.advanceTimersByTime(59_000);
    expect(cache.get('hash-a')).toEqual({ apiKeyId: 'key-a' });

    jest.advanceTimersByTime(2_000);
    expect(cache.get('hash-a')).toBeUndefined();
  });

  it('invalidate removes an entry immediately', () => {
    const cache = new ApiKeyCache();
    cache.set('hash-a', 'key-a');
    cache.invalidate('hash-a');
    expect(cache.get('hash-a')).toBeUndefined();
  });

  it('invalidating an absent hash is a no-op', () => {
    const cache = new ApiKeyCache();
    expect(() => cache.invalidate('never-set')).not.toThrow();
  });

  it('evicts the oldest entry once the bound is reached', () => {
    const cache = new ApiKeyCache();
    const MAX_ENTRIES = 10_000;
    for (let i = 0; i < MAX_ENTRIES; i++) {
      cache.set(`hash-${i}`, `key-${i}`);
    }
    // Every one of the first MAX_ENTRIES hashes is still present.
    expect(cache.get('hash-0')).toEqual({ apiKeyId: 'key-0' });

    // One more insert should evict the oldest (hash-0), not overflow.
    cache.set('hash-overflow', 'key-overflow');
    expect(cache.get('hash-0')).toBeUndefined();
    expect(cache.get('hash-overflow')).toEqual({ apiKeyId: 'key-overflow' });
    // A still-recent entry survives.
    expect(cache.get(`hash-${MAX_ENTRIES - 1}`)).toEqual({
      apiKeyId: `key-${MAX_ENTRIES - 1}`,
    });
  });

  it('re-setting an existing hash does not evict anything', () => {
    const cache = new ApiKeyCache();
    cache.set('hash-a', 'key-a');
    cache.set('hash-b', 'key-b');
    cache.set('hash-a', 'key-a-updated');
    expect(cache.get('hash-a')).toEqual({ apiKeyId: 'key-a-updated' });
    expect(cache.get('hash-b')).toEqual({ apiKeyId: 'key-b' });
  });
});

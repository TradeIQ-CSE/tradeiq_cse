import { InMemoryRateLimitCounter } from './in-memory-rate-limit-counter';

describe('InMemoryRateLimitCounter', () => {
  it('peeks a missing key as 0', async () => {
    const counter = new InMemoryRateLimitCounter();
    expect(await counter.peek('missing')).toBe(0);
  });

  it('increments from 0', async () => {
    const counter = new InMemoryRateLimitCounter();
    expect(await counter.increment('k', 3600)).toBe(1);
    expect(await counter.increment('k', 3600)).toBe(2);
    expect(await counter.increment('k', 3600)).toBe(3);
    expect(await counter.peek('k')).toBe(3);
  });

  it('keeps separate keys independent', async () => {
    const counter = new InMemoryRateLimitCounter();
    await counter.increment('a', 3600);
    await counter.increment('a', 3600);
    await counter.increment('b', 3600);
    expect(await counter.peek('a')).toBe(2);
    expect(await counter.peek('b')).toBe(1);
  });

  it('sets the TTL only on creation, not on every increment', async () => {
    let now = 0;
    const counter = new InMemoryRateLimitCounter(() => now);

    await counter.increment('k', 10); // expires at 10_000ms
    now = 9_000; // well inside the window
    await counter.increment('k', 999); // must NOT push the expiry out to 9_000 + 999_000
    now = 10_001; // past the original 10s TTL
    expect(await counter.peek('k')).toBe(0);
  });

  it('resets the count once the key has expired', async () => {
    let now = 0;
    const counter = new InMemoryRateLimitCounter(() => now);

    await counter.increment('k', 10);
    await counter.increment('k', 10);
    expect(await counter.peek('k')).toBe(2);

    now = 10_001; // past expiry
    expect(await counter.peek('k')).toBe(0);
    expect(await counter.increment('k', 10)).toBe(1);
  });

  it('treats a key at exactly its expiry instant as expired', async () => {
    let now = 0;
    const counter = new InMemoryRateLimitCounter(() => now);

    await counter.increment('k', 10);
    now = 10_000; // exactly the expiry instant
    expect(await counter.peek('k')).toBe(0);
  });
});

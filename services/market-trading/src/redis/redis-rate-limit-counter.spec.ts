import { RedisRateLimitCounter } from './redis-rate-limit-counter';

describe('RedisRateLimitCounter', () => {
  function mockClient() {
    return {
      eval: jest.fn(),
      get: jest.fn(),
    };
  }

  it('increments via a single atomic eval call (INCR + EXPIRE NX)', async () => {
    const client = mockClient();
    client.eval.mockResolvedValue(1);
    const counter = new RedisRateLimitCounter(client as never);

    const result = await counter.increment('ratelimit:key1:2026092610', 7200);

    expect(result).toBe(1);
    expect(client.eval).toHaveBeenCalledTimes(1);
    const [script, numkeys, key, ttl] = client.eval.mock.calls[0];
    expect(script).toEqual(expect.stringContaining('INCR'));
    expect(script).toEqual(expect.stringContaining('EXPIRE'));
    expect(script).toEqual(expect.stringContaining('NX'));
    expect(numkeys).toBe(1);
    expect(key).toBe('ratelimit:key1:2026092610');
    expect(ttl).toBe(7200);
  });

  it('returns the count eval reports, coerced to a number', async () => {
    const client = mockClient();
    client.eval.mockResolvedValue('42');
    const counter = new RedisRateLimitCounter(client as never);

    expect(await counter.increment('k', 60)).toBe(42);
  });

  it('propagates an error from increment', async () => {
    const client = mockClient();
    client.eval.mockRejectedValue(new Error('connection refused'));
    const counter = new RedisRateLimitCounter(client as never);

    await expect(counter.increment('k', 60)).rejects.toThrow(
      'connection refused',
    );
  });

  it('peeks the current count', async () => {
    const client = mockClient();
    client.get.mockResolvedValue('5');
    const counter = new RedisRateLimitCounter(client as never);

    expect(await counter.peek('k')).toBe(5);
    expect(client.get).toHaveBeenCalledWith('k');
  });

  it('peeks a missing key as 0', async () => {
    const client = mockClient();
    client.get.mockResolvedValue(null);
    const counter = new RedisRateLimitCounter(client as never);

    expect(await counter.peek('missing')).toBe(0);
  });

  it('propagates an error from peek', async () => {
    const client = mockClient();
    client.get.mockRejectedValue(new Error('connection refused'));
    const counter = new RedisRateLimitCounter(client as never);

    await expect(counter.peek('k')).rejects.toThrow('connection refused');
  });
});

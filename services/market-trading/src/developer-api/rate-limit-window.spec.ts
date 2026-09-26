import { currentWindow } from './rate-limit-window';

describe('currentWindow', () => {
  it('builds the counter key as ratelimit:{apiKeyId}:{yyyymmddhh} in UTC', () => {
    const window = currentWindow(new Date('2026-09-26T10:15:42.123Z'));
    expect(window.counterKey('key-1')).toBe('ratelimit:key-1:2026092610');
  });

  it('pads month, day and hour to two digits', () => {
    const window = currentWindow(new Date('2026-01-05T03:00:00.000Z'));
    expect(window.counterKey('k')).toBe('ratelimit:k:2026010503');
  });

  it('resets at the start of the next UTC hour just before it turns', () => {
    const window = currentWindow(new Date('2026-09-26T09:59:59.999Z'));
    expect(window.resetAt.toISOString()).toBe('2026-09-26T10:00:00.000Z');
  });

  it('resets at the start of the next hour right after it turns', () => {
    const window = currentWindow(new Date('2026-09-26T10:00:00.001Z'));
    expect(window.resetAt.toISOString()).toBe('2026-09-26T11:00:00.000Z');
  });

  it('rolls over into the next UTC day from hour 23', () => {
    const window = currentWindow(new Date('2026-09-26T23:30:00.000Z'));
    expect(window.counterKey('k')).toBe('ratelimit:k:2026092623');
    expect(window.resetAt.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('rolls over into the next month at the last day of the month', () => {
    const window = currentWindow(new Date('2026-09-30T23:15:00.000Z'));
    expect(window.resetAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rolls over into the next year at 31 December', () => {
    const window = currentWindow(new Date('2026-12-31T23:45:00.000Z'));
    expect(window.resetAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('computes ttlSeconds as the remainder of the current hour plus 60 s grace', () => {
    const window = currentWindow(new Date('2026-09-26T10:00:00.000Z'));
    expect(window.ttlSeconds).toBe(3660);

    const almostUp = currentWindow(new Date('2026-09-26T10:59:59.000Z'));
    expect(almostUp.ttlSeconds).toBe(61);
  });

  it('never rounds ttlSeconds to 0 at the very end of the hour', () => {
    const window = currentWindow(new Date('2026-09-26T09:59:59.600Z'));
    expect(window.ttlSeconds).toBe(61);
  });

  it('gives the full hour plus grace exactly on the hour', () => {
    const window = currentWindow(new Date('2026-09-26T09:00:00.000Z'));
    expect(window.ttlSeconds).toBe(3660);
  });

  it('produces the same counter key for two calls inside the same hour', () => {
    const a = currentWindow(new Date('2026-09-26T10:00:01.000Z'));
    const b = currentWindow(new Date('2026-09-26T10:59:58.000Z'));
    expect(a.counterKey('k')).toBe(b.counterKey('k'));
  });
});

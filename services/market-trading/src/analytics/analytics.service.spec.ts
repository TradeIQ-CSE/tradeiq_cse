import Decimal from 'decimal.js';
import { levelOn, MAX_LEVEL_AGE_DAYS } from './analytics.service';

describe('levelOn', () => {
  const levels = [
    { date: '2026-01-02', level: new Decimal(100) },
    { date: '2026-01-05', level: new Decimal(110) },
    { date: '2026-03-02', level: new Decimal(120) },
  ];

  it('uses the latest level on or before the day', () => {
    expect(levelOn(levels, '2026-01-05')?.toNumber()).toBe(110);
    expect(levelOn(levels, '2026-01-07')?.toNumber()).toBe(110);
  });

  it('carries a level across a weekend and holidays', () => {
    expect(
      levelOn(levels, `2026-01-${5 + MAX_LEVEL_AGE_DAYS}`)?.toNumber(),
    ).toBe(110);
  });

  it('reports a data gap instead of bridging it', () => {
    expect(levelOn(levels, '2026-02-20')).toBeUndefined();
  });

  it('has nothing before the first level', () => {
    expect(levelOn(levels, '2025-12-31')).toBeUndefined();
  });

  it('never divides by a zero level', () => {
    expect(
      levelOn([{ date: '2026-01-02', level: new Decimal(0) }], '2026-01-02'),
    ).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  dailyOhlcvFixture,
  weeklyOhlcvFixture,
} from '../../test/fixtures/security-detail';
import { normalizeOhlcvBars } from './ohlcv-chart';

describe('normalizeOhlcvBars', () => {
  it('preserves daily order, values, adjusted close, and nullable open', () => {
    const result = normalizeOhlcvBars(dailyOhlcvFixture);

    expect(result.map((bar) => bar.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(result[0]).toEqual({
      date: '2026-09-01',
      periodEnd: null,
      open: null,
      high: 199,
      low: 194,
      close: 196.25,
      adjustedClose: null,
      volume: 300_500,
    });
    expect(result[1].adjustedClose).toBe(198.25);
  });

  it('maps aggregate period labels without inventing adjusted closes', () => {
    const [result] = normalizeOhlcvBars(weeklyOhlcvFixture);

    expect(result.date).toBe('2026-08-24');
    expect(result.periodEnd).toBe('2026-08-28');
    expect(result).not.toHaveProperty('adjustedClose');
    expect(result).toMatchObject({
      open: 190,
      high: 198,
      low: 189,
      close: 196,
      volume: 2_500_000,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { comparison, performanceStats } from './metrics';
import type { PerformancePoint } from './api';

const points = (values: number[]): PerformancePoint[] =>
  values.map((value, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    value,
    return_pct: 0,
    benchmarks: { ASPI: 0, SL20: 0 },
  }));

describe('performanceStats', () => {
  it('finds the largest fall from a previous high', () => {
    expect(performanceStats(points([100, 120, 90, 130, 117])).maxDrawdownPct).toBe(-25);
  });

  it('reports no fall for a series that only rises', () => {
    expect(performanceStats(points([100, 101, 102])).maxDrawdownPct).toBe(0);
  });

  it('finds the best and worst day', () => {
    const stats = performanceStats(points([100, 110, 99]));
    expect(stats.bestDayPct).toBe(10);
    expect(stats.worstDayPct).toBe(-10);
  });

  it('leaves day figures empty with a single day', () => {
    expect(performanceStats(points([100]))).toEqual({
      maxDrawdownPct: 0,
      bestDayPct: null,
      worstDayPct: null,
      volatilityPct: null,
    });
  });

  it('annualises the spread of daily changes', () => {
    // Four daily changes alternating +1% / -1%: sample sd = 0.01 × √(4/3),
    // × √252 = 18.33%.
    const stats = performanceStats(points([100, 101, 99.99, 100.9899, 99.980001]));
    expect(stats.volatilityPct).toBeCloseTo(18.33, 1);
  });
});

describe('comparison', () => {
  it('calls near-equal returns level', () => {
    expect(comparison(2.01, 2)).toBe('level');
    expect(comparison(3, 2)).toBe('ahead');
    expect(comparison(1, 2)).toBe('behind');
  });
});

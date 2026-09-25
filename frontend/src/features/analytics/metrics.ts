import type { PerformancePoint } from './api';

export interface PerformanceStats {
  /** Largest fall from a previous high, as a negative percentage. */
  maxDrawdownPct: number;
  /** Best and worst single-day change, in percent; null with under two days. */
  bestDayPct: number | null;
  worstDayPct: number | null;
  /** Typical yearly swing: the standard deviation of daily changes × √252. */
  volatilityPct: number | null;
}

const TRADING_DAYS_PER_YEAR = 252;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Figures for the detailed view, worked out from the daily values. */
export function performanceStats(points: readonly PerformancePoint[]): PerformanceStats {
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, point.value / peak - 1);
  }

  const daily = points
    .slice(1)
    .map((point, index) => {
      const previous = points[index].value;
      return previous > 0 ? point.value / previous - 1 : null;
    })
    .filter((change): change is number => change !== null);

  let volatility: number | null = null;
  if (daily.length >= 2) {
    const mean = daily.reduce((sum, change) => sum + change, 0) / daily.length;
    const variance =
      daily.reduce((sum, change) => sum + (change - mean) ** 2, 0) / (daily.length - 1);
    volatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  return {
    maxDrawdownPct: round2(maxDrawdown * 100),
    bestDayPct: daily.length > 0 ? round2(Math.max(...daily) * 100) : null,
    worstDayPct: daily.length > 0 ? round2(Math.min(...daily) * 100) : null,
    volatilityPct: volatility === null ? null : round2(volatility * 100),
  };
}

/** How a return compares with the market's: ahead, behind or level (within 0.05). */
export function comparison(yours: number, market: number): 'ahead' | 'behind' | 'level' {
  const gap = yours - market;
  if (Math.abs(gap) < 0.05) return 'level';
  return gap > 0 ? 'ahead' : 'behind';
}

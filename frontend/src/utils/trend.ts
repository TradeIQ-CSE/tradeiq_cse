export type Trend = 'positive' | 'negative' | 'flat';

export function classifyTrend(value: number | null | undefined): Trend {
  if (value === null || value === undefined || value === 0) return 'flat';
  return value > 0 ? 'positive' : 'negative';
}

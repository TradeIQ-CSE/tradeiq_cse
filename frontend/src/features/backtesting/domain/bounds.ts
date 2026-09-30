import { parseDate } from '@internationalized/date';
import { snapOutOfDataGap, type DataGap } from '../../../lib/data-gaps';
import { formatDay } from './descriptions';
import type { PeriodConfig } from './types';

export const BACKTEST_MIN_DATE = '2017-01-01';
export const FALLBACK_BACKTEST_MAX_DATE = '2025-12-31';
export function validBacktestDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return parseDate(value).toString() === value; } catch { return false; }
}
export function backtestBounds(dataFrom?: string | null, dataTo?: string | null, maxDate = FALLBACK_BACKTEST_MAX_DATE) {
  const maximumPolicy = validBacktestDate(maxDate) ? maxDate : FALLBACK_BACKTEST_MAX_DATE;
  const minimum = validBacktestDate(dataFrom) && dataFrom > BACKTEST_MIN_DATE ? dataFrom : BACKTEST_MIN_DATE;
  const maximum = validBacktestDate(dataTo) && dataTo < maximumPolicy ? dataTo : maximumPolicy;
  return { minimum, maximum, available: minimum < maximum };
}
export function suggestedBacktestPeriod(dataFrom?: string | null, dataTo?: string | null, gaps: readonly DataGap[] = [], maxDate = FALLBACK_BACKTEST_MAX_DATE, years?: number): PeriodConfig | null {
  const bounds = backtestBounds(dataFrom, dataTo, maxDate);
  if (!bounds.available) return null;
  const yearStart = years === undefined ? bounds.minimum : parseDate(bounds.maximum).subtract({ years }).add({ days: 1 }).toString();
  const startDate = snapOutOfDataGap(gaps, yearStart < bounds.minimum ? bounds.minimum : yearStart, 'start');
  const endDate = snapOutOfDataGap(gaps, bounds.maximum, 'end');
  if (startDate < bounds.minimum || endDate > bounds.maximum || startDate >= endDate) return null;
  return { startDate, endDate };
}
export const backtestAvailabilityMessage = (maxDate: string) => `Backtesting is available through ${formatDay(maxDate)}.`;
export const previousPeriod = (startDate: string, endDate: string, maxDate: string) => startDate > maxDate || endDate > maxDate;

import { BacktestInput, DailyBar } from '../domain/types';
import {
  InvalidDateRangeError,
  MissingPriceHistoryError,
  InsufficientWarmupDataError,
  InvalidBarDataError,
  InvalidCapitalError,
} from '../domain/errors';
import { validateExecution } from '../rules/validateExecution';
import { validateRule } from '../rules/validateRule';

export interface PreparedBars {
  warmupBars: DailyBar[];
  simulationBars: DailyBar[];
}

/**
 * Validates a calendar date in YYYY-MM-DD form without accepting date rollover.
 */
export function isValidDateFormat(dateString: string): boolean {
  if (
    typeof dateString !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
  ) {
    return false;
  }

  const parsed = new Date(`${dateString}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === dateString
  );
}

/**
 * Validates high-level input parameters (rules, date range, initial capital, bars array structure).
 */
export function validateInputParameters(input: BacktestInput): void {
  validateRule(input.rules);

  if (
    !isValidDateFormat(input.startDate) ||
    !isValidDateFormat(input.endDate) ||
    input.startDate > input.endDate
  ) {
    throw new InvalidDateRangeError('Invalid date range.');
  }

  if (!Number.isFinite(input.initialCapital) || input.initialCapital <= 0) {
    throw new InvalidCapitalError('initialCapital must be greater than 0.');
  }

  if (!Array.isArray(input.bars)) {
    throw new MissingPriceHistoryError('Missing historical bars.');
  }

  if (input.rules.version === '2.0') {
    validateExecution(input.positionSizing, input.feeConfig);
  }
}

/**
 * Normalizes OHLCV bars for V2 strategy (handling zero opening quote substitution)
 * and sorts them chronologically by date.
 */
export function normalizeAndSortBars(
  bars: DailyBar[],
  isVersion2: boolean,
): DailyBar[] {
  return bars
    .map((bar) => {
      if (!isVersion2) return bar;
      const open = bar.open === 0 && bar.close > 0 ? bar.close : bar.open;
      return {
        ...bar,
        open,
        low: bar.low === 0 ? Math.min(open, bar.close) : bar.low,
        high: bar.high === 0 ? Math.max(open, bar.close) : bar.high,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Validates individual bars for date uniqueness, date format, and OHLCV price/volume bounds.
 */
export function validateBarSeries(bars: DailyBar[], isVersion2: boolean): void {
  const seenDates = new Set<string>();

  for (const bar of bars) {
    if (!isValidDateFormat(bar.date) || seenDates.has(bar.date)) {
      throw new InvalidBarDataError(`Invalid/dup date: ${bar.date}`);
    }
    seenDates.add(bar.date);

    const isInvalidOHLCV =
      (isVersion2 &&
        ([bar.open, bar.high, bar.low, bar.close, bar.volume].some(
          (value) => !Number.isFinite(value),
        ) ||
          Math.min(bar.open, bar.high, bar.low, bar.close) <= 0)) ||
      bar.open < 0 ||
      bar.high < 0 ||
      bar.low < 0 ||
      bar.close < 0 ||
      bar.volume < 0 ||
      bar.high < bar.low ||
      bar.high < bar.open ||
      bar.high < bar.close ||
      bar.low > bar.open ||
      bar.low > bar.close;

    if (isInvalidOHLCV) {
      throw new InvalidBarDataError(`Invalid OHLCV: ${bar.date}`);
    }
  }
}

/**
 * Main helper: Validates backtest input, normalizes bars, checks bar bounds,
 * and splits dataset into warmup and simulation bars.
 */
export function validateAndPrepareBars(input: BacktestInput): PreparedBars {
  validateInputParameters(input);

  const isVersion2 = input.rules.version === '2.0';
  const sortedBars = normalizeAndSortBars(input.bars, isVersion2);

  validateBarSeries(sortedBars, isVersion2);

  const warmupBars = sortedBars.filter((bar) => bar.date < input.startDate);
  const simulationBars = sortedBars.filter(
    (bar) => bar.date >= input.startDate && bar.date <= input.endDate,
  );

  const requiredWarmupCount = input.warmupPeriod ?? 0;
  if (warmupBars.length < requiredWarmupCount) {
    throw new InsufficientWarmupDataError(
      `Warmup required ${requiredWarmupCount}, got ${warmupBars.length}.`,
    );
  }

  if (simulationBars.length === 0) {
    throw new MissingPriceHistoryError('No bars in simulation range.');
  }

  return { warmupBars, simulationBars };
}

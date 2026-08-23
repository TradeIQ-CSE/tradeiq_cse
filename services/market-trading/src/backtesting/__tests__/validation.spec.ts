import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING, createSampleBars } from './fixtures';
import { RuleSet, DailyBar } from '../domain/types';
import {
  InvalidRuleError,
  InvalidDateRangeError,
  MissingPriceHistoryError,
  InsufficientWarmupDataError,
  InvalidBarDataError,
} from '../domain/errors';

describe('Backtesting Engine - Input Validation', () => {
  const validRules: RuleSet = {
    version: '1.0',
    buyCondition: { type: 'period_start' },
    sellConditions: [{ type: 'take_profit_pct', value: 5 }],
  };

  it('should throw InvalidRuleError for invalid rules DSL', () => {
    // Missing buy condition
    const badRules1: any = {
      version: '1.0',
      sellConditions: [{ type: 'take_profit_pct', value: 5 }],
    };
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: badRules1,
      })
    ).toThrow(InvalidRuleError);

    // Empty sell conditions
    const badRules2: any = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [],
    };
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: badRules2,
      })
    ).toThrow(InvalidRuleError);

    // Negative rule value
    const badRules3: any = {
      version: '1.0',
      buyCondition: { type: 'price_falls_to', value: -10 },
      sellConditions: [{ type: 'take_profit_pct', value: 5 }],
    };
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: badRules3,
      })
    ).toThrow(InvalidRuleError);
  });

  it('should throw InvalidDateRangeError for invalid date ranges', () => {
    // startDate > endDate
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026-08-05',
        endDate: '2026-08-01',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
      })
    ).toThrow(InvalidDateRangeError);

    // Invalid date formats
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026/08/01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
      })
    ).toThrow(InvalidDateRangeError);
  });

  it('should throw MissingPriceHistoryError when there are no bars in the simulation range', () => {
    expect(() =>
      runBacktest({
        bars: createSampleBars(),
        startDate: '2026-09-01', // Dates are after the sample bars range
        endDate: '2026-09-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
      })
    ).toThrow(MissingPriceHistoryError);
  });

  it('should throw InsufficientWarmupDataError when warm-up requirements are not met', () => {
    expect(() =>
      runBacktest({
        bars: createSampleBars(), // Start date is 2026-08-01, so there are 0 warmup bars before it
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
        warmupPeriod: 5, // Requires 5 warmup bars
      })
    ).toThrow(InsufficientWarmupDataError);
  });

  it('should throw InvalidBarDataError for duplicate or malformed bar data', () => {
    // Duplicate dates
    const dupBars: DailyBar[] = [
      { date: '2026-08-01', open: 100, high: 105, low: 98, close: 102, volume: 1000 },
      { date: '2026-08-01', open: 102, high: 106, low: 99, close: 103, volume: 1100 },
    ];
    expect(() =>
      runBacktest({
        bars: dupBars,
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
      })
    ).toThrow(InvalidBarDataError);

    // Malformed OHLC bounds (high < low)
    const badOhlcBars: DailyBar[] = [
      { date: '2026-08-01', open: 100, high: 90, low: 95, close: 98, volume: 1000 },
    ];
    expect(() =>
      runBacktest({
        bars: badOhlcBars,
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 10000,
        positionSizing: DEFAULT_SIZING,
        feeConfig: DEFAULT_TEST_FEES,
        rules: validRules,
      })
    ).toThrow(InvalidBarDataError);
  });
});

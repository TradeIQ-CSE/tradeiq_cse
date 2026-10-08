import { BacktestInput } from '../domain/types';
import { InvalidBarDataError, InvalidDateRangeError } from '../domain/errors';
import { isValidDateFormat } from '../engine/barValidator';
import { runBacktest } from '../engine/runBacktest';
import {
  createSampleBars,
  DEFAULT_SIZING,
  DEFAULT_TEST_FEES,
} from './fixtures';

describe('Backtest calendar dates', () => {
  it.each(['2024-02-29', '2000-02-29', '2025-04-30', '2025-12-31'])(
    'accepts the valid calendar date %s',
    (date) => {
      expect(isValidDateFormat(date)).toBe(true);
    },
  );

  it.each([
    '2025-02-29',
    '2026-02-30',
    '1900-02-29',
    '2025-04-31',
    '2025-00-01',
    '2025-13-01',
    '2025-01-00',
    '2025-01-32',
    '2025-1-01',
    '2025-01-01T00:00:00Z',
    '',
  ])('rejects the invalid calendar date %s', (date) => {
    expect(isValidDateFormat(date)).toBe(false);
  });

  it.each([undefined, null, 20250228])(
    'rejects a non-string date %s',
    (date) => {
      expect(isValidDateFormat(date as unknown as string)).toBe(false);
    },
  );

  describe.each(['1.0', '2.0'])('strategy version %s', (version) => {
    const input = (): BacktestInput => ({
      bars: createSampleBars()
        .slice(0, 2)
        .map((bar, index) => ({
          ...bar,
          date: index === 0 ? '2026-02-28' : '2026-03-01',
        })),
      startDate: '2026-02-01',
      endDate: '2026-03-05',
      initialCapital: 1000,
      positionSizing: DEFAULT_SIZING,
      feeConfig: DEFAULT_TEST_FEES,
      rules: {
        version,
        buyCondition: { type: 'period_start' },
        sellConditions: [{ type: 'end_of_period' }],
        ...(version === '2.0'
          ? {
              reentryCondition: {
                type: 'price_falls_pct_from_last_sell' as const,
                value: 5,
              },
            }
          : {}),
      },
    });

    it.each(['startDate', 'endDate'] as const)(
      'rejects an impossible %s with the date-range error',
      (field) => {
        const fixture = input();
        fixture[field] = '2026-02-30';
        expect(() => runBacktest(fixture)).toThrow(InvalidDateRangeError);
      },
    );

    it('rejects an impossible bar date with the bar-data error', () => {
      const fixture = input();
      fixture.bars[0].date = '2026-02-30';
      expect(() => runBacktest(fixture)).toThrow(InvalidBarDataError);
    });

    it('executes a backtest over a valid leap day', () => {
      const fixture = input();
      fixture.bars = fixture.bars.slice(0, 2).map((bar, index) => ({
        ...bar,
        date: index === 0 ? '2024-02-29' : '2024-03-01',
      }));
      fixture.startDate = '2024-02-29';
      fixture.endDate = '2024-03-01';
      expect(
        runBacktest(fixture).equityCurve.map((point) => point.date),
      ).toEqual(['2024-02-29', '2024-03-01']);
    });
  });
});

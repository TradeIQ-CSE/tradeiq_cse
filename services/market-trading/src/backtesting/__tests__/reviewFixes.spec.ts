import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES } from './fixtures';
import { DailyBar, RuleSet } from '../domain/types';
import { InvalidCapitalError } from '../domain/errors';
import { round4 } from '../domain/rounding';

const bar = (date: string, price: number): DailyBar => ({
  date,
  open: price,
  high: price,
  low: price,
  close: price,
  volume: 1000,
});

// Buys at period start. The take-profit is set far out of reach so it never
// triggers, leaving the forced end-of-period exit as the only way out.
// sellConditions cannot be empty: validateRule requires at least one.
const BUY_AND_HOLD: RuleSet = {
  version: 'v1',
  buyCondition: { type: 'period_start' },
  sellConditions: [{ type: 'take_profit_pct', value: 500 }],
};

describe('review fixes', () => {
  describe('invalid capital reports its own error code', () => {
    // Previously threw InvalidDateRangeError, telling a caller the dates were
    // wrong when the capital was.
    it.each([0, -1])('rejects initialCapital %i', (capital) => {
      expect(() =>
        runBacktest({
          rules: BUY_AND_HOLD,
          bars: [bar('2026-08-03', 100)],
          startDate: '2026-08-03',
          endDate: '2026-08-03',
          initialCapital: capital,
          feeConfig: DEFAULT_TEST_FEES,
          positionSizing: { type: 'full_capital' },
        }),
      ).toThrow(InvalidCapitalError);
    });
  });

  describe('fixed_quantity buys the quantity requested', () => {
    // 100 shares at 10.00 costs 1,000 gross plus 11.20 of fees. With exactly
    // 1,011.20 available the order is affordable to the cent, but the old
    // affordability estimate divided by an unrounded fee rate:
    // 1011.20 / (10 x 1.0112) lands a hair under 100 in binary floating point
    // and floored to 99. The fixture has to sit exactly on that boundary —
    // any spare cash and both the old and new code buy all 100.
    it('buys all 100 shares when the cash covers them exactly', () => {
      const result = runBacktest({
        rules: BUY_AND_HOLD,
        bars: [bar('2026-08-03', 10), bar('2026-08-04', 10)],
        startDate: '2026-08-03',
        endDate: '2026-08-04',
        initialCapital: 1011.2,
        feeConfig: DEFAULT_TEST_FEES,
        positionSizing: { type: 'fixed_quantity', value: 100 },
      });

      const buy = result.trades.find((t) => t.type === 'BUY');
      expect(buy?.quantity).toBe(100);
      expect(buy?.netCashFlow).toBe(round4(-1011.2));
    });

    it('still trims to what is affordable when the cash falls short', () => {
      const result = runBacktest({
        rules: BUY_AND_HOLD,
        bars: [bar('2026-08-03', 10), bar('2026-08-04', 10)],
        startDate: '2026-08-03',
        endDate: '2026-08-04',
        initialCapital: 900,
        feeConfig: DEFAULT_TEST_FEES,
        positionSizing: { type: 'fixed_quantity', value: 100 },
      });

      // 900 covers 89 shares (890 gross + 9.968 fees), not 90.
      expect(result.trades.find((t) => t.type === 'BUY')?.quantity).toBe(89);
    });
  });

  describe('a position opened on the final bar is closed', () => {
    // The sell branch is an `else if`, so it cannot run on the bar that opened
    // the position — and with a single bar there is no later one. The forced
    // exit used to be skipped, leaving an unmatched BUY.
    const singleBar = () =>
      runBacktest({
        rules: BUY_AND_HOLD,
        bars: [bar('2026-08-03', 100)],
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        initialCapital: 10000,
        feeConfig: DEFAULT_TEST_FEES,
        positionSizing: { type: 'fixed_quantity', value: 10 },
      });

    it('records a matching end_of_period sell', () => {
      const result = singleBar();
      const sells = result.trades.filter((t) => t.type === 'SELL');

      expect(sells).toHaveLength(1);
      expect(sells[0].reason).toBe('end_of_period');
      expect(sells[0].quantity).toBe(10);
    });

    it('ends flat, with cash and equity in agreement', () => {
      const result = singleBar();

      expect(result.finalCash).toBe(result.finalEquity);

      const last = result.equityCurve[result.equityCurve.length - 1];
      expect(last.positionQuantity).toBe(0);
      expect(last.positionMarketValue).toBe(0);
      expect(last.totalEquity).toBe(result.finalCash);
    });

    it('charges fees on both legs of the round trip', () => {
      const result = singleBar();

      // Two legs, so two fee charges. Asserting the count matters: the
      // accounting identity below holds even with the sell missing, because
      // equity then counts the open position at the same price it was bought.
      expect(result.trades).toHaveLength(2);

      const fees = result.trades.reduce((sum, t) => sum + t.fees.total, 0);
      expect(round4(result.finalEquity + fees)).toBe(10000);
    });
  });
});

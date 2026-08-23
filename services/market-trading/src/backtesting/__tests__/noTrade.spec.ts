import { runBacktest } from '../engine/runBacktest';
import {
  DEFAULT_TEST_FEES,
  DEFAULT_SIZING,
  createSampleBars,
} from './fixtures';
import { RuleSet } from '../domain/types';

describe('Backtesting Engine - No Trade', () => {
  it('should not execute any trades if the buy condition is never met', () => {
    const bars = createSampleBars();
    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'price_falls_to', value: 80 }, // Price never falls to 80
      sellConditions: [{ type: 'take_profit_pct', value: 5 }],
    };

    const initialCapital = 10000;
    const result = runBacktest({
      bars,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      initialCapital,
      positionSizing: DEFAULT_SIZING,
      feeConfig: DEFAULT_TEST_FEES,
      rules,
    });

    expect(result.trades.length).toBe(0);
    expect(result.finalCash).toBe(initialCapital);
    expect(result.finalEquity).toBe(initialCapital);

    // Verify equity curve is populated correctly with no positions
    expect(result.equityCurve.length).toBe(5);
    for (const point of result.equityCurve) {
      expect(point.cash).toBe(initialCapital);
      expect(point.positionQuantity).toBe(0);
      expect(point.positionMarketValue).toBe(0);
      expect(point.totalEquity).toBe(initialCapital);
    }
  });
});

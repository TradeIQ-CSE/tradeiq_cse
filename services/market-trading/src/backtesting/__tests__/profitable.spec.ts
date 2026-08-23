import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING, createSampleBars } from './fixtures';
import { RuleSet } from '../domain/types';
import { round4 } from '../domain/rounding';

describe('Backtesting Engine - Profitable Trade', () => {
  it('should successfully buy on period_start and exit via take-profit', () => {
    const bars = createSampleBars();
    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'take_profit_pct', value: 5 }, // TP at 105 (100 * 1.05)
      ],
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

    expect(result.trades.length).toBe(2);

    const buyTrade = result.trades[0];
    expect(buyTrade.type).toBe('BUY');
    expect(buyTrade.date).toBe('2026-08-01');
    expect(buyTrade.executionPrice).toBe(100);

    const sellTrade = result.trades[1];
    expect(sellTrade.type).toBe('SELL');
    expect(sellTrade.date).toBe('2026-08-03');
    expect(sellTrade.executionPrice).toBe(105);
    expect(sellTrade.reason).toBe('take_profit_pct(5%)');

    // Verify cash-flow reconciliation invariant
    const totalBuyGross = buyTrade.grossValue;
    const totalBuyFees = buyTrade.fees.total;
    const totalSellGross = sellTrade.grossValue;
    const totalSellFees = sellTrade.fees.total;

    const expectedFinalCash = round4(
      initialCapital - totalBuyGross - totalBuyFees + totalSellGross - totalSellFees
    );
    expect(result.finalCash).toBe(expectedFinalCash);
    expect(result.finalEquity).toBe(result.finalCash);

    // Verify stable structure of the daily equity curve
    expect(result.equityCurve.length).toBe(5);
    expect(result.equityCurve[0].date).toBe('2026-08-01');
    expect(result.equityCurve[4].date).toBe('2026-08-05');
  });
});

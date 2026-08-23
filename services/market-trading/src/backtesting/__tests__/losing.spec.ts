import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING, createSampleBars } from './fixtures';
import { RuleSet } from '../domain/types';
import { round4 } from '../domain/rounding';

describe('Backtesting Engine - Losing Trade', () => {
  it('should successfully buy on period_start and exit via stop-loss', () => {
    const bars = createSampleBars();
    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'stop_loss_pct', value: 5 }, // SL at 95 (100 * 0.95)
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

    const sellTrade = result.trades[1];
    expect(sellTrade.type).toBe('SELL');
    expect(sellTrade.date).toBe('2026-08-02');
    expect(sellTrade.executionPrice).toBe(95);
    expect(sellTrade.reason).toBe('stop_loss_pct(5%)');

    const expectedFinalCash = round4(
      initialCapital -
        buyTrade.grossValue -
        buyTrade.fees.total +
        sellTrade.grossValue -
        sellTrade.fees.total
    );
    expect(result.finalCash).toBe(expectedFinalCash);
  });
});

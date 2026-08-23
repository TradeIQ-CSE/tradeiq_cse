import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING, createSampleBars } from './fixtures';
import { RuleSet } from '../domain/types';

describe('Backtesting Engine - End of Period Exit', () => {
  it('should force-exit at the close price of the last bar if a position is still open', () => {
    const bars = createSampleBars();
    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'take_profit_pct', value: 50 }, // Set very high so it does not trigger during the run
      ],
    };

    const result = runBacktest({
      bars,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      initialCapital: 10000,
      positionSizing: DEFAULT_SIZING,
      feeConfig: DEFAULT_TEST_FEES,
      rules,
    });

    expect(result.trades.length).toBe(2);

    const buyTrade = result.trades[0];
    expect(buyTrade.type).toBe('BUY');

    const sellTrade = result.trades[1];
    expect(sellTrade.type).toBe('SELL');
    expect(sellTrade.date).toBe('2026-08-05'); // Last bar date
    expect(sellTrade.executionPrice).toBe(118); // Close of 2026-08-05 is 118
    expect(sellTrade.reason).toBe('end_of_period');
  });
});

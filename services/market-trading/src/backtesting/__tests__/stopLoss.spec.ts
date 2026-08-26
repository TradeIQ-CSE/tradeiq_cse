import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING } from './fixtures';
import { RuleSet, DailyBar } from '../domain/types';

describe('Backtesting Engine - Stop Loss Execution', () => {
  it('should execute stop-loss at the open price if the price gaps down below the stop-loss threshold', () => {
    const bars: DailyBar[] = [
      {
        date: '2026-08-01',
        open: 100,
        high: 102,
        low: 99,
        close: 100,
        volume: 100,
      },
      {
        date: '2026-08-02',
        open: 92,
        high: 93,
        low: 90,
        close: 91,
        volume: 100,
      }, // Gaps down to 92 (SL threshold was 95)
    ];

    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'stop_loss_pct', value: 5 }, // SL at 95 (100 * 0.95)
      ],
    };

    const result = runBacktest({
      bars,
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      initialCapital: 10000,
      positionSizing: DEFAULT_SIZING,
      feeConfig: DEFAULT_TEST_FEES,
      rules,
    });

    expect(result.trades.length).toBe(2);
    const sellTrade = result.trades[1];
    expect(sellTrade.type).toBe('SELL');
    expect(sellTrade.executionPrice).toBe(92); // Executed at Open (92) due to gap down
    expect(sellTrade.reason).toBe('stop_loss_pct(5%)');
  });
});

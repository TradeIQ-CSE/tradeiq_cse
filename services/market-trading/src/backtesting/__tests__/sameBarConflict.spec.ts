import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING } from './fixtures';
import { RuleSet, DailyBar } from '../domain/types';

describe('Backtesting Engine - Same-Bar Conflict Precedence', () => {
  it('should prefer stop-loss over take-profit when both are hit on the same bar', () => {
    const bars: DailyBar[] = [
      { date: '2026-08-01', open: 100, high: 101, low: 99, close: 100, volume: 100 },
      { date: '2026-08-02', open: 100, high: 106, low: 94, close: 98, volume: 100 }, // High: 106 (TP 105 hit), Low: 94 (SL 95 hit)
    ];

    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'stop_loss_pct', value: 5 }, // SL at 95 (100 * 0.95)
        { type: 'take_profit_pct', value: 5 }, // TP at 105 (100 * 1.05)
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
    expect(sellTrade.executionPrice).toBe(95); // Stop loss price 95 (preferred over take-profit price 105)
    expect(sellTrade.reason).toBe('stop_loss_pct(5%)');
  });
});

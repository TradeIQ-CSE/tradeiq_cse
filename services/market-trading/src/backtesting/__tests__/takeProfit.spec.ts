import { runBacktest } from '../engine/runBacktest';
import { DEFAULT_TEST_FEES, DEFAULT_SIZING } from './fixtures';
import { RuleSet, DailyBar } from '../domain/types';

describe('Backtesting Engine - Take Profit Execution', () => {
  it('should execute take-profit at the open price if the price gaps up above the take-profit threshold', () => {
    const bars: DailyBar[] = [
      { date: '2026-08-01', open: 100, high: 102, low: 99, close: 100, volume: 100 },
      { date: '2026-08-02', open: 108, high: 110, low: 107, close: 109, volume: 100 }, // Gaps up to 108 (TP threshold was 105)
    ];

    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
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
    expect(sellTrade.executionPrice).toBe(108); // Executed at Open (108) due to gap up
    expect(sellTrade.reason).toBe('take_profit_pct(5%)');
  });
});

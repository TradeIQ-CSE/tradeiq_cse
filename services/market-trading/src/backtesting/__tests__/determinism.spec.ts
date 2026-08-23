import { runBacktest } from '../engine/runBacktest';
import {
  DEFAULT_TEST_FEES,
  DEFAULT_SIZING,
  createSampleBars,
} from './fixtures';
import { RuleSet } from '../domain/types';

describe('Backtesting Engine - Determinism', () => {
  it('should produce byte-for-byte equivalent results on repeated executions with identical inputs', () => {
    const bars = createSampleBars();
    const rules: RuleSet = {
      version: '1.0',
      buyCondition: { type: 'period_start' },
      sellConditions: [
        { type: 'take_profit_pct', value: 5 },
        { type: 'stop_loss_pct', value: 5 },
      ],
    };

    const input = {
      bars,
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      initialCapital: 10000,
      positionSizing: DEFAULT_SIZING,
      feeConfig: DEFAULT_TEST_FEES,
      rules,
    };

    const run1 = runBacktest(input);
    const run2 = runBacktest(input);
    const run3 = runBacktest(input);

    const serialized1 = JSON.stringify(run1);
    const serialized2 = JSON.stringify(run2);
    const serialized3 = JSON.stringify(run3);

    expect(serialized2).toBe(serialized1);
    expect(serialized3).toBe(serialized1);

    // Verify all trade IDs and ordering are completely deterministic and stable
    expect(run1.trades.length).toBeGreaterThan(0);
    run1.trades.forEach((trade, idx) => {
      expect(trade.id).toBe(idx + 1);
    });
  });
});

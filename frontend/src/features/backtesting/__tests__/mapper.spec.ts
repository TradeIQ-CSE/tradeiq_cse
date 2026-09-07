import { describe, it, expect } from 'vitest';
import { mapToBacktestRequest } from '../domain/mapper';
import { createDefaultBacktestConfig } from '../domain/defaults';

describe('mapToBacktestRequest', () => {
  it('should format valid default configuration to match CreateBacktestRunDto contract', () => {
    const config = createDefaultBacktestConfig();
    const dto = mapToBacktestRequest(config);

    expect(dto).toEqual({
      symbol: 'JKH.N0000',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      startingCapital: 1000000,
      rule: {
        buy: {
          type: 'period_start',
        },
        sell: [
          { type: 'take_profit_pct', value: 10 },
          { type: 'stop_loss_pct', value: 5 },
          { type: 'end_of_period' },
        ],
      },
      feeConfig: {
        brokerageRate: 0.0064,
        cseRate: 0.00084,
        cdsRate: 0.00024,
        secCessRate: 0.00072,
        stlRate: 0.003,
      },
      positionSizing: {
        type: 'full_capital',
      },
      warmupPeriod: 0,
    });
  });

  it('should properly include buy value when condition is parameterized', () => {
    const config = createDefaultBacktestConfig();
    config.rules.buy = {
      type: 'price_falls_pct_from_period_start',
      value: 7.5,
    };

    const dto = mapToBacktestRequest(config);
    expect(dto.rule.buy).toEqual({
      type: 'price_falls_pct_from_period_start',
      value: 7.5,
    });
  });

  it('should properly serialize percentage position sizing value', () => {
    const config = createDefaultBacktestConfig();
    config.execution.positionSizing = {
      type: 'percentage',
      value: 25,
    };

    const dto = mapToBacktestRequest(config);
    expect(dto.positionSizing).toEqual({
      type: 'percentage',
      value: 25,
    });
  });

  it('should trim string inputs to prevent boundary whitespace errors', () => {
    const config = createDefaultBacktestConfig();
    config.security.symbol = '  COMB.N0000  ';
    config.period.startDate = ' 2023-01-01 ';
    config.period.endDate = ' 2023-12-31 ';

    const dto = mapToBacktestRequest(config);
    expect(dto.symbol).toBe('COMB.N0000');
    expect(dto.startDate).toBe('2023-01-01');
    expect(dto.endDate).toBe('2023-12-31');
  });
});

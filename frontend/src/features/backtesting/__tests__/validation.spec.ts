import { describe, it, expect } from 'vitest';
import { validateBacktestConfig } from '../domain/validation';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { BacktestConfig } from '../domain/types';

describe('validateBacktestConfig', () => {
  it('should accept the minimum valid configuration', () => {
    const config = createDefaultBacktestConfig();
    const result = validateBacktestConfig(config);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('Security Validation', () => {
    it('should reject missing security symbol', () => {
      const config = createDefaultBacktestConfig();
      config.security.symbol = '';

      const result = validateBacktestConfig(config, 'security');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'security', field: 'symbol' }),
        ]),
      );
    });

    it('should reject whitespace-only security symbol', () => {
      const config = createDefaultBacktestConfig();
      config.security.symbol = '   ';

      const result = validateBacktestConfig(config, 'security');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('symbol');
    });
  });

  describe('Period Validation', () => {
    it('should reject missing start date', () => {
      const config = createDefaultBacktestConfig();
      config.period.startDate = '';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'period', field: 'startDate' }),
        ]),
      );
    });

    it('should reject missing end date', () => {
      const config = createDefaultBacktestConfig();
      config.period.endDate = '';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'period', field: 'endDate' }),
        ]),
      );
    });

    it('should reject start date greater than or equal to end date', () => {
      const config = createDefaultBacktestConfig();
      config.period.startDate = '2024-12-31';
      config.period.endDate = '2024-01-01';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: 'period',
            field: 'startDate',
            message: 'Start date must be strictly before end date.',
          }),
        ]),
      );
    });

    it('should reject same start and end date', () => {
      const config = createDefaultBacktestConfig();
      config.period.startDate = '2024-05-01';
      config.period.endDate = '2024-05-01';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe('Start date must be strictly before end date.');
    });

    it('should reject start date before 2017 dataset boundary', () => {
      const config = createDefaultBacktestConfig();
      config.period.startDate = '2016-12-31';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'startDate',
            message: expect.stringContaining('cannot precede the available dataset coverage (2017-01-01)'),
          }),
        ]),
      );
    });

    it('should reject end date after 2025 dataset boundary', () => {
      const config = createDefaultBacktestConfig();
      config.period.endDate = '2026-01-01';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'endDate',
            message: expect.stringContaining('cannot exceed the available dataset coverage (2025-12-31)'),
          }),
        ]),
      );
    });

    it('should reject dates outside security-specific coverage window', () => {
      const config = createDefaultBacktestConfig();
      config.security.dataFrom = '2020-01-01';
      config.security.dataTo = '2024-12-31';

      config.period.startDate = '2019-06-01';
      config.period.endDate = '2025-06-01';

      const result = validateBacktestConfig(config, 'period');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'startDate' }),
          expect.objectContaining({ field: 'endDate' }),
        ]),
      );
    });
  });

  describe('Rules Validation (v1 Price DSL)', () => {
    it('should reject missing buy condition', () => {
      const config = createDefaultBacktestConfig();
      // @ts-expect-error test invalid buy condition
      config.rules.buy = null;

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'rules', field: 'buy' }),
        ]),
      );
    });

    it('should reject indicator-based buy condition', () => {
      const config = createDefaultBacktestConfig();
      // @ts-expect-error test unsupported indicator
      config.rules.buy = { type: 'rsi_oversold', value: 30 };

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Indicator strategies are not supported in v1 DSL');
    });

    it('should reject price_falls_to with missing or non-positive price', () => {
      const config = createDefaultBacktestConfig();
      config.rules.buy = { type: 'price_falls_to', value: 0 };

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('buy.value');
      expect(result.errors[0].message).toContain('positive number greater than 0 LKR');
    });

    it('should reject price_falls_pct_from_period_start with invalid percentage', () => {
      const config = createDefaultBacktestConfig();
      config.rules.buy = { type: 'price_falls_pct_from_period_start', value: 120 };

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('buy.value');
      expect(result.errors[0].message).toContain('less than 100%');
    });

    it('should reject empty sell conditions array', () => {
      const config = createDefaultBacktestConfig();
      config.rules.sells = [];

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'rules', field: 'sells', message: 'At least one sell condition is required.' }),
        ]),
      );
    });

    it('should reject duplicate sell rule types', () => {
      const config = createDefaultBacktestConfig();
      config.rules.sells = [
        { type: 'take_profit_pct', value: 10 },
        { type: 'take_profit_pct', value: 20 },
      ];

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Duplicate sell condition');
    });

    it('should reject invalid take profit percentages (> 1000% or <= 0)', () => {
      const config = createDefaultBacktestConfig();
      config.rules.sells = [{ type: 'take_profit_pct', value: 2500 }];

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('cannot exceed 1000%');
    });

    it('should reject invalid stop loss percentage (>= 100%)', () => {
      const config = createDefaultBacktestConfig();
      config.rules.sells = [{ type: 'stop_loss_pct', value: 100 }];

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('less than 100%');
    });

    it('should reject incompatible price target combinations where exit <= entry', () => {
      const config = createDefaultBacktestConfig();
      config.rules.buy = { type: 'price_falls_to', value: 100 };
      config.rules.sells = [{ type: 'target_price', value: 95 }];

      const result = validateBacktestConfig(config, 'rules');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('Incompatible rules: Target exit price (95 LKR) must be higher than buy price (100 LKR)');
    });
  });

  describe('Execution Validation', () => {
    it('should reject percentage position sizing <= 0 or > 100', () => {
      const config = createDefaultBacktestConfig();
      config.execution.positionSizing = { type: 'percentage', value: 150 };

      const result = validateBacktestConfig(config, 'execution');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('positionSizing.value');
      expect(result.errors[0].message).toContain('between 1% and 100%');
    });

    it('should reject non-integer share quantities', () => {
      const config = createDefaultBacktestConfig();
      config.execution.positionSizing = { type: 'fixed_quantity', value: 10.5 };

      const result = validateBacktestConfig(config, 'execution');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('positive integer whole number');
    });

    it('should reject negative fee rates', () => {
      const config = createDefaultBacktestConfig();
      config.execution.fees.brokerageRate = -0.01;

      const result = validateBacktestConfig(config, 'execution');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('fees.brokerageRate');
    });
  });

  describe('Portfolio Validation', () => {
    it('should reject zero starting capital', () => {
      const config = createDefaultBacktestConfig();
      config.portfolio.startingCapital = 0;

      const result = validateBacktestConfig(config, 'portfolio');
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: 'portfolio', field: 'startingCapital' }),
        ]),
      );
    });

    it('should reject negative starting capital', () => {
      const config = createDefaultBacktestConfig();
      config.portfolio.startingCapital = -5000;

      const result = validateBacktestConfig(config, 'portfolio');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toContain('greater than 0 LKR');
    });
  });

  describe('Metrics Validation', () => {
    it('should reject empty metrics selection', () => {
      const config = createDefaultBacktestConfig();
      config.metrics.selected = [];

      const result = validateBacktestConfig(config, 'metrics');
      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('selected');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { createDefaultBacktestConfig, defaultBacktestPeriod } from '../domain/defaults';
import { createFreshBacktestDraft, restoreBacktestDraft, selectDraftSecurity, updateBacktestDraft } from '../domain/draft';
import { mapToBacktestRequest } from '../domain/mapper';
import { validateBacktestConfig } from '../domain/validation';

const security = { symbol: 'COMB.N0000', dataFrom: '2017-01-02', dataTo: '2025-12-31' };

describe('frontend backtest defaults and restoration', () => {
  it('populates a complete valid configuration after company selection', () => {
    const draft = selectDraftSecurity(createFreshBacktestDraft(), security);
    expect(validateBacktestConfig(draft.config).errors).toEqual([]);
    expect(draft.config.period).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(mapToBacktestRequest(draft.config)).toMatchObject({
      startingCapital: 1_000_000,
      positionSizing: { type: 'full_capital' },
      warmupPeriod: 0,
      rule: { buy: { type: 'period_start' }, sell: [
        { type: 'take_profit_pct', value: 10 },
        { type: 'stop_loss_pct', value: 5 },
        { type: 'end_of_period' },
      ] },
    });
  });

  it('clips the suggested year to shorter reported coverage', () => {
    expect(defaultBacktestPeriod('2025-09-01', '2025-12-31')).toEqual({
      startDate: '2025-09-01', endDate: '2025-12-31',
    });
  });

  it('handles leap years with calendar arithmetic', () => {
    expect(defaultBacktestPeriod('2017-01-01', '2024-02-29')).toEqual({
      startDate: '2023-03-01', endDate: '2024-02-29',
    });
  });

  it.each([
    [null, null], ['bad-date', 'bad-date'], ['2025-12-31', '2024-01-01'],
  ])('falls back safely for missing or invalid coverage: %s, %s', (from, to) => {
    expect(defaultBacktestPeriod(from, to)).toEqual(defaultBacktestPeriod());
  });

  it('continues following company coverage until dates are explicitly configured', () => {
    const draft = selectDraftSecurity(createFreshBacktestDraft(), security);
    expect(selectDraftSecurity(draft, { ...security, dataTo: '2024-12-31' }).config.period)
      .toEqual({ startDate: '2024-01-01', endDate: '2024-12-31' });
    const custom = updateBacktestDraft(draft, { period: { startDate: '2020-01-01', endDate: '2020-12-31' } });
    expect(selectDraftSecurity(custom, { ...security, dataFrom: '2025-01-01' }).config.period)
      .toEqual(custom.config.period);
    expect(custom.periodUsesCoverageDefault).toBe(false);
  });

  it('preserves a restored custom draft and equivalent API payload exactly', () => {
    const config = createDefaultBacktestConfig();
    config.security = { ...config.security, ...security };
    config.period = { startDate: '2023-02-01', endDate: '2023-09-01' };
    config.execution.positionSizing = { type: 'fixed_quantity', value: 125 };
    config.execution.fees.brokerageRate = 0.009;
    config.portfolio.startingCapital = 500_000;
    const restored = restoreBacktestDraft(JSON.parse(JSON.stringify(config)));
    expect(restored.config).toEqual(config);
    expect(mapToBacktestRequest(restored.config)).toEqual(mapToBacktestRequest(config));
    expect(selectDraftSecurity(restored, security).config.period).toEqual(config.period);
  });

  it('fills missing nested defaults in older drafts without replacing their rules', () => {
    const restored = restoreBacktestDraft({
      security,
      period: { startDate: '2024-01-01', endDate: '2024-12-31' },
      rules: { buy: { type: 'price_falls_to', value: 100 }, sells: [{ type: 'end_of_period' }] },
      execution: { fees: { brokerageRate: 0.009 }, positionSizing: { type: 'absolute', value: 200_000 } },
    });
    expect(restored.config.execution.fees).toMatchObject({ brokerageRate: 0.009, stlRate: 0.003 });
    expect(restored.config.execution.positionSizing).toEqual({ type: 'absolute', value: 200_000 });
    expect(restored.config.portfolio.startingCapital).toBe(1_000_000);
    expect(validateBacktestConfig(restored.config).errors).toEqual([]);
  });

  it('does not mask invalid custom numbers with fresh defaults', () => {
    const config = createDefaultBacktestConfig();
    config.security = security;
    config.portfolio.startingCapital = -1;
    expect(restoreBacktestDraft(config).config.portfolio.startingCapital).toBe(-1);
    expect(validateBacktestConfig(restoreBacktestDraft(config).config).isValid).toBe(false);
  });

  it('preserves automatic-period intent across draft serialization', () => {
    const draft = createFreshBacktestDraft();
    const restored = restoreBacktestDraft({ ...draft.config, periodUsesCoverageDefault: true });
    expect(restored.periodUsesCoverageDefault).toBe(true);
    expect(selectDraftSecurity(restored, { ...security, dataTo: '2024-12-31' }).config.period.endDate).toBe('2024-12-31');
  });

  it.each([null, [], {}, { security: {}, period: {}, rules: {} }])('recovers unusable saved data: %s', (value) => {
    expect(restoreBacktestDraft(value)).toEqual(createFreshBacktestDraft());
  });

  it('creates independent nested defaults for each draft', () => {
    const first = createFreshBacktestDraft();
    first.config.rules.sells[0].value = 99;
    first.config.execution.fees.brokerageRate = 0;
    expect(createFreshBacktestDraft().config.rules.sells[0].value).toBe(10);
    expect(createFreshBacktestDraft().config.execution.fees.brokerageRate).toBe(0.0064);
  });
});

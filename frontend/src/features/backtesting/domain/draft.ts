import { createDefaultBacktestConfig, defaultBacktestPeriod } from './defaults';
import type { BacktestConfig, SecuritySelection } from './types';
import type { DataGap } from '../../../lib/data-gaps';

export interface BacktestDraft {
  config: BacktestConfig;
  periodUsesCoverageDefault: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function createFreshBacktestDraft(): BacktestDraft {
  return { config: createDefaultBacktestConfig(), periodUsesCoverageDefault: true };
}

/** Fill missing draft sections without resetting existing custom input values. */
export function restoreBacktestDraft(value: unknown): BacktestDraft {
  const saved = object(value);
  if (!Object.keys(object(saved.security)).length ||
      !Object.keys(object(saved.period)).length ||
      !Object.keys(object(saved.rules)).length) return createFreshBacktestDraft();

  const defaults = createDefaultBacktestConfig();
  const rules = object(saved.rules);
  const execution = object(saved.execution);
  const metrics = object(saved.metrics);
  const config = {
    security: { ...defaults.security, ...object(saved.security) },
    period: { ...defaults.period, ...object(saved.period) },
    rules: {
      buy: { ...defaults.rules.buy, ...object(rules.buy) },
      sells: Array.isArray(rules.sells) ? rules.sells : defaults.rules.sells,
    },
    execution: {
      ...defaults.execution,
      ...execution,
      positionSizing: { ...defaults.execution.positionSizing, ...object(execution.positionSizing) },
      fees: { ...defaults.execution.fees, ...object(execution.fees) },
      rounding: { ...defaults.execution.rounding, ...object(execution.rounding) },
    },
    portfolio: { ...defaults.portfolio, ...object(saved.portfolio) },
    metrics: { selected: Array.isArray(metrics.selected) ? metrics.selected : defaults.metrics.selected },
  } as BacktestConfig;
  // Legacy drafts lack this marker: their chosen dates must remain untouched.
  return { config, periodUsesCoverageDefault: saved.periodUsesCoverageDefault === true };
}

/** `gaps` (the security's price gaps) is optional so a caller with no
 * coverage loaded yet still gets the un-gap-aware suggestion rather than
 * blocking on it — see `defaultBacktestPeriod`. */
export function selectDraftSecurity(
  draft: BacktestDraft,
  security: SecuritySelection,
  gaps: readonly DataGap[] = [],
): BacktestDraft {
  return {
    config: {
      ...draft.config,
      security,
      period: draft.periodUsesCoverageDefault
        ? defaultBacktestPeriod(security.dataFrom, security.dataTo, gaps)
        : draft.config.period,
    },
    periodUsesCoverageDefault: draft.periodUsesCoverageDefault,
  };
}

export function updateBacktestDraft(
  draft: BacktestDraft,
  patch: Partial<BacktestConfig> | ((previous: BacktestConfig) => BacktestConfig),
): BacktestDraft {
  const config = typeof patch === 'function' ? patch(draft.config) : { ...draft.config, ...patch };
  const datesChanged = config.period !== draft.config.period || config.period.startDate !== draft.config.period.startDate ||
    config.period.endDate !== draft.config.period.endDate;
  return {
    config,
    periodUsesCoverageDefault: draft.periodUsesCoverageDefault && !datesChanged,
  };
}

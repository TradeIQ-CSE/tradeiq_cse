import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { AVAILABLE_METRICS } from '../domain/defaults';

export const MetricsStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('metrics');
  const metricsError = errors.find((e) => e.field === 'selected');

  const selectedMetrics = config.metrics?.selected || [];

  const handleToggleMetric = (id: string) => {
    const exists = selectedMetrics.includes(id);
    let next: string[];
    if (exists) {
      next = selectedMetrics.filter((m) => m !== id);
    } else {
      next = [...selectedMetrics, id];
    }

    updateConfig((prev) => ({
      ...prev,
      metrics: {
        selected: next,
      },
    }));
  };

  const selectAll = () => {
    updateConfig((prev) => ({
      ...prev,
      metrics: {
        selected: AVAILABLE_METRICS.map((m) => m.id),
      },
    }));
  };

  return (
    <div className="metrics-step">
      <div className="step-header">
        <h2 className="step-header__title">6. Analytics & Performance Metrics</h2>
        <p className="step-header__desc">
          Select key risk and return metrics to highlight in the simulation summary and analytics reports.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Selected ({selectedMetrics.length} of {AVAILABLE_METRICS.length})
        </span>
        <button type="button" className="chip-btn" onClick={selectAll}>
          Select All Metrics
        </button>
      </div>

      {metricsError && <div className="form-error-text" style={{ marginBottom: '12px' }}>{metricsError.message}</div>}

      <div className="grid-2">
        {AVAILABLE_METRICS.map((metric) => {
          const isSelected = selectedMetrics.includes(metric.id);

          return (
            <div
              key={metric.id}
              className={`option-card ${isSelected ? 'option-card--selected' : ''}`}
              onClick={() => handleToggleMetric(metric.id)}
              role="checkbox"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleToggleMetric(metric.id);
                }
              }}
            >
              <div className="option-card__header">
                <span className="option-card__title">{metric.name}</span>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleMetric(metric.id)}
                  style={{ accentColor: 'var(--accent)' }}
                />
              </div>
              <p className="option-card__desc">{metric.description}</p>
            </div>
          );
        })}
      </div>

      <div className="info-banner" style={{ marginTop: '24px' }}>
        <span>📊</span>
        <span>
          Regardless of the summary metrics selected, the TradeIQ backtest engine will calculate and persist the full trade ledger entries and daily portfolio equity curve.
        </span>
      </div>
    </div>
  );
};

import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { CAPITAL_PRESETS } from '../domain/defaults';

export const PortfolioStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('portfolio');
  const capitalError = errors.find((e) => e.field === 'startingCapital');

  const startingCapital = config.portfolio?.startingCapital ?? 1_000_000;

  const handleCapitalChange = (val: number) => {
    updateConfig((prev) => ({
      ...prev,
      portfolio: {
        ...prev.portfolio,
        startingCapital: val,
      },
    }));
  };

  return (
    <div className="portfolio-step">
      <div className="step-header">
        <h2 className="step-header__title">5. Portfolio & Initial Capital</h2>
        <p className="step-header__desc">
          Set the starting liquid cash balance allocated to the strategy simulation in Sri Lankan Rupees (LKR).
        </p>
      </div>

      <div className="form-group" style={{ maxWidth: '460px' }}>
        <label htmlFor="portfolio-starting-capital" className="form-label">
          <span>Starting Capital (LKR)</span>
          <span className="form-label__hint">Min: Rs. 1.00</span>
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: '14px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            Rs.
          </span>
          <input
            id="portfolio-starting-capital"
            type="number"
            className={`form-input ${capitalError ? 'form-input--error' : ''}`}
            style={{ paddingLeft: '44px', fontSize: '16px', fontWeight: 600 }}
            value={isNaN(startingCapital) ? '' : startingCapital}
            min={1}
            step={1000}
            onChange={(e) => handleCapitalChange(parseFloat(e.target.value))}
          />
        </div>
        {capitalError && <span className="form-error-text">{capitalError.message}</span>}
      </div>

      {/* Quick Capital Preset Buttons */}
      <div style={{ marginTop: '16px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
          Quick Capital Presets
        </span>
        <div className="quick-chips">
          {CAPITAL_PRESETS.map((preset) => {
            const isActive = startingCapital === preset.value;
            return (
              <button
                type="button"
                key={preset.value}
                className={`chip-btn ${isActive ? 'chip-btn--active' : ''}`}
                onClick={() => handleCapitalChange(preset.value)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Capital Allocation Insight Box */}
      <div
        style={{
          marginTop: '32px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '16px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>💡</span>
          <span>
            With <strong>Rs. {startingCapital.toLocaleString()}</strong> initial capital and{' '}
            <strong>
              {config.execution.positionSizing.type === 'full_capital'
                ? '100% full capital allocation'
                : config.execution.positionSizing.type === 'percentage'
                ? `${config.execution.positionSizing.value ?? 50}% allocation`
                : `${config.execution.positionSizing.type} sizing`}
            </strong>
            , the backtest engine will model realistic CSE trade entries, deductions for 1.12% fees, and whole-share lot sizes.
          </span>
        </div>
      </div>
    </div>
  );
};

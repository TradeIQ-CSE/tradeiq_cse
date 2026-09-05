import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { V1_BUY_RULES, V1_SELL_RULES } from '../domain/v1Rules';
import { AVAILABLE_METRICS } from '../domain/defaults';

export const ReviewStep: React.FC = () => {
  const {
    config,
    goToStep,
    submitBacktest,
    isSubmitting,
    submitError,
    submitTraceId,
    submitFieldErrors,
    validationErrors,
    validateAllSteps,
  } = useBacktestWizard();

  // Validate all steps to ensure readiness
  const isValid = validationErrors.length === 0;

  // Format entry rule human readable
  const buyMeta = V1_BUY_RULES.find((r) => r.type === config.rules.buy.type);
  let entryText = buyMeta?.label || config.rules.buy.type;
  if (config.rules.buy.type === 'price_falls_pct_from_period_start') {
    entryText = `Price falls by ${config.rules.buy.value ?? 5}% from period reference price`;
  } else if (config.rules.buy.type === 'price_falls_to') {
    entryText = `Price falls to or below Rs. ${(config.rules.buy.value ?? 0).toFixed(2)}`;
  } else if (config.rules.buy.type === 'period_start') {
    entryText = 'Execute buy order on first day of period at market open';
  }

  // Format exit rules human readable
  const exitRulesList = config.rules.sells.map((sell) => {
    const meta = V1_SELL_RULES.find((r) => r.type === sell.type);
    if (sell.type === 'take_profit_pct') {
      return `Take profit target: +${sell.value ?? 10}% gain from entry price`;
    }
    if (sell.type === 'stop_loss_pct') {
      return `Stop loss limit: -${sell.value ?? 5}% loss from entry price`;
    }
    if (sell.type === 'target_price') {
      return `Target exit price: Rs. ${(sell.value ?? 0).toFixed(2)}`;
    }
    if (sell.type === 'end_of_period') {
      return 'End of period fallback: Close open position on the final simulation session';
    }
    return meta?.label || sell.type;
  });

  // Total fees rate
  const totalFeesPct = (
    (config.execution.fees.brokerageRate +
      config.execution.fees.cseRate +
      config.execution.fees.cdsRate +
      config.execution.fees.secCessRate +
      config.execution.fees.stlRate) *
    100
  ).toFixed(3);

  // Sizing description
  let sizingDesc = '100% full capital allocation';
  if (config.execution.positionSizing.type === 'percentage') {
    sizingDesc = `${config.execution.positionSizing.value ?? 50}% of portfolio equity per trade`;
  } else if (config.execution.positionSizing.type === 'absolute') {
    sizingDesc = `Rs. ${(config.execution.positionSizing.value ?? 0).toLocaleString()} fixed cash per trade`;
  } else if (config.execution.positionSizing.type === 'fixed_quantity') {
    sizingDesc = `${config.execution.positionSizing.value ?? 0} whole shares per trade`;
  }

  // Selected metrics names
  const selectedMetricNames = config.metrics.selected
    .map((id) => AVAILABLE_METRICS.find((m) => m.id === id)?.name || id)
    .join(', ');

  const handleRunClick = async () => {
    const ready = validateAllSteps();
    if (!ready) return;
    await submitBacktest();
  };

  return (
    <div className="review-step">
      <div className="step-header">
        <h2 className="step-header__title">7. Review Simulation Assumptions</h2>
        <p className="step-header__desc">
          Verify all model parameters before initiating the backtest simulation against the Colombo Stock Exchange dataset.
        </p>
      </div>

      {/* Validation Readiness Banner */}
      {isValid ? (
        <div className="info-banner info-banner--success" style={{ marginBottom: '20px' }}>
          <span>✓</span>
          <div>
            <strong style={{ color: 'var(--positive)' }}>Everything looks valid.</strong>
            <span style={{ display: 'block', fontSize: '12px' }}>
              Your strategy rules, historical date window, and execution parameters meet all client-side and backend contract constraints.
            </span>
          </div>
        </div>
      ) : (
        <div className="info-banner info-banner--warning" style={{ marginBottom: '20px' }}>
          <span>⚠️</span>
          <div>
            <strong style={{ color: '#ff9496' }}>Configuration Requires Attention</strong>
            <span style={{ display: 'block', fontSize: '12px' }}>
              Please resolve the {validationErrors.length} highlighted validation error(s) before running the backtest.
            </span>
          </div>
        </div>
      )}

      {/* API Submission Error Alert */}
      {submitError && (
        <div className="info-banner info-banner--warning" style={{ marginBottom: '20px', borderLeft: '4px solid var(--negative)' }}>
          <span style={{ fontSize: '18px' }}>❌</span>
          <div>
            <strong style={{ color: 'var(--negative)' }}>Submission Failed</strong>
            <div style={{ fontSize: '13px', marginTop: '2px' }}>{submitError}</div>
            {submitFieldErrors && submitFieldErrors.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '12px' }}>
                {submitFieldErrors.map((f, i) => (
                  <li key={i}>
                    <strong>{f.field}</strong>: {f.reason}
                  </li>
                ))}
              </ul>
            )}
            {submitTraceId && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Trace ID: <code>{submitTraceId}</code>
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Your parameters have been retained. You can modify any field and retry.
            </div>
          </div>
        </div>
      )}

      {/* Human-Readable Assumption Blocks */}

      {/* 1. Security */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Security</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('security')}>
            Edit
          </button>
        </div>
        <div className="review-item">
          <span className="review-item__label">CSE Ticker & Company</span>
          <span className="review-item__value">
            <span style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
              {config.security.symbol}
            </span>
            {config.security.companyName || 'CSE Listed Equity'}
            {config.security.sector ? ` (${config.security.sector})` : ''}
          </span>
        </div>
      </div>

      {/* 2. Period */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Simulation Period</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('period')}>
            Edit
          </button>
        </div>
        <div className="review-item">
          <span className="review-item__label">Date Window</span>
          <span className="review-item__value">
            {config.period.startDate} → {config.period.endDate}
          </span>
        </div>
      </div>

      {/* 3. Strategy Rules */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Strategy Rules (v1 Price DSL)</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('rules')}>
            Edit
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
              ENTRY RULE (EXACTLY 1)
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-heading)', fontWeight: 500 }}>
              {entryText}
            </span>
          </div>

          <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              EXIT RULES (FIRST TRIGGER WINS)
            </span>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {exitRulesList.map((ruleText, idx) => (
                <li key={idx} style={{ fontSize: '13px', color: 'var(--text-heading)' }}>
                  {ruleText}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 4. Execution Assumptions */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Execution Assumptions</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('execution')}>
            Edit
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="review-item">
            <span className="review-item__label">Position Sizing</span>
            <span className="review-item__value">{sizingDesc}</span>
          </div>
          <div className="review-item">
            <span className="review-item__label">CSE Statutory Fees</span>
            <span className="review-item__value">
              {totalFeesPct}% (Brokerage 0.64%, CSE 0.084%, CDS 0.024%, SEC Cess 0.072%, STL 0.30%)
            </span>
          </div>
          <div className="review-item">
            <span className="review-item__label">Price Precision</span>
            <span className="review-item__value">4 decimals (numeric 12,4)</span>
          </div>
          <div className="review-item">
            <span className="review-item__label">Quantity Rounding</span>
            <span className="review-item__value">Whole shares (floor division)</span>
          </div>
          <div className="review-item">
            <span className="review-item__label">Same-Bar Exit Priority</span>
            <span className="review-item__value">Stop Loss evaluated before Take Profit</span>
          </div>
        </div>
      </div>

      {/* 5. Portfolio & Capital */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Portfolio & Capital</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('portfolio')}>
            Edit
          </button>
        </div>
        <div className="review-item">
          <span className="review-item__label">Starting Capital</span>
          <span className="review-item__value" style={{ color: 'var(--positive)', fontWeight: 700, fontSize: '15px' }}>
            Rs. {Number(config.portfolio.startingCapital).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 6. Metrics */}
      <div className="review-section">
        <div className="review-section__title">
          <span>Tracked Analytics</span>
          <button type="button" className="review-section__edit-btn" onClick={() => goToStep('metrics')}>
            Edit
          </button>
        </div>
        <div className="review-item">
          <span className="review-item__label">Focused Metrics</span>
          <span className="review-item__value">{selectedMetricNames || 'All Standard Metrics'}</span>
        </div>
      </div>

      {/* Submission CTA Alert Box */}
      <div
        style={{
          marginTop: '28px',
          padding: '18px 24px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--accent-border)',
          borderRadius: 'var(--radius-card)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 4px' }}>
            Ready to Run Backtest?
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
            Submission will dispatch an asynchronous simulation run on the TradeIQ execution engine. You will be automatically redirected to track progress.
          </p>
        </div>

        <button
          type="button"
          id="run-backtest-btn"
          className="btn btn--success"
          style={{ minWidth: '220px', padding: '12px 28px', fontSize: '14px' }}
          onClick={handleRunClick}
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span>Submitting Simulation...</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Run Backtest</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

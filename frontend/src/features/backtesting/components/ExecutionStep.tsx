import React, { useState } from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { PositionSizingType } from '../domain/types';
import { DEFAULT_CSE_FEES } from '../domain/defaults';

const SIZING_OPTIONS: Array<{
  type: PositionSizingType;
  label: string;
  desc: string;
  hasValue: boolean;
  valueLabel?: string;
  valueSuffix?: string;
  min?: number;
  max?: number;
}> = [
  {
    type: 'full_capital',
    label: '100% Full Capital',
    desc: 'Invest 100% of all available portfolio cash on each buy signal.',
    hasValue: false,
  },
  {
    type: 'percentage',
    label: 'Percentage of Portfolio',
    desc: 'Allocate a fixed percentage of total portfolio equity per position.',
    hasValue: true,
    valueLabel: 'Portfolio Share (%)',
    valueSuffix: '%',
    min: 1,
    max: 100,
  },
  {
    type: 'absolute',
    label: 'Fixed Cash Amount',
    desc: 'Allocate a fixed rupee amount of cash per trade regardless of equity.',
    hasValue: true,
    valueLabel: 'Cash Amount (LKR)',
    valueSuffix: 'LKR',
    min: 100,
  },
  {
    type: 'fixed_quantity',
    label: 'Fixed Share Quantity',
    desc: 'Purchase an exact fixed number of shares on each trade signal.',
    hasValue: true,
    valueLabel: 'Number of Shares',
    valueSuffix: 'shares',
    min: 1,
  },
];

export const ExecutionStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('execution');
  const sizingError = errors.find((e) => e.field.startsWith('positionSizing'));

  const [isCustomFees, setIsCustomFees] = useState(false);

  const currentSizing = config.execution?.positionSizing || { type: 'full_capital' };
  const currentFees = config.execution?.fees || DEFAULT_CSE_FEES;

  const totalFeePct = (
    (currentFees.brokerageRate +
      currentFees.cseRate +
      currentFees.cdsRate +
      currentFees.secCessRate +
      currentFees.stlRate) *
    100
  ).toFixed(3);

  const handleSizingTypeChange = (type: PositionSizingType) => {
    let defaultValue: number | undefined = undefined;
    if (type === 'percentage') defaultValue = 50;
    if (type === 'absolute') defaultValue = 100_000;
    if (type === 'fixed_quantity') defaultValue = 500;

    updateConfig((prev) => ({
      ...prev,
      execution: {
        ...prev.execution,
        positionSizing: {
          type,
          value: defaultValue,
        },
      },
    }));
  };

  const handleSizingValueChange = (val: number) => {
    updateConfig((prev) => ({
      ...prev,
      execution: {
        ...prev.execution,
        positionSizing: {
          ...prev.execution.positionSizing,
          value: val,
        },
      },
    }));
  };

  const handleFeeChange = (key: keyof typeof DEFAULT_CSE_FEES, val: number) => {
    updateConfig((prev) => ({
      ...prev,
      execution: {
        ...prev.execution,
        fees: {
          ...prev.execution.fees,
          [key]: val / 100, // convert percent to decimal
        },
      },
    }));
  };

  const resetToStandardFees = () => {
    setIsCustomFees(false);
    updateConfig((prev) => ({
      ...prev,
      execution: {
        ...prev.execution,
        fees: { ...DEFAULT_CSE_FEES },
      },
    }));
  };

  return (
    <div className="execution-step">
      <div className="step-header">
        <h2 className="step-header__title">4. Execution Assumptions</h2>
        <p className="step-header__desc">
          Configure position sizing, brokerage commissions, transaction levies, and order execution constraints.
        </p>
      </div>

      {/* Position Sizing */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>
          Position Sizing Strategy
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
          Determine how many shares to purchase when an entry condition triggers
        </span>

        {sizingError && <div className="form-error-text" style={{ marginBottom: '10px' }}>{sizingError.message}</div>}

        <div className="grid-2">
          {SIZING_OPTIONS.map((opt) => {
            const isSelected = currentSizing.type === opt.type;

            return (
              <div
                key={opt.type}
                className={`option-card ${isSelected ? 'option-card--selected' : ''}`}
                onClick={() => handleSizingTypeChange(opt.type)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleSizingTypeChange(opt.type);
                  }
                }}
              >
                <div className="option-card__header">
                  <span className="option-card__title">{opt.label}</span>
                  <input
                    type="radio"
                    name="position_sizing"
                    checked={isSelected}
                    onChange={() => handleSizingTypeChange(opt.type)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </div>

                <p className="option-card__desc">{opt.desc}</p>

                {opt.hasValue && isSelected && (
                  <div className="option-card__input-wrap" onClick={(e) => e.stopPropagation()}>
                    <label htmlFor={`sizing-val-${opt.type}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {opt.valueLabel}:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                      <input
                        id={`sizing-val-${opt.type}`}
                        type="number"
                        className="form-input"
                        style={{ padding: '6px 8px', fontSize: '13px' }}
                        value={currentSizing.value ?? ''}
                        min={opt.min}
                        max={opt.max}
                        onChange={(e) => handleSizingValueChange(parseFloat(e.target.value))}
                      />
                      {opt.valueSuffix && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {opt.valueSuffix}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction Fees */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
              Transaction Fees & Levies
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Standard Colombo Stock Exchange round-trip statutory fee schedule: <strong>{totalFeePct}%</strong>
            </span>
          </div>

          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              if (isCustomFees) resetToStandardFees();
              else setIsCustomFees(true);
            }}
          >
            {isCustomFees ? 'Reset to CSE Standard (1.12%)' : 'Customize Fee Rates'}
          </button>
        </div>

        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
          }}
        >
          <div className="grid-3" style={{ gap: '12px' }}>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Brokerage Commission</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-heading)' }}>
                {(currentFees.brokerageRate * 100).toFixed(3)}%
              </strong>
              {isCustomFees && (
                <input
                  type="number"
                  step="0.001"
                  className="form-input"
                  style={{ marginTop: '4px', padding: '4px 6px', fontSize: '12px' }}
                  value={(currentFees.brokerageRate * 100).toFixed(3)}
                  onChange={(e) => handleFeeChange('brokerageRate', parseFloat(e.target.value))}
                />
              )}
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>CSE Fee</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-heading)' }}>
                {(currentFees.cseRate * 100).toFixed(3)}%
              </strong>
              {isCustomFees && (
                <input
                  type="number"
                  step="0.001"
                  className="form-input"
                  style={{ marginTop: '4px', padding: '4px 6px', fontSize: '12px' }}
                  value={(currentFees.cseRate * 100).toFixed(3)}
                  onChange={(e) => handleFeeChange('cseRate', parseFloat(e.target.value))}
                />
              )}
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>CDS Fee</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-heading)' }}>
                {(currentFees.cdsRate * 100).toFixed(3)}%
              </strong>
              {isCustomFees && (
                <input
                  type="number"
                  step="0.001"
                  className="form-input"
                  style={{ marginTop: '4px', padding: '4px 6px', fontSize: '12px' }}
                  value={(currentFees.cdsRate * 100).toFixed(3)}
                  onChange={(e) => handleFeeChange('cdsRate', parseFloat(e.target.value))}
                />
              )}
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>SEC Cess</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-heading)' }}>
                {(currentFees.secCessRate * 100).toFixed(3)}%
              </strong>
              {isCustomFees && (
                <input
                  type="number"
                  step="0.001"
                  className="form-input"
                  style={{ marginTop: '4px', padding: '4px 6px', fontSize: '12px' }}
                  value={(currentFees.secCessRate * 100).toFixed(3)}
                  onChange={(e) => handleFeeChange('secCessRate', parseFloat(e.target.value))}
                />
              )}
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Share Transaction Levy (STL)</span>
              <strong style={{ fontSize: '14px', color: 'var(--text-heading)' }}>
                {(currentFees.stlRate * 100).toFixed(3)}%
              </strong>
              {isCustomFees && (
                <input
                  type="number"
                  step="0.001"
                  className="form-input"
                  style={{ marginTop: '4px', padding: '4px 6px', fontSize: '12px' }}
                  value={(currentFees.stlRate * 100).toFixed(3)}
                  onChange={(e) => handleFeeChange('stlRate', parseFloat(e.target.value))}
                />
              )}
            </div>

            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Total Effective Rate</span>
              <strong style={{ fontSize: '14px', color: 'var(--accent-text)' }}>
                {totalFeePct}%
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Constraints: Rounding & Precedence */}
      <div className="grid-2">
        <div className="review-section" style={{ margin: 0 }}>
          <div className="review-section__title">Share Rounding Policy</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Orders execute in <strong>whole shares only</strong> (fractional shares rounded down via floor division), complying with CSE board trading standards.
          </p>
        </div>

        <div className="review-section" style={{ margin: 0 }}>
          <div className="review-section__title">Exit Precedence Policy</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            First triggered condition wins. When both Stop Loss and Take Profit trigger on the identical trading day, <strong>Stop Loss takes priority</strong> per backend determinism.
          </p>
        </div>
      </div>
    </div>
  );
};

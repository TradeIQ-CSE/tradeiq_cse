import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import {
  V1_BUY_RULES,
  V1_SELL_RULES,
  DISALLOWED_INDICATOR_STRATEGIES,
} from '../domain/v1Rules';
import { BuyConditionType, SellConditionType } from '../domain/types';

export const RulesStep: React.FC = () => {
  const { config, updateConfig, getStepErrors } = useBacktestWizard();
  const errors = getStepErrors('rules');

  const buyError = errors.find((e) => e.field.startsWith('buy'));
  const sellsError = errors.find((e) => e.field.startsWith('sells'));

  const selectedBuy = config.rules?.buy || { type: 'period_start' };
  const selectedSells = config.rules?.sells || [];

  // Exactly 1 buy condition
  const handleSelectBuy = (type: BuyConditionType) => {
    let defaultValue: number | undefined = undefined;
    if (type === 'price_falls_pct_from_period_start') defaultValue = 5;
    if (type === 'price_falls_to') defaultValue = config.security?.price ? Math.round(config.security.price * 0.95) : 100;

    updateConfig((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        buy: {
          type,
          value: defaultValue,
        },
      },
    }));
  };

  const handleBuyValueChange = (val: number) => {
    updateConfig((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        buy: {
          ...prev.rules.buy,
          value: val,
        },
      },
    }));
  };

  // At least 1 sell condition
  const handleToggleSell = (type: SellConditionType) => {
    const exists = selectedSells.some((s) => s.type === type);

    if (exists) {
      // Remove sell rule (if at least one will remain or user deselects)
      updateConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          sells: prev.rules.sells.filter((s) => s.type !== type),
        },
      }));
    } else {
      // Add sell rule
      let defaultValue: number | undefined = undefined;
      if (type === 'take_profit_pct') defaultValue = 10;
      if (type === 'stop_loss_pct') defaultValue = 5;
      if (type === 'target_price') defaultValue = config.security?.price ? Math.round(config.security.price * 1.15) : 150;

      updateConfig((prev) => ({
        ...prev,
        rules: {
          ...prev.rules,
          sells: [...prev.rules.sells, { type, value: defaultValue }],
        },
      }));
    }
  };

  const handleSellValueChange = (type: SellConditionType, val: number) => {
    updateConfig((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        sells: prev.rules.sells.map((s) => (s.type === type ? { ...s, value: val } : s)),
      },
    }));
  };

  return (
    <div className="rules-step">
      <div className="step-header">
        <h2 className="step-header__title">3. Configure Strategy Rules (v1 Price DSL)</h2>
        <p className="step-header__desc">
          Define price-based entry and exit conditions. Exactly 1 buy condition and at least 1 sell condition are required.
        </p>
      </div>

      {/* Scope Disclaimer Banner regarding Indicators */}
      <div className="info-banner" style={{ borderLeft: '3px solid var(--accent)' }}>
        <span style={{ fontSize: '16px' }}>ℹ️</span>
        <div>
          <strong style={{ color: 'var(--text-heading)', display: 'block', marginBottom: '2px' }}>
            ADR 0002: v1 DSL Scope (Price-Based Only)
          </strong>
          <span>
            Technical indicators (
            {DISALLOWED_INDICATOR_STRATEGIES.map((i) => i.code).join(', ')}
            ) are available as chart overlays only and are strictly excluded from executable rule sets in v1.
          </span>
        </div>
      </div>

      {/* Section 1: Buy Condition (Exactly 1) */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
              Entry Rule (Buy Condition)
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Select exactly 1 trigger to establish a long position
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: '10px' }}>
            Exactly 1 required
          </span>
        </div>

        {buyError && <div className="form-error-text" style={{ marginBottom: '10px' }}>{buyError.message}</div>}

        <div className="grid-3">
          {V1_BUY_RULES.map((rule) => {
            const isSelected = selectedBuy.type === rule.type;

            return (
              <div
                key={rule.type}
                className={`option-card ${isSelected ? 'option-card--selected' : ''}`}
                onClick={() => handleSelectBuy(rule.type)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleSelectBuy(rule.type);
                  }
                }}
              >
                <div className="option-card__header">
                  <div className="option-card__title-wrap">
                    <span className="option-card__glyph">{rule.glyph}</span>
                    <span className="option-card__title">{rule.label}</span>
                  </div>
                  <input
                    type="radio"
                    name="buy_condition"
                    checked={isSelected}
                    onChange={() => handleSelectBuy(rule.type)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </div>

                <p className="option-card__desc">{rule.description}</p>

                {rule.requiresValue && isSelected && (
                  <div className="option-card__input-wrap" onClick={(e) => e.stopPropagation()}>
                    <label htmlFor={`buy-value-${rule.type}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {rule.valueLabel}:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                      <input
                        id={`buy-value-${rule.type}`}
                        type="number"
                        className="form-input"
                        style={{ padding: '6px 8px', fontSize: '13px' }}
                        value={selectedBuy.value ?? ''}
                        min={rule.min}
                        max={rule.max}
                        step={rule.step}
                        placeholder={rule.valuePlaceholder}
                        onChange={(e) => handleBuyValueChange(parseFloat(e.target.value))}
                      />
                      {rule.valueSuffix && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {rule.valueSuffix}
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

      {/* Section 2: Sell Conditions (At least 1) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
              Exit Rules (Sell Conditions)
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Select one or more conditions. First triggered condition closes the position.
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--accent-text)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: '10px' }}>
            At least 1 required
          </span>
        </div>

        {sellsError && <div className="form-error-text" style={{ marginBottom: '10px' }}>{sellsError.message}</div>}

        <div className="grid-2">
          {V1_SELL_RULES.map((rule) => {
            const currentRule = selectedSells.find((s) => s.type === rule.type);
            const isSelected = !!currentRule;

            return (
              <div
                key={rule.type}
                className={`option-card ${isSelected ? 'option-card--selected' : ''}`}
                onClick={() => handleToggleSell(rule.type)}
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleToggleSell(rule.type);
                  }
                }}
              >
                <div className="option-card__header">
                  <div className="option-card__title-wrap">
                    <span className="option-card__glyph">{rule.glyph}</span>
                    <span className="option-card__title">{rule.label}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSell(rule.type)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </div>

                <p className="option-card__desc">{rule.description}</p>

                {rule.requiresValue && isSelected && (
                  <div className="option-card__input-wrap" onClick={(e) => e.stopPropagation()}>
                    <label htmlFor={`sell-value-${rule.type}`} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {rule.valueLabel}:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                      <input
                        id={`sell-value-${rule.type}`}
                        type="number"
                        className="form-input"
                        style={{ padding: '6px 8px', fontSize: '13px' }}
                        value={currentRule?.value ?? ''}
                        min={rule.min}
                        max={rule.max}
                        step={rule.step}
                        placeholder={rule.valuePlaceholder}
                        onChange={(e) => handleSellValueChange(rule.type, parseFloat(e.target.value))}
                      />
                      {rule.valueSuffix && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {rule.valueSuffix}
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
    </div>
  );
};

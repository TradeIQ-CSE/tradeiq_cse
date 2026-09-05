import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { StepKey } from '../domain/types';

export const ValidationSummary: React.FC = () => {
  const { validationErrors, goToStep } = useBacktestWizard();

  if (validationErrors.length === 0) {
    return null;
  }

  return (
    <div className="info-banner info-banner--warning" role="alert" aria-live="polite">
      <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: '6px', color: '#ff9496' }}>
          Please correct the following configuration {validationErrors.length === 1 ? 'issue' : 'issues'}:
        </strong>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {validationErrors.map((err, idx) => (
            <li key={`${err.step}-${err.field}-${idx}`} style={{ fontSize: '12px' }}>
              <span>{err.message} </span>
              <button
                type="button"
                onClick={() => goToStep(err.step as StepKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-text)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: 0,
                  marginLeft: '4px',
                }}
              >
                (Go to {err.step})
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

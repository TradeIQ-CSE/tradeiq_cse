import React from 'react';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { StepKey } from '../domain/types';

const STEP_LABELS: Record<StepKey, string> = {
  security: 'Security',
  period: 'Period',
  rules: 'Rules',
  execution: 'Execution',
  portfolio: 'Portfolio',
  metrics: 'Metrics',
  review: 'Review',
};

export const StepIndicator: React.FC = () => {
  const { allSteps, currentStep, stepIndex, goToStep, getStepErrors } = useBacktestWizard();

  return (
    <nav className="step-indicator" aria-label="Backtest configuration steps">
      {allSteps.map((step, idx) => {
        const isActive = step === currentStep;
        const isCompleted = idx < stepIndex;
        const stepErrors = getStepErrors(step);
        const hasError = stepErrors.length > 0;

        let stateClass = '';
        if (isActive) stateClass = 'step-item--active';
        else if (hasError) stateClass = 'step-item--error';
        else if (isCompleted) stateClass = 'step-item--completed';

        return (
          <React.Fragment key={step}>
            <button
              type="button"
              className={`step-item ${stateClass}`}
              onClick={() => goToStep(step)}
              aria-current={isActive ? 'step' : undefined}
              title={`Step ${idx + 1}: ${STEP_LABELS[step]}`}
            >
              <span className="step-item__badge">
                {isCompleted && !hasError ? '✓' : idx + 1}
              </span>
              <span className="step-item__label">{STEP_LABELS[step]}</span>
            </button>
            {idx < allSteps.length - 1 && (
              <span
                className={`step-divider ${idx < stepIndex ? 'step-divider--active' : ''}`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

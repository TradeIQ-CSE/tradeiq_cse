import React from 'react';
import { useBacktestWizard, BacktestWizardProvider } from '../hooks/useBacktestWizard';
import { StepIndicator } from './StepIndicator';
import { ValidationSummary } from './ValidationSummary';
import { SecurityStep } from './SecurityStep';
import { PeriodStep } from './PeriodStep';
import { RulesStep } from './RulesStep';
import { ExecutionStep } from './ExecutionStep';
import { PortfolioStep } from './PortfolioStep';
import { MetricsStep } from './MetricsStep';
import { ReviewStep } from './ReviewStep';
import '../backtesting.css';

const WizardContent: React.FC = () => {
  const { currentStep, stepIndex, totalSteps, goNext, goBack } = useBacktestWizard();

  const renderStep = () => {
    switch (currentStep) {
      case 'security':
        return <SecurityStep />;
      case 'period':
        return <PeriodStep />;
      case 'rules':
        return <RulesStep />;
      case 'execution':
        return <ExecutionStep />;
      case 'portfolio':
        return <PortfolioStep />;
      case 'metrics':
        return <MetricsStep />;
      case 'review':
        return <ReviewStep />;
      default:
        return <SecurityStep />;
    }
  };

  return (
    <div className="backtest-workflow">
      {/* Workflow Header */}
      <header className="backtest-header">
        <span className="backtest-header__badge">
          TradeIQ Simulation · v1 Price DSL
        </span>
        <h1 className="backtest-header__title">Configure Backtest Strategy</h1>
        <p className="backtest-header__subtitle">
          Build and validate price-based rules, define execution parameters, and model historical strategy returns on the Colombo Stock Exchange.
        </p>
      </header>

      {/* 7-Step Stepper */}
      <StepIndicator />

      {/* Validation Banner if errors present */}
      <ValidationSummary />

      {/* Main Form Content Card */}
      <main className="backtest-card" aria-live="polite">
        {renderStep()}

        {/* Wizard Footer Controls */}
        <div className="wizard-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={goBack}
            aria-label="Navigate to previous step"
          >
            ← Back
          </button>

          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Step {stepIndex + 1} of {totalSteps}
          </span>

          {currentStep !== 'review' ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={goNext}
              aria-label="Advance to next step"
            >
              <span>Next Step</span>
              <span>→</span>
            </button>
          ) : (
            <div style={{ width: '90px' }} />
          )}
        </div>
      </main>
    </div>
  );
};

export const BacktestWizard: React.FC = () => {
  return (
    <BacktestWizardProvider>
      <WizardContent />
    </BacktestWizardProvider>
  );
};

export default BacktestWizard;

import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import {
  AppNotice,
  AppPage,
  AppPanel,
  PageIntro,
} from "@/components/application/layout/application-layout";
import {
  useBacktestWizard,
  BacktestWizardProvider,
} from "../hooks/useBacktestWizard";
import { StepIndicator } from "./StepIndicator";
import { ValidationSummary } from "./ValidationSummary";
import { SecurityStep } from "./SecurityStep";
import { PeriodStep } from "./PeriodStep";
import { RulesStep } from "./RulesStep";
import { ExecutionStep } from "./ExecutionStep";
import { PortfolioStep } from "./PortfolioStep";
import { MetricsStep } from "./MetricsStep";
import { ReviewStep } from "./ReviewStep";

function WizardContent() {
  const { currentStep, stepIndex, totalSteps, goNext, goBack } =
    useBacktestWizard();

  const renderStep = () => {
    switch (currentStep) {
      case "security":
        return <SecurityStep />;
      case "period":
        return <PeriodStep />;
      case "rules":
        return <RulesStep />;
      case "execution":
        return <ExecutionStep />;
      case "portfolio":
        return <PortfolioStep />;
      case "metrics":
        return <MetricsStep />;
      case "review":
        return <ReviewStep />;
      default:
        return <SecurityStep />;
    }
  };

  return (
    <AppPage className="max-w-5xl">
      <PageIntro
        eyebrow="Historical simulation"
        title="Test a strategy against the past"
        description="Build simple price-based rules, choose realistic execution assumptions, and see how they would have behaved on available CSE end-of-day data."
      />

      <AppNotice title="A backtest is evidence, not a forecast">
        Historical results can help you understand a rule&apos;s behaviour, but
        they do not predict future prices or guarantee future returns.
      </AppNotice>

      <StepIndicator />
      <ValidationSummary />

      <AppPanel className="overflow-hidden p-0">
        <section className="flex flex-col gap-6 p-4 sm:p-6" aria-live="polite">
          {renderStep()}

          <footer className="flex flex-col-reverse gap-3 border-t border-separator-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              leadingIcon={RiArrowLeftLine}
              onClick={goBack}
              aria-label="Navigate to previous step"
              className="w-full sm:w-auto"
            >
              {stepIndex === 0 ? "Back to markets" : "Back"}
            </Button>

            <p className="text-center text-body-2-medium text-text-tertiary">
              Step {stepIndex + 1} of {totalSteps}
            </p>

            {currentStep !== "review" ? (
              <Button
                trailingIcon={RiArrowRightLine}
                onClick={goNext}
                aria-label="Advance to next step"
                className="w-full sm:w-auto"
              >
                Continue
              </Button>
            ) : (
              <span className="hidden w-24 sm:block" aria-hidden="true" />
            )}
          </footer>
        </section>
      </AppPanel>
    </AppPage>
  );
}

export function BacktestWizard() {
  return (
    <BacktestWizardProvider>
      <WizardContent />
    </BacktestWizardProvider>
  );
}

export default BacktestWizard;

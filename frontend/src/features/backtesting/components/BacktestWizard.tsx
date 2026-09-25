import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/base/buttons/button";
import { InfoTip } from "@/components/domain/info-tip";
import {
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
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { SimpleCompanyStep, SimpleIdeaStep, SimpleAnalysisSection } from "./SimpleBacktestSteps";

function WizardContent() {
  const { currentStep, stepIndex, totalSteps, goNext, goBack, mode, setMode, isSubmitting } =
    useBacktestWizard();
  const { hash } = useLocation();
  const contentRef = useRef<HTMLElement>(null);
  const previousStep = useRef(currentStep);
  useEffect(() => {
    const changed = previousStep.current !== currentStep;
    previousStep.current = currentStep;
    if (!changed || hash) return;
    const heading = contentRef.current?.querySelector<HTMLElement>("h2");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "start" });
  }, [currentStep, hash]);

  const renderStep = () => {
    if (mode === "simple") {
      if (currentStep === "security") return <SimpleCompanyStep />;
      if (currentStep === "rules") return <SimpleIdeaStep />;
      return <ReviewStep configuration={<SimpleAnalysisSection />} />;
    }
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
        eyebrow="Backtesting"
        title="Test an idea on past prices"
        description="See how a buy and sell rule would have done on real CSE prices · Past results don’t promise future ones"
        actions={
          <div className="flex items-center gap-1">
            <SegmentedControl aria-label="Backtest workflow" selectedKeys={[mode]} isDisabled={isSubmitting}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                if (selected === "simple" || selected === "advanced") setMode(selected);
              }}>
              <SegmentedControlItem id="simple">Simple</SegmentedControlItem>
              <SegmentedControlItem id="advanced">Advanced</SegmentedControlItem>
            </SegmentedControl>
            <InfoTip label="Simple and Advanced">
              Simple has 3 steps with settings filled in for you. Advanced walks through all 7.
            </InfoTip>
          </div>
        }
      />

      <StepIndicator />
      <ValidationSummary />

      <AppPanel className="overflow-hidden p-0">
        <section ref={contentRef} className="flex flex-col gap-6 p-4 sm:p-6" aria-live="polite">
          {renderStep()}

          <footer className="flex flex-col-reverse gap-3 border-t border-separator-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              leadingIcon={RiArrowLeftLine}
              onClick={goBack}
              disabled={isSubmitting}
              aria-label="Navigate to previous step"
              className="w-full sm:w-auto"
            >
              {stepIndex === 0 ? "Back to markets" : "Back"}
            </Button>

            <p className="text-center text-body-2-regular text-text-secondary">
              Step {stepIndex + 1} of {totalSteps}
            </p>

            {currentStep !== "review" ? (
              <Button
                trailingIcon={RiArrowRightLine}
                onClick={goNext}
                disabled={isSubmitting}
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

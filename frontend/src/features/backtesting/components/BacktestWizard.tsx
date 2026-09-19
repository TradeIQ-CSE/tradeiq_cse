import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
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
        eyebrow="Historical simulation"
        title="Test a strategy against the past"
        description="Build simple price-based rules, choose realistic execution assumptions, and see how they would have behaved on available CSE end-of-day data."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl aria-label="Backtest workflow" selectedKeys={[mode]} isDisabled={isSubmitting}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0];
            if (selected === "simple" || selected === "advanced") setMode(selected);
          }}>
          <SegmentedControlItem id="simple">Simple</SegmentedControlItem>
          <SegmentedControlItem id="advanced">Advanced</SegmentedControlItem>
        </SegmentedControl>
        <p className="text-body-2-regular text-text-secondary">
          {mode === "simple" ? "Three steps, with settings you can change." : "Seven steps through every available setting."}
        </p>
      </div>

      <AppNotice title="A backtest is evidence, not a forecast">
        Historical results can help you understand a rule&apos;s behaviour, but
        they do not predict future prices or guarantee future returns.
      </AppNotice>

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

            <p className="text-center text-body-2-medium text-text-tertiary">
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

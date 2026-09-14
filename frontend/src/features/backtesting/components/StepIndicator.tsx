import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import type { StepKey } from "../domain/types";
import { cx } from "@/utils/cx";

const STEP_LABELS: Record<StepKey, string> = {
  security: "Security",
  period: "Period",
  rules: "Rules",
  execution: "Execution",
  portfolio: "Capital",
  metrics: "Metrics",
  review: "Review",
};

export function StepIndicator() {
  const { allSteps, currentStep, stepIndex, goToStep, getStepErrors } =
    useBacktestWizard();

  return (
    <nav
      className="overflow-x-auto rounded-3xl border border-border-button-default bg-background-primary-default p-3 shadow-xs"
      aria-label="Backtest configuration steps"
    >
      <ol className="flex min-w-max items-center">
        {allSteps.map((step, index) => {
          const isActive = step === currentStep;
          const isComplete = index < stepIndex;
          const hasError = getStepErrors(step).length > 0;

          return (
            <li key={step} className="flex items-center">
              <button
                type="button"
                onClick={() => goToStep(step)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${STEP_LABELS[step]}${
                  hasError ? ", needs attention" : ""
                }`}
                className={cx(
                  "group flex items-center gap-2 rounded-xl px-2 py-2 text-body-2-medium outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  isActive
                    ? "bg-status-blue-background text-status-blue-text"
                    : "text-text-tertiary hover:bg-background-primary-hover hover:text-text-primary",
                )}
              >
                <span
                  className={cx(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-caption-1-semibold",
                    isActive &&
                      "border-accent-500 bg-button-primary bui-on-accent",
                    isComplete &&
                      !hasError &&
                      "border-status-lime-text bg-status-lime-background text-status-lime-text",
                    hasError &&
                      "border-status-rose-text bg-status-rose-background text-status-rose-text",
                    !isActive &&
                      !isComplete &&
                      !hasError &&
                      "border-border-button-default bg-background-secondary-default text-text-secondary",
                  )}
                >
                  {hasError ? (
                    <RiErrorWarningLine className="size-4" aria-hidden />
                  ) : isComplete ? (
                    <RiCheckLine className="size-4" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{STEP_LABELS[step]}</span>
              </button>
              {index < allSteps.length - 1 && (
                <span
                  className={cx(
                    "mx-1 h-px w-4 bg-separator-border sm:w-7",
                    index < stepIndex && "bg-status-blue-text",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

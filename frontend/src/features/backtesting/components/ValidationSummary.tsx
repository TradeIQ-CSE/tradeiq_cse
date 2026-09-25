import { Button } from "@/components/base/buttons/button";
import { AppNotice } from "@/components/application/layout/application-layout";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import type { StepKey } from "../domain/types";
import { STEP_LABELS } from "../domain/stepLabels";

export function ValidationSummary() {
  const { validationErrors, goToStep } = useBacktestWizard();

  if (validationErrors.length === 0) return null;

  return (
    <AppNotice
      tone="error"
      title={`Fix ${validationErrors.length} ${
        validationErrors.length === 1 ? "thing" : "things"
      } to continue`}
      aria-live="polite"
    >
      <ul className="mt-1 flex list-disc flex-col gap-2 pl-5">
        {validationErrors.map((error, index) => (
          <li key={`${error.step}-${error.field}-${index}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span>{error.message}</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => goToStep(error.step as StepKey)}
              >
                Go to {STEP_LABELS[error.step as StepKey]?.toLowerCase() ?? error.step}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </AppNotice>
  );
}

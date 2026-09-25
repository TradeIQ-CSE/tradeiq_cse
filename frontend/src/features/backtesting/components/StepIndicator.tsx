import { Stepper } from "@/components/application/stepper";
import { useBacktestWizard } from "../hooks/useBacktestWizard";
import { sectionsForPage } from "../domain/workflow";
import { SIMPLE_LABELS, STEP_LABELS } from "../domain/stepLabels";

export function StepIndicator() {
  const { allSteps, currentStep, stepIndex, goToStep, getStepErrors, mode, isSubmitting } =
    useBacktestWizard();

  return (
    <Stepper
      label="Backtest configuration steps"
      disabled={isSubmitting}
      onSelect={(step) => goToStep(step as typeof currentStep, false)}
      steps={allSteps.map((step, index) => ({
        key: step,
        label: (mode === "simple" ? SIMPLE_LABELS[step] : STEP_LABELS[step]) ?? step,
        state: step === currentStep ? "current" : index < stepIndex ? "complete" : "upcoming",
        needsAttention: sectionsForPage(mode, step).some((section) => getStepErrors(section).length > 0),
      }))}
    />
  );
}

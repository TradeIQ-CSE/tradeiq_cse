import type { StepKey } from "./types";

/** Step names shown in the step bar and in "Go to …" links. */
export const SIMPLE_LABELS: Partial<Record<StepKey, string>> = {
  security: "Company & period",
  rules: "Your idea",
  review: "Review & run",
};

export const STEP_LABELS: Record<StepKey, string> = {
  security: "Company",
  period: "Dates",
  rules: "Rules",
  execution: "Trade size",
  portfolio: "Starting cash",
  metrics: "Analysis focus",
  review: "Review",
};

import { RiCheckLine, RiErrorWarningLine } from "@remixicon/react";
import { cx } from "../../utils/cx";

export type StepState = "current" | "complete" | "upcoming";

export interface StepperStep {
  key: string;
  label: string;
  state: StepState;
  /** Shows a warning in place of the number or tick. */
  needsAttention?: boolean;
}

/**
 * The numbered step bar shared by Backtesting and Paper trading: centred, a
 * tick once a step is done, a warning when it needs attention, and only the
 * current step named on phones. Pass `onSelect` to make steps clickable; the
 * bar is then a navigation landmark, otherwise a plain labelled list.
 */
export function Stepper({
  steps,
  label,
  onSelect,
  disabled = false,
  className,
}: {
  steps: StepperStep[];
  label: string;
  onSelect?: (key: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const list = (
    <ol
      aria-label={onSelect ? undefined : label}
      className="mx-auto flex w-max items-center"
    >
      {steps.map((step, index) => {
        const isActive = step.state === "current";
        const warn = Boolean(step.needsAttention);
        const content = (
          <>
            <span
              className={cx(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-caption-1-semibold",
                warn
                  ? "border-status-rose-text bg-status-rose-background text-status-rose-text"
                  : isActive
                    ? "border-accent-500 bg-button-primary bui-on-accent"
                    : step.state === "complete"
                      ? "border-status-lime-text bg-status-lime-background text-status-lime-text"
                      : "border-border-button-default bg-background-secondary-default text-text-secondary",
              )}
            >
              {warn ? (
                <RiErrorWarningLine className="size-4" aria-hidden />
              ) : step.state === "complete" ? (
                <RiCheckLine className="size-4" aria-hidden />
              ) : (
                index + 1
              )}
            </span>
            {/* On narrow screens only the current step is named, so the bar
                fits; a long bar (the 7-step flow) waits for a wide screen. */}
            <span
              className={cx(
                !isActive &&
                  (steps.length > 4
                    ? "sr-only 2xl:not-sr-only"
                    : "sr-only sm:not-sr-only"),
              )}
            >
              {step.label}
            </span>
          </>
        );
        const itemClass = cx(
          "flex items-center gap-2 rounded-xl px-2 py-2 text-body-2-medium",
          isActive
            ? "bg-status-blue-background text-status-blue-text"
            : "text-text-tertiary",
        );

        return (
          <li
            key={step.key}
            className="flex items-center"
            aria-current={isActive ? "step" : undefined}
          >
            {onSelect ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(step.key)}
                aria-label={`Step ${index + 1}: ${step.label}${
                  warn ? ", needs attention" : ""
                }`}
                className={cx(
                  itemClass,
                  "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  !isActive &&
                    "hover:bg-background-primary-hover hover:text-text-primary",
                )}
              >
                {content}
              </button>
            ) : (
              <span className={itemClass}>{content}</span>
            )}
            {index < steps.length - 1 && (
              <span
                className={cx(
                  "mx-1 h-px w-4 bg-separator-border sm:w-7",
                  step.state === "complete" && "bg-status-blue-text",
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );

  const frame = cx(
    "overflow-x-auto rounded-3xl border border-border-button-default bg-background-primary-default p-3 shadow-xs",
    className,
  );
  return onSelect ? (
    <nav className={frame} aria-label={label}>
      {list}
    </nav>
  ) : (
    <div className={frame}>{list}</div>
  );
}

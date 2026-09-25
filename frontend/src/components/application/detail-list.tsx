import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

/**
 * A quiet box of label–value rows, shared by the backtest review and the
 * paper-trading cost panel so a figure looks the same wherever it appears.
 */
export function DetailList({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h3 className="text-body-medium text-text-primary">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label on the left, value on the right; stacked on phones. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-1 text-body-2-regular sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className,
      )}
    >
      <span className="text-text-secondary">{label}</span>
      <span className="min-w-0 text-text-primary tabular-nums sm:max-w-[65%] sm:text-right">
        {value}
      </span>
    </div>
  );
}

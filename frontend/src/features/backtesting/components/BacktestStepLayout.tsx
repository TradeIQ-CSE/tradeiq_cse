import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export function BacktestStepHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5 border-b border-separator-border pb-5">
      <p className="text-caption-1-semibold text-status-blue-text">
        Step {step} of 7
      </p>
      <h2 className="text-title-2-medium text-text-primary">{title}</h2>
      <p className="max-w-3xl text-body-regular text-text-secondary">
        {description}
      </p>
    </header>
  );
}

export function BacktestSectionHeader({
  title,
  description,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-headline-medium text-text-primary">{title}</h3>
        {description && (
          <p className="text-body-regular text-text-secondary">{description}</p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function BacktestFieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-body-2-regular text-text-error-primary">
      {children}
    </p>
  );
}

export function ReviewSection({
  title,
  onEdit,
  children,
  className,
}: {
  title: ReactNode;
  onEdit?: () => void;
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
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-caption-1-semibold uppercase tracking-wider text-status-blue-text">
          {title}
        </h3>
        {onEdit && (
          <Button variant="ghost" size="xs" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReviewRow({
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
        "flex flex-col gap-1 text-body-regular sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className,
      )}
    >
      <span className="text-text-secondary">{label}</span>
      <span className="min-w-0 text-text-primary sm:max-w-[65%] sm:text-right">
        {value}
      </span>
    </div>
  );
}

export function ParameterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-button-default bg-background-secondary-default p-4">
      {children}
    </div>
  );
}

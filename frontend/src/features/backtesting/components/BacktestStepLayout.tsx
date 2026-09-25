import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { InfoTip } from "@/components/domain/info-tip";
import { DetailList, DetailRow } from "@/components/application/detail-list";

/**
 * A step's title and one plain line under it. The step count lives in the
 * step bar and the footer, so it isn't repeated here.
 */
export function BacktestStepHeader({
  title,
  description,
  embedded = false,
}: {
  title: ReactNode;
  description: ReactNode;
  embedded?: boolean;
}) {
  if (embedded) return null;
  return (
    <header className="flex flex-col gap-1 border-b border-separator-border pb-5">
      <h2 tabIndex={-1} className="text-title-2-medium text-text-primary outline-none">{title}</h2>
      <p className="max-w-3xl text-body-regular text-text-secondary">
        {description}
      </p>
    </header>
  );
}

export function BacktestSectionHeader({
  title,
  description,
  info,
  aside,
}: {
  title: string;
  description?: ReactNode;
  /** Short explanation shown in the "i" tooltip next to the title. */
  info?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <h3 className="text-headline-medium text-text-primary">{title}</h3>
          {info && <InfoTip label={title}>{info}</InfoTip>}
        </div>
        {description && (
          <p className="text-body-2-regular text-text-secondary">{description}</p>
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
  title: string;
  onEdit?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DetailList
      title={title}
      className={className}
      action={
        onEdit && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onEdit}
            aria-label={`Edit ${title.toLowerCase()}`}
          >
            Edit
          </Button>
        )
      }
    >
      {children}
    </DetailList>
  );
}

export { DetailRow as ReviewRow };

export function ParameterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-button-default bg-background-secondary-default p-4">
      {children}
    </div>
  );
}

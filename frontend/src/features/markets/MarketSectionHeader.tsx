import type { ReactNode } from "react";

/**
 * The one header every Markets panel uses: a short title, at most one plain
 * line under it, and an optional control or date on the right. Keeps Data
 * coverage, Market indices and Top movers reading as one page.
 */
export function MarketSectionHeader({
  title,
  subtitle,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
        {subtitle && (
          <p className="text-body-2-regular text-text-secondary">{subtitle}</p>
        )}
      </div>
      {aside && (
        <div className="max-w-full shrink-0 overflow-x-auto pb-0.5">
          {aside}
        </div>
      )}
    </div>
  );
}

import { formatGapBoundary } from "../../lib/data-gaps";
import { formatPrice } from "./format";
import { SecuritySectorIcon } from "./SecuritySectorIcon";
import type { Sector } from "./types";

function formatDay(day: string, locale: string) {
  try {
    return formatGapBoundary(day, locale);
  } catch {
    return day;
  }
}

/**
 * The picked company, shown the same way wherever a company is chosen
 * (backtesting, paper trading): symbol, name and sector on the left, the
 * latest close and how far its price history goes on the right.
 */
export function SelectedCompany({
  symbol,
  companyName,
  sector,
  price,
  historyFrom,
  historyTo,
  nameId,
  locale = "en-LK",
}: {
  symbol: string;
  companyName?: string | null;
  sector: Sector | null;
  price?: number | null;
  historyFrom?: string | null;
  historyTo?: string | null;
  /** Lets a field point its aria-describedby at the company name. */
  nameId?: string;
  locale?: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SecuritySectorIcon sector={sector} />
        <div className="flex min-w-0 flex-col">
          <p className="text-body-medium text-text-primary">{symbol}</p>
          <p className="break-words text-body-2-regular text-text-secondary">
            <span id={nameId}>{companyName || "CSE listed company"}</span>
            {sector && ` · ${sector.name}`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col sm:items-end">
        {price !== null && price !== undefined && (
          <>
            <span className="text-caption-1-regular text-text-secondary">
              Latest close
            </span>
            <strong className="text-headline-medium tabular-nums text-text-primary">
              LKR {formatPrice(price, locale)}
            </strong>
          </>
        )}
        {historyFrom && historyTo && (
          <span className="text-caption-1-regular text-text-secondary">
            Price history {formatDay(historyFrom, locale)} to{" "}
            {formatDay(historyTo, locale)}
          </span>
        )}
      </div>
    </section>
  );
}

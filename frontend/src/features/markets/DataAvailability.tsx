import { useTranslation } from "react-i18next";
import { AppPanel } from "../../components/application/layout/application-layout";
import { localeFor } from "../../i18n";
import {
  DataGap,
  formatGapBoundary,
  formatGapDateRange,
} from "../../lib/data-gaps";
import { formatCount } from "./format";
import { CoverageWindow, useDataCoverage } from "./useDataCoverage";

const DAY_MS = 86_400_000;

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

// A missing stretch this short is a sliver on a nine-year bar; it is still
// listed in the text below the bar, so nothing is hidden.
const MIN_BAR_PERCENT = 0.6;

function CoverageBar({ window }: { window: CoverageWindow }) {
  if (!window.from || !window.to) return null;
  const start = dayNumber(window.from);
  const span = Math.max(1, dayNumber(window.to) - start + 1);
  const missing = window.gaps.filter((gap) => gap.kind === "missing_data");

  return (
    <div
      aria-hidden
      className="relative h-2.5 w-full overflow-hidden rounded-full bg-chart-4"
    >
      {missing.map((gap) => {
        const left = ((dayNumber(gap.from) - start) / span) * 100;
        const width = Math.max(
          MIN_BAR_PERCENT,
          ((dayNumber(gap.to) - dayNumber(gap.from) + 1) / span) * 100,
        );
        return (
          <span
            key={gap.from}
            className="absolute inset-y-0 bg-chart-gap"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

function CoverageRow({
  label,
  window,
  locale,
}: {
  label: string;
  window: CoverageWindow;
  locale: string;
}) {
  const { t } = useTranslation();
  if (!window.from || !window.to) return null;
  const missing: DataGap[] = window.gaps.filter(
    (gap) => gap.kind === "missing_data",
  );

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[6rem_1fr]">
      <span className="text-body-2-semibold text-text-primary">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <CoverageBar window={window} />
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-caption-1-regular text-text-tertiary">
          <span>
            {t("markets.availability.range", {
              from: formatGapBoundary(window.from, locale),
              to: formatGapBoundary(window.to, locale),
            })}
          </span>
          {missing.length > 0 && (
            <span>
              {t("markets.availability.missing", {
                ranges: missing
                  .map(
                    (gap) =>
                      `${formatGapDateRange(gap, locale)} (${t(
                        "markets.availability.sessions",
                        {
                          count: gap.sessions,
                          formattedCount: formatCount(gap.sessions, locale),
                        },
                      )})`,
                  )
                  .join(" · "),
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What history the platform actually holds, stated once near the top of
 * Markets: a bar per dataset from its first to its latest session, with the
 * missing stretches greyed out (the same grey as the chart gap band) and listed. Every chart below may open on a
 * window that avoids a gap; this is where the reader sees why, without
 * having to find a grey band first. Hidden while coverage loads or if it
 * fails — the charts and tables don't depend on it.
 */
export function DataAvailability() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const coverage = useDataCoverage().data;
  if (!coverage) return null;
  // The latest price session, from coverage rather than the securities
  // list: that list follows the date picked in the table, this must not.
  const latestSession = coverage.prices.to;

  return (
    <AppPanel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-caption-1-semibold text-status-blue-text">
            {t("markets.availability.eyebrow")}
          </p>
          <p className="text-body-2-medium text-text-tertiary">
            {t("markets.availability.subtitle")}
          </p>
        </div>
        {latestSession && (
          <p className="text-body-2-medium text-text-secondary">
            {t("markets.availability.latest", {
              date: formatGapBoundary(latestSession, locale),
            })}
          </p>
        )}
      </div>
      <CoverageRow
        label={t("markets.availability.prices")}
        window={coverage.prices}
        locale={locale}
      />
      <CoverageRow
        label={t("markets.availability.indices")}
        window={coverage.indices}
        locale={locale}
      />
    </AppPanel>
  );
}

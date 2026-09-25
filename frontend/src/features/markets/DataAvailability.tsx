import { useTranslation } from "react-i18next";
import { AppPanel } from "../../components/application/layout/application-layout";
import { localeFor } from "../../i18n";
import {
  DataGap,
  formatGapBoundary,
  formatGapDateRange,
} from "../../lib/data-gaps";
import { formatCount } from "./format";
import { MarketSectionHeader } from "./MarketSectionHeader";
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

const missingGaps = (window: CoverageWindow): DataGap[] =>
  window.gaps.filter((gap) => gap.kind === "missing_data");

const gapKey = (gap: DataGap) => `${gap.from}:${gap.to}`;

/** "Jan 1 – Sep 8, 2026 (179 trading days) · …", or null with none. */
function useGapList(gaps: DataGap[], locale: string): string | null {
  const { t } = useTranslation();
  if (gaps.length === 0) return null;
  return gaps
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
    .join(" · ");
}

function CoverageRow({
  label,
  window,
  locale,
  gapText,
}: {
  label: string;
  window: CoverageWindow;
  locale: string;
  gapText: string | null;
}) {
  const { t } = useTranslation();
  if (!window.from || !window.to) return null;

  return (
    // Label and date range on one line, the bar, then the gaps: compact
    // enough that two of these sit side by side on a wide screen.
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-body-2-medium text-text-primary">{label}</span>
        <span className="text-caption-1-regular text-text-secondary">
          {t("markets.availability.range", {
            from: formatGapBoundary(window.from, locale),
            to: formatGapBoundary(window.to, locale),
          })}
        </span>
      </div>
      <CoverageBar window={window} />
      {gapText && (
        <span className="text-caption-1-regular text-text-secondary">
          {gapText}
        </span>
      )}
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
  // A gap both datasets share is listed once under both bars; each bar
  // only lists the gaps that are its own.
  const priceMissing = coverage ? missingGaps(coverage.prices) : [];
  const indexMissing = coverage ? missingGaps(coverage.indices) : [];
  const indexKeys = new Set(indexMissing.map(gapKey));
  const shared = priceMissing.filter((gap) => indexKeys.has(gapKey(gap)));
  const sharedKeys = new Set(shared.map(gapKey));
  const priceGaps = useGapList(
    priceMissing.filter((gap) => !sharedKeys.has(gapKey(gap))),
    locale,
  );
  const indexGaps = useGapList(
    indexMissing.filter((gap) => !sharedKeys.has(gapKey(gap))),
    locale,
  );
  const sharedGaps = useGapList(shared, locale);
  if (!coverage) return null;
  // The latest price session, from coverage rather than the securities
  // list: that list follows the date picked in the table, this must not.
  const latestSession = coverage.prices.to;

  return (
    <AppPanel className="flex flex-col gap-3">
      {/* The legend rides on the date line rather than getting a row of its
          own: this panel should stay short enough that the index charts
          below still land on the first screen. */}
      <MarketSectionHeader
        title={t("markets.availability.eyebrow")}
        aside={
          <p className="flex flex-wrap gap-x-2 text-body-2-regular text-text-secondary">
            {latestSession && (
              <span>
                {t("markets.availability.latest", {
                  date: formatGapBoundary(latestSession, locale),
                })}
              </span>
            )}
            <span aria-hidden className="hidden text-text-tertiary sm:inline">
              ·
            </span>
            <span>{t("markets.availability.subtitle")}</span>
          </p>
        }
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        <CoverageRow
          label={t("markets.availability.prices")}
          window={coverage.prices}
          locale={locale}
          gapText={
            priceGaps && t("markets.availability.missing", { ranges: priceGaps })
          }
        />
        <CoverageRow
          label={t("markets.availability.indices")}
          window={coverage.indices}
          locale={locale}
          gapText={
            indexGaps && t("markets.availability.missing", { ranges: indexGaps })
          }
        />
      </div>
      {sharedGaps && (
        <p className="text-caption-1-regular text-text-secondary">
          {t("markets.availability.missingBoth", { ranges: sharedGaps })}
        </p>
      )}
    </AppPanel>
  );
}

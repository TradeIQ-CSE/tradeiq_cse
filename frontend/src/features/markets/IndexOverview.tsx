import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IndexLineChart } from "../../components/charts/IndexLineChart";
import { AppPanel } from "../../components/application/layout/application-layout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/base/segmented-control/segmented-control";
import { cx } from "../../utils/cx";
import { localeFor } from "../../i18n";
import { ApiError } from "../../lib/api";
import { formatPrice, formatSigned } from "./format";
import { DataGap, formatGapBoundary } from "../../lib/data-gaps";
import { Index, OhlcvRange } from "./types";
import { useIndexValues, useIndices } from "./useIndices";
import { useDataCoverage } from "./useDataCoverage";
import { MarketSectionHeader } from "./MarketSectionHeader";
import { OverviewView, overviewWindows, windowLabel } from "./overview-windows";

// The user asked for these two specifically; /indices also carries the two
// total-return series (ASTRI, SL20TRI), which aren't part of this ask.
const DISPLAY_CODES = ["ASPI", "SL20"];

function IndexBlock({
  index,
  locale,
  gaps,
  range,
  ready,
}: {
  index: Index;
  locale: string;
  gaps: DataGap[];
  range: OhlcvRange;
  ready: boolean;
}) {
  const { t } = useTranslation();
  const valuesQuery = useIndexValues(index.code, range, ready);
  const latest = index.latest;
  const positive = (latest?.change ?? 0) >= 0;
  const values = valuesQuery.data?.values ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Link
        to={`/markets/index/${encodeURIComponent(index.code)}`}
        className="flex min-w-0 flex-col self-start hover:underline"
        aria-label={t("markets.viewDetails", { symbol: index.code })}
      >
        <span className="text-headline-semibold text-text-primary">
          {index.code}
        </span>
        <span className="truncate text-body-2-regular text-text-secondary">
          {index.name}
        </span>
      </Link>

      {latest ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-title-1-medium tabular-nums text-text-primary">
              {formatPrice(latest.close, locale)}
            </strong>
            {latest.change !== null && latest.change_pct !== null && (
              <span
                className={cx(
                  "text-body-medium tabular-nums",
                  latest.change === 0
                    ? "text-text-secondary"
                    : positive
                      ? "text-status-lime-text"
                      : "text-status-rose-text",
                )}
              >
                {formatSigned(latest.change, 2, locale)} (
                {formatSigned(latest.change_pct, 2, locale)}%)
              </span>
            )}
          </div>
          <span className="text-caption-1-regular text-text-secondary">
            {latest.previous_date
              ? t("markets.indices.closeOnVs", {
                  date: formatGapBoundary(latest.date, locale),
                  previous: formatGapBoundary(latest.previous_date, locale),
                })
              : t("markets.indices.closeOn", {
                  date: formatGapBoundary(latest.date, locale),
                })}
          </span>
        </div>
      ) : (
        <p className="text-body-medium text-text-tertiary">
          {t("markets.indices.noLatest")}
        </p>
      )}

      {!ready || valuesQuery.isPending ? (
        <div className="h-40 animate-pulse rounded-2lg bg-background-tertiary-default" />
      ) : (
        values.length > 0 && (
          <IndexLineChart
            data={values}
            locale={locale}
            gaps={gaps}
            accessibleLabel={t("markets.indices.chartLabel", {
              name: index.name,
            })}
            dateLabel={t("securityDetail.chart.values.date")}
            closeLabel={t("securityDetail.chart.values.close")}
            gapLabels={{
              gapMissingData: t("securityDetail.chart.gap.missingData"),
              gapMarketClosed: t("securityDetail.chart.gap.marketClosed"),
              gapRow: ({ kind, from, to }) =>
                t("securityDetail.chart.gap.row", { kind, from, to }),
            }}
          />
        )
      )}
    </div>
  );
}

/**
 * The exchange's headline indices. The close values sit at page-title scale
 * (`text-title-1-medium`), larger than the table below; the panel itself is
 * the same plain surface as every other Markets section.
 *
 * The headline value is always the latest close. The charts never open on a
 * window that is mostly gap band: when the trailing year crosses a
 * `missing_data` gap (docs/plans/data-gap-handling.md), one control switches
 * both charts between the latest full year of data and the run since the
 * gap, and a note says plainly which months are missing.
 */
export function IndexOverview() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isError, error } = useIndices();
  // Never gates the headline values; only the charts wait for it to settle
  // (load or error), and an error falls back to no gaps and the API's
  // default range, per docs/plans/data-gap-handling.md §3.
  const coverageQuery = useDataCoverage();
  const indexGaps = useMemo(
    () => coverageQuery.data?.indices.gaps ?? [],
    [coverageQuery.data],
  );
  const coverageSettled = coverageQuery.isSuccess || coverageQuery.isError;
  const windows = useMemo(
    () => overviewWindows(coverageQuery.data?.indices),
    [coverageQuery.data],
  );
  // A choice belongs to the gap it was made for: if coverage refreshes and
  // reports a different gap, the windows move and the default applies again.
  const gapKey = windows ? `${windows.gap.from}:${windows.gap.to}` : null;
  const [chosen, setChosen] = useState<{ gapKey: string | null; view: OverviewView } | null>(null);
  const chosenView = chosen?.gapKey === gapKey ? chosen.view : null;
  const view = chosenView ?? windows?.defaultView ?? "fullYear";
  const activeWindow = windows
    ? view === "recent"
      ? windows.recent
      : windows.fullYear
    : null;
  const range: OhlcvRange = activeWindow
    ? { from: activeWindow.start, to: activeWindow.end }
    : {};

  const indices = (data?.data ?? [])
    .filter((index) => DISPLAY_CODES.includes(index.code))
    .sort(
      (a, b) => DISPLAY_CODES.indexOf(a.code) - DISPLAY_CODES.indexOf(b.code),
    );

  return (
    <AppPanel className="flex flex-col gap-4">
      <MarketSectionHeader
        title={t("markets.indices.eyebrow")}
        // The gap's dates are already listed once in Data coverage above.
        subtitle={windows && t("markets.indices.gapNote")}
        aside={
          windows && (
            <SegmentedControl
              aria-label={t("markets.indices.windowLabel")}
              selectedKeys={new Set([view])}
              onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (next) setChosen({ gapKey, view: next as OverviewView });
              }}
            >
              <SegmentedControlItem id="fullYear">
                {windowLabel(windows.fullYear, locale)}
              </SegmentedControlItem>
              <SegmentedControlItem id="recent">
                {t("markets.indices.since", {
                  date: formatGapBoundary(windows.recent.start, locale),
                })}
              </SegmentedControlItem>
            </SegmentedControl>
          )
        }
      />

      {isError ? (
        <p className="py-4 text-body-medium text-status-rose-text">
          {error instanceof ApiError
            ? error.body.message
            : t("markets.indices.unreachable")}
        </p>
      ) : isPending && !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {DISPLAY_CODES.map((code) => (
            <div
              key={code}
              className="h-32 animate-pulse rounded-2lg bg-background-tertiary-default"
            />
          ))}
        </div>
      ) : (
        <div
          className={cx(
            "grid grid-cols-1 gap-5 sm:grid-cols-2",
            "sm:divide-x sm:divide-separator-border",
          )}
        >
          {indices.map((index) => (
            <div
              key={index.code}
              className="min-w-0 sm:first:pr-5 sm:last:pl-5"
            >
              <IndexBlock
                index={index}
                locale={locale}
                gaps={indexGaps}
                range={range}
                // Held until coverage settles so the card doesn't fetch the
                // gap-crossing trailing year and then jump.
                ready={coverageSettled}
              />
            </div>
          ))}
        </div>
      )}
    </AppPanel>
  );
}

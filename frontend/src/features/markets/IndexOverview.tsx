import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IndexLineChart } from "../../components/charts/IndexLineChart";
import { AppPanel } from "../../components/application/layout/application-layout";
import { Chip } from "../../components/base/badges/chip";
import { cx } from "../../utils/cx";
import { localeFor } from "../../i18n";
import { ApiError } from "../../lib/api";
import { formatPrice, formatSigned } from "./format";
import { DataGap } from "../../lib/data-gaps";
import { Index } from "./types";
import { useIndexValues, useIndices } from "./useIndices";
import { useDataCoverage } from "./useDataCoverage";

// The user asked for these two specifically; /indices also carries the two
// total-return series (ASTRI, SL20TRI), which aren't part of this ask.
const DISPLAY_CODES = ["ASPI", "SL20"];

function IndexBlock({
  index,
  locale,
  gaps,
}: {
  index: Index;
  locale: string;
  gaps: DataGap[];
}) {
  const { t } = useTranslation();
  const valuesQuery = useIndexValues(index.code);
  const latest = index.latest;
  const positive = (latest?.change ?? 0) >= 0;
  const values = valuesQuery.data?.values ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          to={`/markets/index/${encodeURIComponent(index.code)}`}
          className="flex min-w-0 flex-col hover:underline"
          aria-label={t("markets.viewDetails", { symbol: index.code })}
        >
          <span className="text-title-2-semibold text-text-primary">
            {index.code}
          </span>
          <span className="truncate text-body-2-medium text-text-tertiary">
            {index.name}
          </span>
        </Link>
        {latest && (
          <span className="text-caption-1-regular text-text-tertiary">
            {t("markets.asOf", { date: latest.date })}
          </span>
        )}
      </div>

      {latest ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="text-title-1-medium tabular-nums text-text-primary">
            {formatPrice(latest.close, locale)}
          </strong>
          {latest.change !== null && latest.change_pct !== null && (
            <span className="flex items-baseline gap-1.5">
              <Chip variant="bold" color={positive ? "lime" : "rose"}>
                {formatSigned(latest.change, 2, locale)} (
                {formatSigned(latest.change_pct, 2, locale)}%)
              </Chip>
              {latest.previous_date && (
                <span className="text-caption-1-regular text-text-tertiary">
                  {t("markets.indices.changeSince", {
                    date: latest.previous_date,
                  })}
                </span>
              )}
            </span>
          )}
        </div>
      ) : (
        <p className="text-body-medium text-text-tertiary">
          {t("markets.indices.noLatest")}
        </p>
      )}

      {values.length > 0 && (
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
      )}
    </div>
  );
}

/**
 * The exchange's headline indices, given a heavier visual weight than a
 * security row — `AppPanel tone="glass"` is the same elevated surface
 * `PageIntro` uses, and the close values sit at page-title scale
 * (`text-title-1-medium`), not the smaller `StatSurface`/table scale used for
 * dataset counts and individual securities.
 */
export function IndexOverview() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isError, error } = useIndices();
  // Never gates the cards: they render with no gaps while this is loading
  // or if it errors, per docs/plans/data-gap-handling.md §3.
  const indexGaps = useDataCoverage().data?.indices.gaps ?? [];

  const indices = (data?.data ?? [])
    .filter((index) => DISPLAY_CODES.includes(index.code))
    .sort(
      (a, b) => DISPLAY_CODES.indexOf(a.code) - DISPLAY_CODES.indexOf(b.code),
    );

  return (
    <AppPanel tone="glass" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-caption-1-semibold text-status-blue-text">
          {t("markets.indices.eyebrow")}
        </p>
        <p className="text-body-2-medium text-text-tertiary">
          {t("markets.indices.subtitle")}
        </p>
      </div>

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
              <IndexBlock index={index} locale={locale} gaps={indexGaps} />
            </div>
          ))}
        </div>
      )}
    </AppPanel>
  );
}

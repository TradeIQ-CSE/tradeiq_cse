import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { IndexLineChart } from "../../components/charts/IndexLineChart";
import { Button } from "../../components/base/buttons/button";
import { Chip } from "../../components/base/badges/chip";
import {
  DateRangePicker,
  type DateRangeValue,
} from "../../components/base/date-picker/date-range-picker";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../../components/base/segmented-control/segmented-control";
import {
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
  PageToolbar,
} from "../../components/application/layout/application-layout";
import { cx } from "../../utils/cx";
import { localeFor } from "../../i18n";
import { ApiError } from "../../lib/api";
import { defaultRangeAvoidingGaps } from "../../lib/data-gaps";
import { formatPrice, formatSigned } from "./format";
import { resampleIndexValues } from "./index-chart";
import { isWeekend } from "./ohlcv-chart";
import { OhlcvRange, OhlcvTimeframe } from "./types";
import { useIndices, useIndexValues } from "./useIndices";
import { useDataCoverage } from "./useDataCoverage";
import { BackToMarketsLink } from "./BackToMarketsLink";

const TIMEFRAMES: OhlcvTimeframe[] = ["daily", "weekly", "monthly"];
const RANGE_ERROR_ID = "index-range-error";

function IndexDetailView({ code }: { code: string }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const indicesQuery = useIndices();
  // Never gates the chart: it renders with no gaps while this is loading or
  // if it errors, per docs/plans/data-gap-handling.md §3.
  const coverageQuery = useDataCoverage();
  const indexGaps = useMemo(
    () => coverageQuery.data?.indices.gaps ?? [],
    [coverageQuery.data],
  );
  const [timeframe, setTimeframe] = useState<OhlcvTimeframe>("daily");
  const [committedRange, setCommittedRange] = useState<OhlcvRange>({});
  // True until the user picks an explicit range (or resets back to the
  // default): while true, the chart requests `defaultRange` below instead
  // of `committedRange`.
  const [isDefaultRange, setIsDefaultRange] = useState(true);
  const [selectedRange, setSelectedRange] = useState<DateRangeValue | null>(
    null,
  );

  const index = indicesQuery.data?.data.find((entry) => entry.code === code);

  // The API's own default is a trailing year, which can open right on a
  // `missing_data` gap (today: 2026-01-01..). `defaultRangeAvoidingGaps`
  // pulls that window back to the latest full year with no such gap;
  // `end === indexTo` means it found nothing to dodge, so `{}` is sent and
  // the API's own default applies exactly as before.
  const indexTo = coverageQuery.data?.indices.to ?? index?.latest?.date ?? null;
  const indexFrom = coverageQuery.data?.indices.from ?? null;
  const coverageSettled = coverageQuery.isSuccess || coverageQuery.isError;
  const defaultRange = useMemo<OhlcvRange>(() => {
    if (!coverageQuery.isSuccess || !indexTo) return {};
    const computed = defaultRangeAvoidingGaps(
      indexTo,
      indexFrom ?? indexTo,
      indexGaps,
    );
    return computed.end === indexTo
      ? {}
      : { from: computed.start, to: computed.end };
  }, [coverageQuery.isSuccess, indexTo, indexFrom, indexGaps]);

  const valuesQuery = useIndexValues(
    code,
    isDefaultRange ? defaultRange : committedRange,
    // While still on the default range, wait for coverage to settle (load
    // or error) before firing: otherwise this would fetch the API's plain
    // trailing year first and immediately refetch the gap-avoiding one, a
    // flash the user would see as the chart jumping.
    indicesQuery.isSuccess && (!isDefaultRange || coverageSettled),
  );

  const chartData = useMemo(
    () =>
      valuesQuery.data
        ? resampleIndexValues(valuesQuery.data.values, timeframe)
        : [],
    [valuesQuery.data, timeframe],
  );

  if (indicesQuery.isPending) {
    return (
      <AppPage>
        <BackToMarketsLink />
        <PageState kind="loading" title={t("markets.indices.loading")} />
      </AppPage>
    );
  }

  if (indicesQuery.isError) {
    return (
      <AppPage>
        <BackToMarketsLink />
        <PageState
          kind="error"
          title={t("markets.indices.unreachable")}
          description={
            indicesQuery.error instanceof ApiError
              ? indicesQuery.error.body.message
              : undefined
          }
          action={
            <Button variant="secondary" onClick={() => void indicesQuery.refetch()}>
              {t("securityDetail.actions.retry")}
            </Button>
          }
        />
      </AppPage>
    );
  }

  if (!index) {
    return (
      <AppPage>
        <BackToMarketsLink />
        <PageState
          kind="empty"
          title={t("markets.indices.notFound.title")}
          description={t("markets.indices.notFound.description")}
        />
      </AppPage>
    );
  }

  const latest = index.latest;
  const positive = (latest?.change ?? 0) >= 0;
  const valuesApiError =
    valuesQuery.error instanceof ApiError ? valuesQuery.error : null;
  const serverFieldErrors =
    valuesApiError?.body.code === "VALIDATION_FAILED"
      ? (valuesApiError.body.fields ?? [])
      : [];
  const rangeHasError = serverFieldErrors.length > 0;

  function resetRange() {
    setSelectedRange(null);
    setCommittedRange({});
    setIsDefaultRange(true);
  }

  return (
    <AppPage>
      <BackToMarketsLink />

      <PageIntro
        eyebrow={t("markets.indices.eyebrow")}
        title={index.code}
        description={index.name}
        actions={
          latest ? (
            <div className="flex flex-col sm:items-end">
              <strong className="text-title-2-medium tabular-nums text-text-primary">
                {formatPrice(latest.close, locale)}
              </strong>
              <div className="flex flex-wrap items-center gap-2">
                {latest.change !== null && latest.change_pct !== null && (
                  <Chip variant="bold" color={positive ? "lime" : "rose"}>
                    {formatSigned(latest.change, 2, locale)} (
                    {formatSigned(latest.change_pct, 2, locale)}%)
                  </Chip>
                )}
                <span className="text-body-2-medium text-text-tertiary">
                  {t("markets.asOf", { date: latest.date })}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-body-medium text-text-tertiary">
              {t("markets.indices.noLatest")}
            </span>
          )
        }
      />

      <AppPanel
        className="relative overflow-hidden p-0"
        aria-busy={valuesQuery.isFetching}
      >
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-headline-medium text-text-primary">
              {t("securityDetail.chart.title")}
            </h2>
            <p className="text-body-2-medium text-text-tertiary">
              {valuesQuery.data?.from && valuesQuery.data.to
                ? t("securityDetail.chart.range", {
                    from: valuesQuery.data.from,
                    to: valuesQuery.data.to,
                  })
                : t("securityDetail.chart.rangeUnavailable")}
            </p>
          </div>

          <div className="max-w-full overflow-x-auto pb-0.5">
            <SegmentedControl
              aria-label={t("securityDetail.chart.timeframeLabel")}
              selectedKeys={new Set([timeframe])}
              onSelectionChange={(keys) => {
                const [next] = [...keys];
                if (next) setTimeframe(next as OhlcvTimeframe);
              }}
            >
              {TIMEFRAMES.map((value) => (
                <SegmentedControlItem key={value} id={value}>
                  {t(`securityDetail.timeframes.${value}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
        </div>

        <PageToolbar className="mx-4 mb-3 sm:mx-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-body-2-medium text-text-secondary">
              {t("securityDetail.range.label")}
            </span>
            <DateRangePicker
              aria-label={t("securityDetail.range.label")}
              className="w-full sm:w-fit"
              value={selectedRange}
              isDateUnavailable={isWeekend}
              isInvalid={rangeHasError}
              describedBy={rangeHasError ? RANGE_ERROR_ID : undefined}
              placeholder={t("securityDetail.range.placeholder")}
              labels={{
                startDate: t("securityDetail.range.from"),
                endDate: t("securityDetail.range.to"),
                cancel: t("securityDetail.actions.cancel"),
                apply: t("securityDetail.actions.apply"),
                selectedDays: (count) =>
                  t("securityDetail.range.selectedDays", { count }),
              }}
              onChange={(value) => {
                setSelectedRange(value);
                setCommittedRange(
                  value
                    ? { from: value.start.toString(), to: value.end.toString() }
                    : {},
                );
                // An explicit pick leaves the default; clearing the picker
                // returns to it (same as the reset button).
                setIsDefaultRange(!value);
              }}
            />
          </div>
          <div className="flex items-end sm:ml-auto">
            <Button type="button" variant="ghost" size="small" onClick={resetRange}>
              {t("securityDetail.actions.reset")}
            </Button>
          </div>
        </PageToolbar>

        {rangeHasError && (
          <div
            id={RANGE_ERROR_ID}
            className="mx-4 mb-3 rounded-lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text"
            role="alert"
          >
            {serverFieldErrors.map((field) => (
              <p key={`${field.field}-${field.reason}`}>
                {t("securityDetail.range.fieldError", {
                  field: field.field,
                  reason: field.reason,
                })}
              </p>
            ))}
          </div>
        )}

        <div
          className={cx(
            "border-t border-separator-border px-3 py-4 sm:px-5",
          )}
          aria-live="polite"
        >
          {valuesQuery.isPending ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span
                className="size-6 animate-spin rounded-full border-2 border-border-button-default border-t-accent-500"
                aria-hidden="true"
              />
              <p className="text-body-medium text-text-secondary">
                {t("securityDetail.chart.loading")}
              </p>
            </div>
          ) : valuesQuery.isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-body-medium text-status-rose-text">
                {serverFieldErrors.length > 0
                  ? t("securityDetail.chart.validationFailed")
                  : (valuesApiError?.body.message ??
                    t("securityDetail.chart.unavailable"))}
              </p>
              {serverFieldErrors.length === 0 && (
                <Button variant="secondary" onClick={() => void valuesQuery.refetch()}>
                  {t("securityDetail.actions.retry")}
                </Button>
              )}
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-16 text-center">
              <h3 className="text-headline-medium text-text-primary">
                {t("securityDetail.chart.empty.title")}
              </h3>
              <p className="text-body-medium text-text-secondary">
                {t("securityDetail.chart.empty.description")}
              </p>
            </div>
          ) : (
            <IndexLineChart
              data={chartData}
              locale={locale}
              height={320}
              timeframe={timeframe}
              gaps={indexGaps}
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
      </AppPanel>
    </AppPage>
  );
}

export function IndexDetailPage() {
  const { code = "" } = useParams<{ code: string }>();
  const normalizedCode = code.trim().toLocaleUpperCase("en-US");

  if (!normalizedCode) {
    return (
      <IndexDetailView code="" />
    );
  }

  return <IndexDetailView key={normalizedCode} code={normalizedCode} />;
}

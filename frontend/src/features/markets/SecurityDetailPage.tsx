import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { RiArrowLeftLine } from "@remixicon/react";
import { parseDate } from "@internationalized/date";
import { CandlestickChart } from "../../components/charts/CandlestickChart";
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
import {
  MarketTerm,
  MarketTermHelp,
  type MarketTermKey,
} from "../../components/domain/market-term";
import { cx } from "../../utils/cx";
import { localeFor } from "../../i18n";
import { ApiError } from "../../lib/api";
import { formatCount, formatPrice, formatSigned, formatVolume } from "./format";
import { normalizeOhlcvBars, priceChartMode } from "./ohlcv-chart";
import {
  ListingStatus,
  OhlcvRange,
  OhlcvTimeframe,
  SecurityDetail,
} from "./types";
import { useSecurityDetail, useSecurityOhlcv } from "./useSecurityDetail";
import { SecuritySectorIcon } from "./SecuritySectorIcon";

const TIMEFRAMES: OhlcvTimeframe[] = ["daily", "weekly", "monthly"];
const RANGE_ERROR_ID = "security-range-error";

const STATUS_COLOR: Record<ListingStatus, "lime" | "yellow" | "rose"> = {
  listed: "lime",
  suspended: "yellow",
  delisted: "rose",
};

function isoDateLabel(day: string | null, locale: string): string {
  if (!day) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

// The <dt>/<dd> pair must stay wrapped in this one element: the tests reach a
// value through its label's parentElement.
function InfoItem({
  label,
  value,
  term,
}: {
  label: string;
  value: string;
  term?: MarketTermKey;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-separator-border py-2 last:border-b-0">
      <dt className="inline-flex items-center gap-1 text-body-medium text-text-secondary">
        {label}
        {term && <MarketTermHelp term={term} />}
      </dt>
      <dd className="text-right text-body-medium tabular-nums text-text-primary">
        {value}
      </dd>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      className="inline-flex w-fit items-center gap-1 text-body-medium text-text-secondary hover:text-text-primary"
      to="/markets"
    >
      <RiArrowLeftLine className="size-4" aria-hidden />
      {t("securityDetail.back")}
    </Link>
  );
}

function DetailState({
  kind,
  symbol,
  onRetry,
}: {
  kind: "loading" | "notFound" | "unavailable";
  symbol: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const displaySymbol =
    symbol.trim() || t("securityDetail.states.notFound.fallbackSymbol");

  return (
    <AppPage>
      <BackLink />
      <PageState
        kind={
          kind === "loading"
            ? "loading"
            : kind === "notFound"
              ? "empty"
              : "error"
        }
        title={
          kind === "loading"
            ? t("securityDetail.states.loading")
            : t(`securityDetail.states.${kind}.title`, {
                symbol: displaySymbol,
              })
        }
        description={
          kind === "loading"
            ? undefined
            : t(`securityDetail.states.${kind}.description`)
        }
        action={
          kind === "unavailable" && onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              {t("securityDetail.actions.retry")}
            </Button>
          ) : undefined
        }
      />
    </AppPage>
  );
}

function SecuritySummary({
  detail,
  locale,
}: {
  detail: SecurityDetail;
  locale: string;
}) {
  const { t } = useTranslation();
  const latest = detail.latest;
  const change = latest?.change ?? null;
  const changeTone =
    change === null
      ? "text-text-primary"
      : change >= 0
        ? "text-status-lime-text"
        : "text-status-rose-text";

  return (
    <PageIntro
      eyebrow={t("securityDetail.eyebrow")}
      title={detail.symbol}
      description={
        <span className="flex items-center gap-2">
          <SecuritySectorIcon sector={detail.sector} />
          <span>{detail.company_name}</span>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Chip variant="subtle" color={STATUS_COLOR[detail.listing_status]}>
            {t(`securityDetail.listingStatus.${detail.listing_status}`)}
          </Chip>
          <div className="flex flex-col sm:items-end">
            {latest ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-body-2-medium text-text-tertiary">
                    {t("securityDetail.currency")}
                  </span>
                  <strong className="text-title-2-medium tabular-nums text-text-primary">
                    {formatPrice(latest.close, locale)}
                  </strong>
                </div>
                <div
                  className={cx("text-body-medium tabular-nums", changeTone)}
                >
                  {latest.change === null
                    ? "—"
                    : formatSigned(latest.change, 2, locale)}
                  {latest.change_pct === null
                    ? ""
                    : ` (${formatSigned(latest.change_pct, 2, locale)}%)`}
                </div>
              </>
            ) : (
              <span className="text-body-medium text-text-tertiary">
                {t("securityDetail.states.noLatestPrice")}
              </span>
            )}
          </div>
        </div>
      }
    />
  );
}

function SecurityDetailView({ symbol }: { symbol: string }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const detailQuery = useSecurityDetail(symbol);
  const [timeframe, setTimeframe] = useState<OhlcvTimeframe>("daily");
  const [committedRange, setCommittedRange] = useState<OhlcvRange>({});
  const [selectedRange, setSelectedRange] = useState<DateRangeValue | null>(
    null,
  );
  const chartQuery = useSecurityOhlcv(
    symbol,
    timeframe,
    committedRange,
    detailQuery.isSuccess,
  );

  useEffect(() => {
    if (!chartQuery.data?.from || !chartQuery.data.to) return;
    setSelectedRange({
      start: parseDate(chartQuery.data.from),
      end: parseDate(chartQuery.data.to),
    });
  }, [chartQuery.data]);

  const chartData = useMemo(
    () => (chartQuery.data ? normalizeOhlcvBars(chartQuery.data) : []),
    [chartQuery.data],
  );
  const chartMode = priceChartMode(timeframe, chartData);

  if (detailQuery.isPending) {
    return <DetailState kind="loading" symbol={symbol} />;
  }

  if (detailQuery.isError) {
    const notFound =
      detailQuery.error instanceof ApiError &&
      detailQuery.error.body.code === "SECURITY_NOT_FOUND";
    return (
      <DetailState
        kind={notFound ? "notFound" : "unavailable"}
        symbol={symbol}
        onRetry={notFound ? undefined : () => void detailQuery.refetch()}
      />
    );
  }

  const detail = detailQuery.data;
  const chartApiError =
    chartQuery.error instanceof ApiError ? chartQuery.error : null;
  const serverFieldErrors =
    chartApiError?.body.code === "VALIDATION_FAILED"
      ? (chartApiError.body.fields ?? [])
      : [];
  const rangeHasError = serverFieldErrors.length > 0;
  const rangeDisabled = !detail.data_from || !detail.data_to;
  const coverageMinimum = detail.data_from
    ? parseDate(detail.data_from)
    : undefined;
  const coverageMaximum = detail.data_to
    ? parseDate(detail.data_to)
    : undefined;
  // The API default is a one-year query window, which can begin before the
  // first stored bar. Keep that server-resolved range selectable while still
  // preventing navigation beyond known coverage on either side.
  const minimumDate =
    selectedRange &&
    coverageMinimum &&
    selectedRange.start.compare(coverageMinimum) < 0
      ? selectedRange.start
      : coverageMinimum;
  const maximumDate =
    selectedRange &&
    coverageMaximum &&
    selectedRange.end.compare(coverageMaximum) > 0
      ? selectedRange.end
      : coverageMaximum;
  const coverage =
    detail.data_from && detail.data_to
      ? t("securityDetail.info.coverageValue", {
          from: isoDateLabel(detail.data_from, locale),
          to: isoDateLabel(detail.data_to, locale),
        })
      : "—";

  function resetRange() {
    setSelectedRange(null);
    setCommittedRange({});
  }

  // No <main> here: AppShell already renders one around every routed page, and
  // a second would nest the landmark inside itself.
  return (
    <AppPage>
      <BackLink />

      <SecuritySummary detail={detail} locale={locale} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AppPanel
          className="relative overflow-hidden p-0"
          aria-busy={chartQuery.isFetching}
        >
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:pt-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-headline-medium text-text-primary">
                {t("securityDetail.chart.title")}
              </h2>
              <p className="text-body-2-medium text-text-tertiary">
                {chartQuery.data?.from && chartQuery.data.to
                  ? t("securityDetail.chart.range", {
                      from: isoDateLabel(chartQuery.data.from, locale),
                      to: isoDateLabel(chartQuery.data.to, locale),
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
                minValue={minimumDate}
                maxValue={maximumDate}
                isDisabled={rangeDisabled}
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
                      ? {
                          from: value.start.toString(),
                          to: value.end.toString(),
                        }
                      : {},
                  );
                }}
              />
            </div>
            <div className="flex items-end sm:ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="small"
                onClick={resetRange}
              >
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
            className="border-t border-separator-border px-3 py-4 sm:px-5"
            aria-live="polite"
          >
            {chartQuery.isPending ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <span
                  className="size-6 animate-spin rounded-full border-2 border-border-button-default border-t-accent-500"
                  aria-hidden="true"
                />
                <p className="text-body-medium text-text-secondary">
                  {t("securityDetail.chart.loading")}
                </p>
              </div>
            ) : chartQuery.isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-body-medium text-status-rose-text">
                  {serverFieldErrors.length > 0
                    ? t("securityDetail.chart.validationFailed")
                    : (chartApiError?.body.message ??
                      t("securityDetail.chart.unavailable"))}
                </p>
                {serverFieldErrors.length === 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => void chartQuery.refetch()}
                  >
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
              <div className="flex flex-col gap-3">
                {chartMode === "close" ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-2-medium text-text-secondary">
                    <span className="inline-flex items-center gap-1.5 text-text-primary">
                      <span
                        className="h-0.5 w-4 rounded-full bg-accent-500"
                        aria-hidden
                      />
                      {t("securityDetail.chart.legend.closePrice")}
                    </span>
                    <span>
                      {t("securityDetail.chart.legend.closeOnlyHelp")}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-4 text-body-2-medium text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-sm bg-status-lime-text"
                        aria-hidden
                      />
                      {t("securityDetail.chart.legend.up")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-sm bg-status-rose-text"
                        aria-hidden
                      />
                      {t("securityDetail.chart.legend.down")}
                    </span>
                    <span>{t("securityDetail.chart.legend.help")}</span>
                  </div>
                )}
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption-1-medium text-text-tertiary"
                  aria-label={t("securityDetail.chart.termsLabel")}
                >
                  {(chartMode === "candlestick"
                    ? (["open", "high", "low", "close", "volume"] as const)
                    : (["close", "volume"] as const)
                  ).map((term) => (
                    <MarketTerm key={term} term={term} />
                  ))}
                </div>
                <CandlestickChart
                  data={chartData}
                  mode={chartMode}
                  locale={locale}
                  accessibleLabel={t(
                    chartMode === "close"
                      ? "securityDetail.chart.accessibleCloseLabel"
                      : "securityDetail.chart.accessibleLabel",
                    {
                      symbol: detail.symbol,
                      timeframe: t(`securityDetail.timeframes.${timeframe}`),
                    },
                  )}
                  labels={{
                    date: t("securityDetail.chart.values.date"),
                    open: t("securityDetail.chart.values.open"),
                    high: t("securityDetail.chart.values.high"),
                    low: t("securityDetail.chart.values.low"),
                    close: t("securityDetail.chart.values.close"),
                    adjustedClose: t(
                      "securityDetail.chart.values.adjustedClose",
                    ),
                    volume: t("securityDetail.chart.values.volume"),
                  }}
                />
              </div>
            )}
          </div>
        </AppPanel>

        <AppPanel className="xl:sticky xl:top-4" role="complementary">
          <h2 className="mb-2 text-headline-medium text-text-primary">
            {t("securityDetail.info.title")}
          </h2>
          <dl>
            <InfoItem
              label={t("securityDetail.info.sector")}
              value={detail.sector?.name ?? "—"}
              term="sector"
            />
            <InfoItem
              label={t("securityDetail.info.cseCode")}
              value={detail.cse_code ?? "—"}
            />
            <InfoItem
              label={t("securityDetail.info.listingStatus")}
              value={t(`securityDetail.listingStatus.${detail.listing_status}`)}
            />
            <InfoItem
              label={t("securityDetail.info.lastTrade")}
              value={isoDateLabel(detail.latest?.trade_date ?? null, locale)}
            />
            <InfoItem
              label={t("securityDetail.info.volume")}
              value={
                detail.latest ? formatVolume(detail.latest.volume, locale) : "—"
              }
              term="volume"
            />
            <InfoItem
              label={t("securityDetail.info.sharesOutstanding")}
              value={
                detail.shares_outstanding === null
                  ? "—"
                  : formatCount(detail.shares_outstanding, locale)
              }
              term="sharesOutstanding"
            />
            <InfoItem
              label={t("securityDetail.info.coverage")}
              value={coverage}
            />
            <InfoItem
              label={t("securityDetail.info.peRatio")}
              value={
                detail.ratios?.pe_ratio === null ||
                detail.ratios?.pe_ratio === undefined
                  ? "—"
                  : formatPrice(detail.ratios.pe_ratio, locale)
              }
              term="peRatio"
            />
            <InfoItem
              label={t("securityDetail.info.pbRatio")}
              value={
                detail.ratios?.pb_ratio === null ||
                detail.ratios?.pb_ratio === undefined
                  ? "—"
                  : formatPrice(detail.ratios.pb_ratio, locale)
              }
              term="pbRatio"
            />
            <InfoItem
              label={t("securityDetail.info.ratioDate")}
              value={isoDateLabel(detail.ratios?.valid_from ?? null, locale)}
            />
          </dl>
        </AppPanel>
      </div>
    </AppPage>
  );
}

export function SecurityDetailPage() {
  const { symbol = "" } = useParams<{ symbol: string }>();
  const normalizedSymbol = symbol.trim();

  if (!normalizedSymbol) {
    return <DetailState kind="notFound" symbol="" />;
  }

  // The key remounts local controls synchronously when only the route param
  // changes, so a new symbol can never inherit the previous symbol's range.
  return (
    <SecurityDetailView
      key={normalizedSymbol.toLocaleUpperCase("en-US")}
      symbol={normalizedSymbol}
    />
  );
}

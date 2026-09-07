import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { RiArrowLeftLine } from '@remixicon/react';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { Button } from '../../components/base/buttons/button';
import { Chip } from '../../components/base/badges/chip';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '../../components/base/segmented-control/segmented-control';
import { cx } from '../../utils/cx';
import { localeFor } from '../../i18n';
import { ApiError } from '../../lib/api';
import { formatCount, formatPrice, formatSigned, formatVolume } from './format';
import { normalizeOhlcvBars } from './ohlcv-chart';
import { ListingStatus, OhlcvRange, OhlcvTimeframe, SecurityDetail } from './types';
import { useSecurityDetail, useSecurityOhlcv } from './useSecurityDetail';

const TIMEFRAMES: OhlcvTimeframe[] = ['daily', 'weekly', 'monthly'];
const RANGE_ERROR_ID = 'security-range-error';

// Shared with the paper-trading screens in spirit but not in code: those
// primitives live in features/paper-trading/ui.tsx, and a cross-feature import
// would couple two features that only happen to look alike. Promoting them to
// a shared module is Phase 7 cleanup.
const FIELD_SHELL =
  'rounded-2lg bg-background-tertiary-default px-3 py-2 text-body-regular text-text-primary ' +
  'ring-1 ring-inset ring-border-button-default outline-none ' +
  'hover:ring-2 hover:ring-border-button-hover focus:ring-2 focus:ring-border-button-active ' +
  'disabled:cursor-not-allowed disabled:bg-input-disabled-background disabled:text-input-disabled-text';

const STATUS_COLOR: Record<ListingStatus, 'lime' | 'yellow' | 'rose'> = {
  listed: 'lime',
  suspended: 'yellow',
  delisted: 'rose',
};

function isoDateLabel(day: string | null, locale: string): string {
  if (!day) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

// The <dt>/<dd> pair must stay wrapped in this one element: the tests reach a
// value through its label's parentElement.
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-separator-border py-2 last:border-b-0">
      <dt className="text-body-medium text-text-secondary">{label}</dt>
      <dd className="text-right text-body-medium tabular-nums text-text-primary">{value}</dd>
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
      {t('securityDetail.back')}
    </Link>
  );
}

function DetailState({
  kind,
  symbol,
  onRetry,
}: {
  kind: 'loading' | 'notFound' | 'unavailable';
  symbol: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const displaySymbol = symbol.trim() || t('securityDetail.states.notFound.fallbackSymbol');

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <section
        className="flex flex-col items-center gap-2 rounded-2xl border border-border-table bg-background-primary-default px-6 py-16 text-center"
        aria-live="polite"
      >
        {kind === 'loading' ? (
          <>
            <span
              className="size-6 animate-spin rounded-full border-2 border-border-button-default border-t-accent-500"
              aria-hidden="true"
            />
            <h1 className="text-headline-medium text-text-secondary">
              {t('securityDetail.states.loading')}
            </h1>
          </>
        ) : (
          <>
            <h1 className="text-title-2-medium text-text-primary">
              {t(`securityDetail.states.${kind}.title`, { symbol: displaySymbol })}
            </h1>
            <p className="max-w-prose text-body-medium text-text-secondary">
              {t(`securityDetail.states.${kind}.description`)}
            </p>
            {kind === 'unavailable' && onRetry && (
              <Button variant="secondary" className="mt-2" onClick={onRetry}>
                {t('securityDetail.actions.retry')}
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SecuritySummary({ detail, locale }: { detail: SecurityDetail; locale: string }) {
  const { t } = useTranslation();
  const latest = detail.latest;
  const change = latest?.change ?? null;
  const changeTone =
    change === null ? 'text-text-primary' : change >= 0 ? 'text-status-lime-text' : 'text-status-rose-text';

  return (
    <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border-table bg-background-primary-default p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-title-1-medium text-text-primary">{detail.symbol}</h1>
          <Chip variant="subtle" color={STATUS_COLOR[detail.listing_status]}>
            {t(`securityDetail.listingStatus.${detail.listing_status}`)}
          </Chip>
        </div>
        <p className="text-body-medium text-text-secondary">{detail.company_name}</p>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        {latest ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-body-2-medium text-text-tertiary">
                {t('securityDetail.currency')}
              </span>
              <strong className="text-title-2-medium tabular-nums text-text-primary">
                {formatPrice(latest.close, locale)}
              </strong>
            </div>
            <div className={cx('text-body-medium tabular-nums', changeTone)}>
              {latest.change === null ? '—' : formatSigned(latest.change, 2, locale)}
              {latest.change_pct === null
                ? ''
                : ` (${formatSigned(latest.change_pct, 2, locale)}%)`}
            </div>
          </>
        ) : (
          <span className="text-body-medium text-text-tertiary">
            {t('securityDetail.states.noLatestPrice')}
          </span>
        )}
      </div>
    </section>
  );
}

function SecurityDetailView({ symbol }: { symbol: string }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const detailQuery = useSecurityDetail(symbol);
  const [timeframe, setTimeframe] = useState<OhlcvTimeframe>('daily');
  const [committedRange, setCommittedRange] = useState<OhlcvRange>({});
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [clientRangeError, setClientRangeError] = useState<string | null>(null);
  const chartQuery = useSecurityOhlcv(symbol, timeframe, committedRange, detailQuery.isSuccess);

  useEffect(() => {
    if (!chartQuery.data) return;
    setDraftFrom(chartQuery.data.from ?? '');
    setDraftTo(chartQuery.data.to ?? '');
  }, [chartQuery.data]);

  const chartData = useMemo(
    () => (chartQuery.data ? normalizeOhlcvBars(chartQuery.data) : []),
    [chartQuery.data],
  );

  if (detailQuery.isPending) {
    return <DetailState kind="loading" symbol={symbol} />;
  }

  if (detailQuery.isError) {
    const notFound =
      detailQuery.error instanceof ApiError &&
      detailQuery.error.body.code === 'SECURITY_NOT_FOUND';
    return (
      <DetailState
        kind={notFound ? 'notFound' : 'unavailable'}
        symbol={symbol}
        onRetry={notFound ? undefined : () => void detailQuery.refetch()}
      />
    );
  }

  const detail = detailQuery.data;
  const chartApiError = chartQuery.error instanceof ApiError ? chartQuery.error : null;
  const serverFieldErrors =
    chartApiError?.body.code === 'VALIDATION_FAILED' ? (chartApiError.body.fields ?? []) : [];
  const rangeHasError = clientRangeError !== null || serverFieldErrors.length > 0;
  const rangeDisabled = !detail.data_from || !detail.data_to;
  const coverage =
    detail.data_from && detail.data_to
      ? t('securityDetail.info.coverageValue', {
          from: isoDateLabel(detail.data_from, locale),
          to: isoDateLabel(detail.data_to, locale),
        })
      : '—';

  function commitRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientRangeError(null);
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setClientRangeError(t('securityDetail.range.fromAfterTo'));
      return;
    }
    setCommittedRange({ from: draftFrom || undefined, to: draftTo || undefined });
  }

  function resetRange() {
    setClientRangeError(null);
    setDraftFrom('');
    setDraftTo('');
    setCommittedRange({});
  }

  // No <main> here: AppShell already renders one around every routed page, and
  // a second would nest the landmark inside itself.
  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <SecuritySummary detail={detail} locale={locale} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className="relative overflow-hidden rounded-2xl border border-border-table bg-background-primary-default"
          aria-busy={chartQuery.isFetching}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="text-headline-medium text-text-primary">
                {t('securityDetail.chart.title')}
              </h2>
              <p className="text-body-2-medium text-text-tertiary">
                {chartQuery.data?.from && chartQuery.data.to
                  ? t('securityDetail.chart.range', {
                      from: isoDateLabel(chartQuery.data.from, locale),
                      to: isoDateLabel(chartQuery.data.to, locale),
                    })
                  : t('securityDetail.chart.rangeUnavailable')}
              </p>
            </div>

            <SegmentedControl
              aria-label={t('securityDetail.chart.timeframeLabel')}
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

          <form
            className="flex flex-wrap items-end gap-3 px-4 pb-3"
            onSubmit={commitRange}
            noValidate
          >
            <label className="flex flex-col gap-1">
              <span className="text-body-2-medium text-text-secondary">
                {t('securityDetail.range.from')}
              </span>
              <input
                type="date"
                className={FIELD_SHELL}
                value={draftFrom}
                min={detail.data_from ?? undefined}
                max={draftTo || detail.data_to || undefined}
                disabled={rangeDisabled}
                aria-invalid={rangeHasError}
                aria-describedby={rangeHasError ? RANGE_ERROR_ID : undefined}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  setClientRangeError(null);
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-body-2-medium text-text-secondary">
                {t('securityDetail.range.to')}
              </span>
              <input
                type="date"
                className={FIELD_SHELL}
                value={draftTo}
                min={draftFrom || detail.data_from || undefined}
                max={detail.data_to ?? undefined}
                disabled={rangeDisabled}
                aria-invalid={rangeHasError}
                aria-describedby={rangeHasError ? RANGE_ERROR_ID : undefined}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  setClientRangeError(null);
                }}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary" size="small">
                {t('securityDetail.actions.apply')}
              </Button>
              <Button type="button" variant="ghost" size="small" onClick={resetRange}>
                {t('securityDetail.actions.reset')}
              </Button>
            </div>
          </form>

          {rangeHasError && (
            <div
              id={RANGE_ERROR_ID}
              className="mx-4 mb-3 rounded-lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text"
              role="alert"
            >
              {clientRangeError && <p>{clientRangeError}</p>}
              {serverFieldErrors.map((field) => (
                <p key={`${field.field}-${field.reason}`}>
                  {t('securityDetail.range.fieldError', {
                    field: field.field,
                    reason: field.reason,
                  })}
                </p>
              ))}
            </div>
          )}

          <div className="border-t border-separator-border px-4 py-4" aria-live="polite">
            {chartQuery.isPending ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <span
                  className="size-6 animate-spin rounded-full border-2 border-border-button-default border-t-accent-500"
                  aria-hidden="true"
                />
                <p className="text-body-medium text-text-secondary">
                  {t('securityDetail.chart.loading')}
                </p>
              </div>
            ) : chartQuery.isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-body-medium text-status-rose-text">
                  {serverFieldErrors.length > 0
                    ? t('securityDetail.chart.validationFailed')
                    : (chartApiError?.body.message ?? t('securityDetail.chart.unavailable'))}
                </p>
                {serverFieldErrors.length === 0 && (
                  <Button variant="secondary" onClick={() => void chartQuery.refetch()}>
                    {t('securityDetail.actions.retry')}
                  </Button>
                )}
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <h3 className="text-headline-medium text-text-primary">
                  {t('securityDetail.chart.empty.title')}
                </h3>
                <p className="text-body-medium text-text-secondary">
                  {t('securityDetail.chart.empty.description')}
                </p>
              </div>
            ) : (
              <CandlestickChart
                data={chartData}
                locale={locale}
                accessibleLabel={t('securityDetail.chart.accessibleLabel', {
                  symbol: detail.symbol,
                  timeframe: t(`securityDetail.timeframes.${timeframe}`),
                })}
                labels={{
                  date: t('securityDetail.chart.values.date'),
                  open: t('securityDetail.chart.values.open'),
                  high: t('securityDetail.chart.values.high'),
                  low: t('securityDetail.chart.values.low'),
                  close: t('securityDetail.chart.values.close'),
                  adjustedClose: t('securityDetail.chart.values.adjustedClose'),
                  volume: t('securityDetail.chart.values.volume'),
                }}
              />
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-border-table bg-background-primary-default p-4">
          <h2 className="mb-2 text-headline-medium text-text-primary">
            {t('securityDetail.info.title')}
          </h2>
          <dl>
            <InfoItem label={t('securityDetail.info.sector')} value={detail.sector?.name ?? '—'} />
            <InfoItem label={t('securityDetail.info.cseCode')} value={detail.cse_code ?? '—'} />
            <InfoItem
              label={t('securityDetail.info.listingStatus')}
              value={t(`securityDetail.listingStatus.${detail.listing_status}`)}
            />
            <InfoItem
              label={t('securityDetail.info.lastTrade')}
              value={isoDateLabel(detail.latest?.trade_date ?? null, locale)}
            />
            <InfoItem
              label={t('securityDetail.info.volume')}
              value={detail.latest ? formatVolume(detail.latest.volume, locale) : '—'}
            />
            <InfoItem
              label={t('securityDetail.info.sharesOutstanding')}
              value={
                detail.shares_outstanding === null
                  ? '—'
                  : formatCount(detail.shares_outstanding, locale)
              }
            />
            <InfoItem label={t('securityDetail.info.coverage')} value={coverage} />
            <InfoItem
              label={t('securityDetail.info.peRatio')}
              value={
                detail.ratios?.pe_ratio === null || detail.ratios?.pe_ratio === undefined
                  ? '—'
                  : formatPrice(detail.ratios.pe_ratio, locale)
              }
            />
            <InfoItem
              label={t('securityDetail.info.pbRatio')}
              value={
                detail.ratios?.pb_ratio === null || detail.ratios?.pb_ratio === undefined
                  ? '—'
                  : formatPrice(detail.ratios.pb_ratio, locale)
              }
            />
            <InfoItem
              label={t('securityDetail.info.ratioDate')}
              value={isoDateLabel(detail.ratios?.valid_from ?? null, locale)}
            />
          </dl>
        </aside>
      </div>
    </div>
  );
}

export function SecurityDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const normalizedSymbol = symbol.trim();

  if (!normalizedSymbol) {
    return <DetailState kind="notFound" symbol="" />;
  }

  // The key remounts local controls synchronously when only the route param
  // changes, so a new symbol can never inherit the previous symbol's range.
  return (
    <SecurityDetailView
      key={normalizedSymbol.toLocaleUpperCase('en-US')}
      symbol={normalizedSymbol}
    />
  );
}

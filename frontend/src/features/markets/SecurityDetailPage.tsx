import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { CandlestickChart } from '../../components/charts/CandlestickChart';
import { localeFor } from '../../i18n';
import { ApiError } from '../../lib/api';
import { formatCount, formatPrice, formatSigned, formatVolume } from './format';
import { normalizeOhlcvBars } from './ohlcv-chart';
import { OhlcvRange, OhlcvTimeframe, SecurityDetail } from './types';
import { useSecurityDetail, useSecurityOhlcv } from './useSecurityDetail';
import './security-detail.css';

const TIMEFRAMES: OhlcvTimeframe[] = ['daily', 'weekly', 'monthly'];
const RANGE_ERROR_ID = 'security-range-error';

function isoDateLabel(day: string | null, locale: string): string {
  if (!day) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="security-info__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
  return (
    <AppShell>
      <main className="security-detail-page">
        <Link className="security-detail-page__back" to="/markets">
          ← {t('securityDetail.back')}
        </Link>
        <section
          className={`security-detail-state security-detail-state--${kind}`}
          aria-live="polite"
        >
          {kind === 'loading' ? (
            <>
              <span className="security-detail-state__spinner" aria-hidden="true" />
              <h1>{t('securityDetail.states.loading')}</h1>
            </>
          ) : (
            <>
              <h1>
                {t(`securityDetail.states.${kind}.title`, { symbol })}
              </h1>
              <p>{t(`securityDetail.states.${kind}.description`)}</p>
              {kind === 'unavailable' && onRetry && (
                <button type="button" onClick={onRetry}>
                  {t('securityDetail.actions.retry')}
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </AppShell>
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
  const changePositive = latest?.change !== null && (latest?.change ?? 0) >= 0;
  const changeClass =
    latest?.change === null || latest?.change === undefined
      ? ''
      : changePositive
        ? 'security-summary__change--positive'
        : 'security-summary__change--negative';

  return (
    <section className="security-summary">
      <div className="security-summary__identity">
        <div className="security-summary__symbol-line">
          <h1>{detail.symbol}</h1>
          <span
            className={`security-summary__status security-summary__status--${detail.listing_status}`}
          >
            {t(`securityDetail.listingStatus.${detail.listing_status}`)}
          </span>
        </div>
        <p>{detail.company_name}</p>
      </div>

      <div className="security-summary__price">
        {latest ? (
          <>
            <div className="security-summary__price-line">
              <span className="security-summary__currency">
                {t('securityDetail.currency')}
              </span>
              <strong>{formatPrice(latest.close, locale)}</strong>
            </div>
            <div className={`security-summary__change ${changeClass}`}>
              {latest.change === null
                ? '—'
                : formatSigned(latest.change, 2, locale)}
              {latest.change_pct === null
                ? ''
                : ` (${formatSigned(latest.change_pct, 2, locale)}%)`}
            </div>
          </>
        ) : (
          <span className="security-summary__no-price">
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
  const chartQuery = useSecurityOhlcv(
    symbol,
    timeframe,
    committedRange,
    detailQuery.isSuccess,
  );

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
    chartApiError?.body.code === 'VALIDATION_FAILED'
      ? (chartApiError.body.fields ?? [])
      : [];
  const rangeHasError = clientRangeError !== null || serverFieldErrors.length > 0;
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
    setCommittedRange({
      from: draftFrom || undefined,
      to: draftTo || undefined,
    });
  }

  function resetRange() {
    setClientRangeError(null);
    setDraftFrom('');
    setDraftTo('');
    setCommittedRange({});
  }

  return (
    <AppShell>
      <main className="security-detail-page">
        <Link className="security-detail-page__back" to="/markets">
          ← {t('securityDetail.back')}
        </Link>

        <SecuritySummary detail={detail} locale={locale} />

        <div className="security-detail-layout">
          <section className="security-chart-card" aria-busy={chartQuery.isFetching}>
            <div className="security-chart-card__header">
              <div>
                <h2>{t('securityDetail.chart.title')}</h2>
                <p>
                  {chartQuery.data?.from && chartQuery.data.to
                    ? t('securityDetail.chart.range', {
                        from: isoDateLabel(chartQuery.data.from, locale),
                        to: isoDateLabel(chartQuery.data.to, locale),
                      })
                    : t('securityDetail.chart.rangeUnavailable')}
                </p>
              </div>

              <div
                className="security-timeframes"
                role="group"
                aria-label={t('securityDetail.chart.timeframeLabel')}
              >
                {TIMEFRAMES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value === timeframe ? 'security-timeframes__active' : ''}
                    aria-pressed={value === timeframe}
                    onClick={() => setTimeframe(value)}
                  >
                    {t(`securityDetail.timeframes.${value}`)}
                  </button>
                ))}
              </div>
            </div>

            <form className="security-range" onSubmit={commitRange} noValidate>
              <label>
                <span>{t('securityDetail.range.from')}</span>
                <input
                  type="date"
                  value={draftFrom}
                  min={detail.data_from ?? undefined}
                  max={draftTo || detail.data_to || undefined}
                  disabled={!detail.data_from || !detail.data_to}
                  aria-invalid={rangeHasError}
                  aria-describedby={rangeHasError ? RANGE_ERROR_ID : undefined}
                  onChange={(event) => {
                    setDraftFrom(event.target.value);
                    setClientRangeError(null);
                  }}
                />
              </label>
              <label>
                <span>{t('securityDetail.range.to')}</span>
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom || detail.data_from || undefined}
                  max={detail.data_to ?? undefined}
                  disabled={!detail.data_from || !detail.data_to}
                  aria-invalid={rangeHasError}
                  aria-describedby={rangeHasError ? RANGE_ERROR_ID : undefined}
                  onChange={(event) => {
                    setDraftTo(event.target.value);
                    setClientRangeError(null);
                  }}
                />
              </label>
              <div className="security-range__actions">
                <button type="submit">{t('securityDetail.actions.apply')}</button>
                <button type="button" className="security-range__reset" onClick={resetRange}>
                  {t('securityDetail.actions.reset')}
                </button>
              </div>
            </form>

            {rangeHasError && (
              <div id={RANGE_ERROR_ID} className="security-range__error" role="alert">
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

            <div className="security-chart-card__body" aria-live="polite">
              {chartQuery.isPending ? (
                <div className="security-chart-state">
                  <span className="security-detail-state__spinner" aria-hidden="true" />
                  <p>{t('securityDetail.chart.loading')}</p>
                </div>
              ) : chartQuery.isError ? (
                <div className="security-chart-state security-chart-state--error">
                  <p>
                    {serverFieldErrors.length > 0
                      ? t('securityDetail.chart.validationFailed')
                      : chartApiError?.body.message ?? t('securityDetail.chart.unavailable')}
                  </p>
                  {serverFieldErrors.length === 0 && (
                    <button type="button" onClick={() => void chartQuery.refetch()}>
                      {t('securityDetail.actions.retry')}
                    </button>
                  )}
                </div>
              ) : chartData.length === 0 ? (
                <div className="security-chart-state">
                  <h3>{t('securityDetail.chart.empty.title')}</h3>
                  <p>{t('securityDetail.chart.empty.description')}</p>
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

          <aside className="security-info-card">
            <h2>{t('securityDetail.info.title')}</h2>
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
                value={
                  detail.latest ? formatVolume(detail.latest.volume, locale) : '—'
                }
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
      </main>
    </AppShell>
  );
}

export function SecurityDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  // The key remounts local controls synchronously when only the route param
  // changes, so a new symbol can never inherit the previous symbol's range.
  return <SecurityDetailView key={symbol.toLocaleUpperCase('en-US')} symbol={symbol} />;
}

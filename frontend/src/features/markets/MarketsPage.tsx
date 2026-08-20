import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../../layout/AppShell';
import { ApiError } from '../../lib/api';
import { localeFor } from '../../i18n';
import watchAddIcon from '../../assets/icons/watch-add.svg';
import { SecuritiesSort } from './types';
import { useSecurities } from './useSecurities';
import {
  formatCount,
  formatPrice,
  formatSigned,
  formatVolume,
  marketCapBand,
} from './format';
import './markets.css';

const PAGE_SIZE = 20;

type FilterChip = 'all' | 'gainers' | 'losers' | 'mostActive';

const FILTER_CHIPS: FilterChip[] = ['all', 'gainers', 'losers', 'mostActive'];

export function MarketsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SecuritiesSort>('symbol');
  const [page, setPage] = useState(1);
  const [asOf, setAsOf] = useState('');
  const [watched, setWatched] = useState<Set<string>>(new Set());

  const { data, isPending, isError, error } = useSecurities({
    search: search.trim(),
    as_of: asOf,
    sort,
    page,
    page_size: PAGE_SIZE,
  });

  const total = data?.meta?.total ?? 0;
  // Server-echoed date the rows are priced at. Every row on the page shares it,
  // so it is stated once here rather than per row.
  const resolvedAsOf = data?.meta?.as_of ?? '';
  const availableFrom = data?.meta?.available_from ?? undefined;
  const availableTo = data?.meta?.available_to ?? undefined;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dash = t('markets.empty');

  function toggleWatch(symbol: string) {
    setWatched((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function toggleSort(next: SecuritiesSort) {
    setSort(next);
    setPage(1);
  }

  return (
    <AppShell
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
    >
      <div className="markets-page">
        <header className="markets-page__header">
          <div>
            <h1>{t('markets.title')}</h1>
            <p className="markets-page__subtitle">
              {t('markets.subtitle', {
                count: total,
                formattedCount: formatCount(total, locale),
              })}
              {resolvedAsOf ? ` · ${t('markets.asOf', { date: resolvedAsOf })}` : ''}
            </p>
          </div>

          <label className="markets-page__date">
            <span>{t('markets.tradingDate')}</span>
            <input
              type="date"
              className="markets-select"
              value={asOf || resolvedAsOf}
              min={availableFrom}
              max={availableTo}
              onChange={(event) => {
                setAsOf(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </header>

        <div className="markets-page__filters">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`markets-chip${chip === 'all' ? ' markets-chip--active' : ''}`}
              disabled={chip !== 'all'}
              title={
                chip !== 'all'
                  ? t('markets.unavailable.marketOverview')
                  : undefined
              }
            >
              {t(`markets.filters.${chip}`)}
            </button>
          ))}

          <span className="markets-page__divider" />

          {/*
            Segment stays disabled while every seeded security has a NULL
            sector — see the sector gap in pipeline/data-ingestion/README.md.
            useSectorOptions.ts implements the derive-from-/securities pattern
            (endpoint-catalogue-v0.md §8) and can be wired back in unchanged
            once a symbol->sector mapping exists.
          */}
          <select
            className="markets-select"
            disabled
            title={t('markets.unavailable.sectors')}
          >
            <option>{t('markets.filters.selectSegment')}</option>
          </select>

          <select
            className="markets-select"
            disabled
            title={t('markets.unavailable.marketOverview')}
          >
            <option>{t('markets.filters.selectMarketCap')}</option>
          </select>
        </div>

        <div className="markets-card">
          {isError ? (
            <div className="markets-page__state markets-page__state--error">
              {error instanceof ApiError
                ? error.body.message
                : t('markets.states.unreachable')}
            </div>
          ) : !isPending && data && data.data.length === 0 ? (
            <div className="markets-page__state">{t('markets.states.empty')}</div>
          ) : (
            <>
              <div className="markets-row markets-row--head">
                <button
                  className="markets-sort"
                  onClick={() => toggleSort('symbol')}
                  aria-current={sort === 'symbol'}
                >
                  {t('markets.columns.symbol')}
                </button>
                <button
                  className="markets-sort"
                  onClick={() => toggleSort('company_name')}
                  aria-current={sort === 'company_name'}
                >
                  {t('markets.columns.sector')}
                </button>
                <span>{t('markets.columns.cap')}</span>
                <span className="markets-col--right">
                  {t('markets.columns.price')}
                </span>
                <span className="markets-col--right">
                  {t('markets.columns.change')}
                </span>
                <span className="markets-col--right">
                  {t('markets.columns.changePct')}
                </span>
                <span className="markets-col--right">
                  {t('markets.columns.volume')}
                </span>
                <span className="markets-col--right">
                  {t('markets.columns.peRatio')}
                </span>
                <span className="markets-col--right">
                  {t('markets.columns.watch')}
                </span>
              </div>

              <div className="markets-card__body">
                {isPending && !data
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div className="markets-row markets-row--skeleton" key={i} />
                    ))
                  : data?.data.map((security) => {
                      const band = marketCapBand(
                        security.shares_outstanding,
                        security.price,
                      );
                      const positive = (security.change ?? 0) >= 0;
                      const isWatched = watched.has(security.symbol);
                      return (
                        <div className="markets-row" key={security.symbol}>
                          <div className="markets-row__symbol">
                            <span className="markets-row__ticker">
                              {security.symbol}
                            </span>
                            <span className="markets-row__company">
                              {security.company_name}
                            </span>
                          </div>
                          <span className="markets-row__sector">
                            {security.sector?.name ?? dash}
                          </span>
                          <span className="markets-row__cap">
                            {band ? t(`markets.cap.${band}`) : dash}
                          </span>
                          <span className="markets-col--right markets-mono markets-row__price">
                            {security.price !== null
                              ? formatPrice(security.price, locale)
                              : dash}
                          </span>
                          <span
                            className={`markets-col--right markets-mono ${
                              security.change === null
                                ? ''
                                : positive
                                  ? 'markets-positive'
                                  : 'markets-negative'
                            }`}
                          >
                            {security.change !== null
                              ? formatSigned(security.change, 2, locale)
                              : dash}
                          </span>
                          <span
                            className={`markets-col--right markets-mono ${
                              security.change_pct === null
                                ? ''
                                : positive
                                  ? 'markets-positive'
                                  : 'markets-negative'
                            }`}
                          >
                            {security.change_pct !== null
                              ? `${formatSigned(security.change_pct, 2, locale)}%`
                              : dash}
                          </span>
                          <span className="markets-col--right markets-mono markets-row__volume">
                            {security.volume !== null
                              ? formatVolume(security.volume, locale)
                              : dash}
                          </span>
                          <span className="markets-col--right markets-mono markets-row__volume">
                            {security.pe_ratio !== null
                              ? formatPrice(security.pe_ratio, locale)
                              : dash}
                          </span>
                          <span className="markets-col--right">
                            <button
                              type="button"
                              className={`markets-watch${
                                isWatched ? ' markets-watch--active' : ''
                              }`}
                              onClick={() => toggleWatch(security.symbol)}
                              aria-pressed={isWatched}
                              title={t(
                                isWatched
                                  ? 'markets.watch.remove'
                                  : 'markets.watch.add',
                              )}
                            >
                              <img src={watchAddIcon} alt="" width={14} height={14} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
              </div>
            </>
          )}
        </div>

        {!isError && total > 0 && (
          <footer className="markets-page__footer">
            <span>
              {t('markets.pagination.page', {
                page: formatCount(page, locale),
                lastPage: formatCount(lastPage, locale),
              })}
            </span>
            <div className="markets-page__pager">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('markets.pagination.previous')}
              </button>
              <button
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('markets.pagination.next')}
              </button>
            </div>
          </footer>
        )}
      </div>
    </AppShell>
  );
}

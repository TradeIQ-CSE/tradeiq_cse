import { useState } from 'react';
import { AppShell } from '../../layout/AppShell';
import { ApiError } from '../../lib/api';
import watchAddIcon from '../../assets/icons/watch-add.svg';
import { SecuritiesSort } from './types';
import { useSecurities } from './useSecurities';
import {
  formatPrice,
  formatSigned,
  formatVolume,
  marketCapBand,
} from './format';
import './markets.css';

const PAGE_SIZE = 20;

type FilterChip = 'all' | 'gainers' | 'losers' | 'most-active';

const FILTER_CHIPS: { key: FilterChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'most-active', label: 'Most Active' },
];

export function MarketsPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SecuritiesSort>('symbol');
  const [page, setPage] = useState(1);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  const { data, isPending, isError, error } = useSecurities({
    search: search.trim(),
    sort,
    page,
    page_size: PAGE_SIZE,
  });

  const total = data?.meta?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            <h1>Browse Securities</h1>
            <p className="markets-page__subtitle">
              {total.toLocaleString()} securities listed on CSE
            </p>
          </div>
        </header>

        <div className="markets-page__filters">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`markets-chip${chip.key === 'all' ? ' markets-chip--active' : ''}`}
              disabled={chip.key !== 'all'}
              title={chip.key !== 'all' ? 'Coming soon — needs GET /market/overview' : undefined}
            >
              {chip.label}
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
            title="Sector data is not yet available in the seeded dataset"
          >
            <option>Select Segment</option>
          </select>

          <select
            className="markets-select"
            disabled
            title="Coming soon — needs GET /market/overview"
          >
            <option>Select Market Cap</option>
          </select>
        </div>

        <div className="markets-card">
          {isError ? (
            <div className="markets-page__state markets-page__state--error">
              {error instanceof ApiError
                ? error.body.message
                : 'Could not reach the market-trading API.'}
            </div>
          ) : !isPending && data && data.data.length === 0 ? (
            <div className="markets-page__state">No securities match your filters.</div>
          ) : (
            <>
              <div className="markets-row markets-row--head">
                <button
                  className="markets-sort"
                  onClick={() => toggleSort('symbol')}
                  aria-current={sort === 'symbol'}
                >
                  Symbol
                </button>
                <button
                  className="markets-sort"
                  onClick={() => toggleSort('company_name')}
                  aria-current={sort === 'company_name'}
                >
                  Sector
                </button>
                <span>Cap</span>
                <span className="markets-col--right">Price</span>
                <span className="markets-col--right">Change</span>
                <span className="markets-col--right">%</span>
                <span className="markets-col--right">Volume</span>
                <span className="markets-col--right">P/E</span>
                <span className="markets-col--right">Watch</span>
              </div>

              <div className="markets-card__body">
                {isPending && !data
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <div className="markets-row markets-row--skeleton" key={i} />
                    ))
                  : data?.data.map((security) => {
                      const cap = marketCapBand(
                        security.shares_outstanding,
                        security.price,
                      );
                      const positive = (security.change ?? 0) >= 0;
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
                            {security.sector?.name ?? '—'}
                          </span>
                          <span className="markets-row__cap">{cap ?? '—'}</span>
                          <span className="markets-col--right markets-mono markets-row__price">
                            {security.price !== null ? formatPrice(security.price) : '—'}
                          </span>
                          <span
                            className={`markets-col--right markets-mono ${
                              security.change === null ? '' : positive ? 'markets-positive' : 'markets-negative'
                            }`}
                          >
                            {security.change !== null
                              ? formatSigned(security.change, 2)
                              : '—'}
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
                              ? `${formatSigned(security.change_pct, 2)}%`
                              : '—'}
                          </span>
                          <span className="markets-col--right markets-mono markets-row__volume">
                            {security.volume !== null ? formatVolume(security.volume) : '—'}
                          </span>
                          <span className="markets-col--right markets-mono markets-row__volume">
                            {security.pe_ratio !== null ? security.pe_ratio.toFixed(1) : '—'}
                          </span>
                          <span className="markets-col--right">
                            <button
                              type="button"
                              className={`markets-watch${
                                watched.has(security.symbol) ? ' markets-watch--active' : ''
                              }`}
                              onClick={() => toggleWatch(security.symbol)}
                              aria-pressed={watched.has(security.symbol)}
                              title={
                                watched.has(security.symbol)
                                  ? 'Remove from watchlist'
                                  : 'Add to watchlist'
                              }
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
              Page {page} of {lastPage}
            </span>
            <div className="markets-page__pager">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </footer>
        )}
      </div>
    </AppShell>
  );
}

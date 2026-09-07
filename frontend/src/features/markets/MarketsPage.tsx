import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RiCalendarLine, RiLineChartLine, RiStarFill, RiStarLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { Chip } from '../../components/base/badges/chip';
import { ChevronUpDownSmall } from '../../components/foundations/icons/chevrons';
import { useTopbarSearch } from '../../components/layout/useTopbarSearch';
import { ApiError } from '../../lib/api';
import { localeFor } from '../../i18n';
import { SecuritiesSort } from './types';
import { useSecurities } from './useSecurities';
import { useSectorOptions } from './useSectorOptions';
import { TopMovers } from './TopMovers';
import {
  formatCount,
  formatPrice,
  formatSigned,
  formatVolume,
  marketCapBand,
} from './format';

const PAGE_SIZE = 20;

type IconComponent = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

function MarketStat({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <section className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-background-secondary-default p-4">
      <span className="flex shrink-0 items-center rounded-md bg-stat-card-icon-background p-1.5">
        <Icon className="size-5 shrink-0 text-foreground-icon-primary" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-body-medium text-text-secondary">{label}</p>
        <p className="truncate text-title-1-medium text-text-primary">{value}</p>
      </div>
    </section>
  );
}

export function MarketsPage() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [securitySort, setSecuritySort] =
    useState<SecuritiesSort>('symbol');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedTradingDate, setSelectedTradingDate] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());

  const { data: sectorOptions } = useSectorOptions();

  const { data, isPending, isFetching, isError, error } = useSecurities({
    search: searchQuery.trim(),
    sector: selectedSector,
    as_of: selectedTradingDate,
    sort: securitySort,
    page: currentPage,
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
    setWatchedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function toggleSort(next: SecuritiesSort) {
    setSecuritySort(next);
    setCurrentPage(1);
  }

  useTopbarSearch(searchQuery, (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1-medium text-text-primary">{t('markets.title')}</h1>
        <p className="text-body-medium text-text-secondary">
          {t('markets.subtitle', {
            count: total,
            formattedCount: formatCount(total, locale),
          })}
          {resolvedAsOf ? ` · ${t('markets.asOf', { date: resolvedAsOf })}` : ''}
        </p>
        <p className="text-body-2-medium text-text-tertiary">{t('markets.notice.eod')}</p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <MarketStat
          icon={RiLineChartLine}
          label={t('markets.stats.listed')}
          value={formatCount(total, locale)}
        />
        <MarketStat
          icon={RiCalendarLine}
          label={t('markets.stats.asOf')}
          value={resolvedAsOf || dash}
        />
      </div>

      <TopMovers asOf={selectedTradingDate} sector={selectedSector} />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-lg border border-border-button-default bg-background-primary-default px-2 text-body-medium text-text-primary"
          value={selectedSector}
          onChange={(event) => {
            setSelectedSector(event.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">{t('markets.filters.selectSegment')}</option>
          {sectorOptions?.map((sector) => (
            <option key={sector.gics_code} value={sector.gics_code}>
              {sector.name}
            </option>
          ))}
        </select>

        <select
          className="h-8 rounded-lg border border-border-button-default bg-background-primary-default px-2 text-body-medium text-text-tertiary disabled:cursor-not-allowed"
          disabled
          title={t('markets.unavailable.marketCap')}
        >
          <option>{t('markets.filters.selectMarketCap')}</option>
        </select>

        <label className="ml-auto flex items-center gap-2 text-body-medium text-text-secondary">
          <span>{t('markets.tradingDate')}</span>
          <input
            type="date"
            className="h-8 rounded-lg border border-border-button-default bg-background-primary-default px-2 text-body-medium text-text-primary"
            value={selectedTradingDate || resolvedAsOf}
            min={availableFrom}
            max={availableTo}
            onChange={(event) => {
              setSelectedTradingDate(event.target.value);
              setCurrentPage(1);
            }}
          />
        </label>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border-table"
        aria-busy={isFetching}
      >
        {isFetching && (
          <span
            className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-button-primary"
            role="status"
            aria-label={t('markets.states.loading')}
          />
        )}
        {isError ? (
          <div className="p-8 text-center text-body-medium text-status-rose-text">
            {error instanceof ApiError
              ? error.body.message
              : t('markets.states.unreachable')}
          </div>
        ) : !isPending && data && data.data.length === 0 ? (
          <div className="p-8 text-center text-body-medium text-text-secondary">
            {t('markets.states.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="bui-table" aria-label={t('markets.title')}>
              <thead>
                <tr>
                  <th scope="col">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-body-medium text-text-tertiary"
                      onClick={() => toggleSort('symbol')}
                      aria-current={securitySort === 'symbol'}
                    >
                      {t('markets.columns.symbol')}
                      <ChevronUpDownSmall className="size-4 text-foreground-icon-secondary" />
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-body-medium text-text-tertiary"
                      onClick={() => toggleSort('company_name')}
                      aria-current={securitySort === 'company_name'}
                    >
                      {t('markets.columns.sector')}
                      <ChevronUpDownSmall className="size-4 text-foreground-icon-secondary" />
                    </button>
                  </th>
                  <th scope="col">{t('markets.columns.cap')}</th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.price')}
                  </th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.change')}
                  </th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.changePct')}
                  </th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.volume')}
                  </th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.peRatio')}
                  </th>
                  <th scope="col" className="text-right">
                    {t('markets.columns.watch')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isPending && !data
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={9}>
                          <div className="h-5 w-full animate-pulse rounded bg-background-tertiary-default" />
                        </td>
                      </tr>
                    ))
                  : data?.data.map((security) => {
                      const band = marketCapBand(
                        security.shares_outstanding,
                        security.price,
                      );
                      const positive = (security.change ?? 0) >= 0;
                      const isWatched = watchedSymbols.has(security.symbol);
                      return (
                        <tr key={security.symbol}>
                          <td>
                            <Link
                              to={`/markets/${encodeURIComponent(security.symbol)}`}
                              aria-label={t('markets.viewDetails', {
                                symbol: security.symbol,
                              })}
                              className="flex flex-col hover:underline"
                            >
                              <span className="text-body-medium text-text-primary">
                                {security.symbol}
                              </span>
                              <span className="text-body-2-medium text-text-tertiary">
                                {security.company_name}
                              </span>
                            </Link>
                          </td>
                          <td>
                            {security.sector ? (
                              <Chip variant="subtle" color="soft">
                                {security.sector.name}
                              </Chip>
                            ) : (
                              dash
                            )}
                          </td>
                          <td>
                            {band ? (
                              <Chip variant="subtle" color="neutral">
                                {t(`markets.cap.${band}`)}
                              </Chip>
                            ) : (
                              dash
                            )}
                          </td>
                          <td className="text-right tabular-nums">
                            {security.price !== null
                              ? formatPrice(security.price, locale)
                              : dash}
                          </td>
                          <td className="text-right tabular-nums">
                            {security.change !== null ? (
                              <Chip variant="bold" color={positive ? 'lime' : 'rose'}>
                                {formatSigned(security.change, 2, locale)}
                              </Chip>
                            ) : (
                              dash
                            )}
                          </td>
                          <td className="text-right tabular-nums">
                            {security.change_pct !== null ? (
                              <Chip variant="bold" color={positive ? 'lime' : 'rose'}>
                                {`${formatSigned(security.change_pct, 2, locale)}%`}
                              </Chip>
                            ) : (
                              dash
                            )}
                          </td>
                          <td className="text-right tabular-nums">
                            {security.volume !== null
                              ? formatVolume(security.volume, locale)
                              : dash}
                          </td>
                          <td className="text-right tabular-nums">
                            {security.pe_ratio !== null
                              ? formatPrice(security.pe_ratio, locale)
                              : dash}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="inline-flex size-8 items-center justify-center rounded-lg text-foreground-icon-secondary hover:bg-background-secondary-hover hover:text-status-yellow-text"
                              onClick={() => toggleWatch(security.symbol)}
                              aria-pressed={isWatched}
                              title={t(
                                isWatched
                                  ? 'markets.watch.remove'
                                  : 'markets.watch.add',
                              )}
                            >
                              {isWatched ? (
                                <RiStarFill className="size-[18px] text-status-yellow-text" aria-hidden />
                              ) : (
                                <RiStarLine className="size-[18px]" aria-hidden />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isError && total > 0 && (
        <footer className="flex items-center justify-between gap-4">
          <span className="text-body-medium text-text-secondary">
            {t('markets.pagination.page', {
              page: formatCount(currentPage, locale),
              lastPage: formatCount(lastPage, locale),
            })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => page - 1)}
            >
              {t('markets.pagination.previous')}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={currentPage >= lastPage}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              {t('markets.pagination.next')}
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

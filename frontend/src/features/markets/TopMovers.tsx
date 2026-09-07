import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '../../components/base/segmented-control/segmented-control';
import { cx } from '../../utils/cx';
import { localeFor } from '../../i18n';
import { ApiError } from '../../lib/api';
import { formatPrice, formatSigned, formatVolume } from './format';
import { MarketRanking, RankingList } from './types';
import { useMarketOverview } from './useMarketOverview';

const LISTS: RankingList[] = ['gainers', 'losers', 'most_active'];
const ROW_COUNT = 6;

interface TopMoversProps {
  /** Kept in step with the securities table so both describe one slice. */
  asOf?: string;
  sector?: string;
}

/**
 * Top movers as a ranked bar list rather than a chart.
 *
 * Six rows of one measure is the case a bar list answers better than an axis:
 * the bar behind each row encodes magnitude relative to the strongest mover,
 * so the ranking reads at a glance while the exact figure stays legible as
 * text. An axis would spend most of the card's width on chrome for six values.
 *
 * The bar is a share of the largest absolute move in the visible list, not a
 * share of some fixed range — a day where everything moves 0.3% should still
 * show a full-width leader, because the card ranks movers rather than
 * measuring them against an absolute scale.
 */
export function TopMovers({ asOf, sector }: TopMoversProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [list, setList] = useState<RankingList>('gainers');

  const { data, isPending, isFetching, isError, error } = useMarketOverview({
    as_of: asOf,
    sector,
    limit: ROW_COUNT,
  });

  const rows: MarketRanking[] = data?.data?.[list] ?? [];
  // Most-active ranks on volume, the other two on percentage change, so the
  // bar has to be scaled by whichever measure the list is actually ordered by.
  const measure = (row: MarketRanking) =>
    list === 'most_active' ? row.volume : Math.abs(row.change_pct);
  const peak = rows.reduce((max, row) => Math.max(max, measure(row)), 0);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border-table bg-background-primary-default"
      aria-busy={isFetching}
    >
      {isFetching && (
        <span
          className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-button-primary"
          role="status"
          aria-label={t('markets.movers.loading')}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-headline-medium text-text-primary">{t('markets.movers.title')}</h2>
          <p className="text-body-2-medium text-text-tertiary">
            {data?.data?.as_of
              ? t('markets.asOf', { date: data.data.as_of })
              : t('markets.movers.subtitle')}
          </p>
        </div>

        <SegmentedControl
          aria-label={t('markets.movers.title')}
          selectedKeys={new Set([list])}
          onSelectionChange={(keys) => {
            const [next] = [...keys];
            if (next) setList(next as RankingList);
          }}
        >
          {LISTS.map((value) => (
            <SegmentedControlItem key={value} id={value}>
              {t(`markets.movers.lists.${value}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      {isError ? (
        <p className="px-4 py-8 text-center text-body-medium text-status-rose-text">
          {error instanceof ApiError ? error.body.message : t('markets.movers.unreachable')}
        </p>
      ) : isPending ? (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {Array.from({ length: ROW_COUNT }).map((_, index) => (
            <li
              key={index}
              className="h-9 animate-pulse rounded-lg bg-background-tertiary-default"
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-body-medium text-text-secondary">
          {t('markets.movers.empty')}
        </p>
      ) : (
        <ol className="flex flex-col px-2 pb-3">
          {rows.map((row) => {
            const share = peak > 0 ? (measure(row) / peak) * 100 : 0;
            const positive = row.change_pct >= 0;
            return (
              <li key={row.symbol}>
                <Link
                  to={`/markets/${encodeURIComponent(row.symbol)}`}
                  aria-label={t('markets.viewDetails', { symbol: row.symbol })}
                  className="relative flex items-center gap-3 overflow-hidden rounded-lg px-2 py-2 hover:bg-background-secondary-hover"
                >
                  {/* The share bar sits behind the row rather than beside it,
                      so the label keeps full width on a narrow screen. */}
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute inset-y-0 left-0 rounded-lg opacity-60',
                      positive ? 'bg-status-lime-background' : 'bg-status-rose-background',
                    )}
                    style={{ width: `${share}%` }}
                  />
                  <span className="relative flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-medium text-text-primary">{row.symbol}</span>
                    <span className="truncate text-body-2-medium text-text-tertiary">
                      {row.company_name}
                    </span>
                  </span>
                  <span className="relative shrink-0 text-right text-body-medium tabular-nums text-text-secondary">
                    {formatPrice(row.close, locale)}
                  </span>
                  <span
                    className={cx(
                      'relative w-20 shrink-0 text-right text-body-medium tabular-nums',
                      positive ? 'text-status-lime-text' : 'text-status-rose-text',
                    )}
                  >
                    {list === 'most_active'
                      ? formatVolume(row.volume, locale)
                      : `${formatSigned(row.change_pct, 2, locale)}%`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

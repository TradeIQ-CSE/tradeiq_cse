import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RiArrowRightUpLine, RiLineChartLine } from '@remixicon/react';
import { AppPage, PageIntro } from '../../components/application/layout/application-layout';
import { ButtonLink } from '../../components/base/buttons/button';
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from '../../components/application/financial-data';
import { localeFor } from '../../i18n';
import { cx } from '../../utils/cx';
import { ApiError } from '../../lib/api';
import { SymbolPicker } from '../../features/paper-trading/SymbolPicker';
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  SkeletonRow,
} from '../../features/paper-trading/ui';
import {
  changeDirection,
  formatDay,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from '../../features/paper-trading/format';
import { WatchButton } from '../../features/watchlist/WatchButton';
import { useAddToWatchlist, useWatchlist } from '../../features/watchlist/useWatchlist';
import type { WatchlistItem } from '../../features/watchlist/api';

const COLUMN_COUNT = 4;

export function Watchlist() {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const { data, isPending, isFetching, isError, refetch } = useWatchlist();
  const add = useAddToWatchlist();
  const [search, setSearch] = useState('');

  const items = data?.items ?? [];
  const limit = data?.limit ?? 10;
  const full = items.length >= limit;
  // Rows share one date in the heading; a row priced earlier says so itself.
  const newest = items.reduce<string | null>(
    (latest, item) => (item.trade_date && (!latest || item.trade_date > latest) ? item.trade_date : latest),
    null,
  );

  const addError =
    add.error instanceof ApiError && add.error.body.code === 'WATCHLIST_FULL'
      ? t('watchlistPage.errors.full')
      : add.error
        ? t('watchlistPage.errors.add')
        : null;

  return (
    <AppPage width="reading">
      <PageIntro
        eyebrow={t('watchlistPage.eyebrow')}
        title={t('watchlistPage.title')}
        description={t('watchlistPage.description', { limit })}
      />

      {isError ? (
        <ErrorCard>
          <span className="flex flex-wrap items-center gap-x-2">
            {t('watchlistPage.errors.load')}
            <button type="button" className="underline" onClick={() => refetch()}>
              {t('watchlistPage.errors.retry')}
            </button>
          </span>
        </ErrorCard>
      ) : (
        <Card busy={isFetching}>
          {isFetching && <CardProgress label={t('watchlistPage.loading')} />}

          <CardHeading
            title={t('watchlistPage.list.title')}
            subtitle={[
              t('watchlistPage.list.count', { count: items.length, limit }),
              newest && t('watchlistPage.list.pricesFrom', { date: formatDay(newest, locale) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          />

          <div className="flex flex-col gap-1 px-4 pb-4 sm:px-5">
            {full ? (
              <p className="text-body-2-regular text-text-secondary">{t('watchlistPage.list.full')}</p>
            ) : (
              <SymbolPicker
                label={t('watchlistPage.add.label')}
                value={search}
                onChange={setSearch}
                disabled={isPending || add.isPending}
                onSelect={(security) =>
                  add.mutate(security.symbol, { onSuccess: () => setSearch('') })
                }
              />
            )}
            {addError && (
              <p role="alert" className="text-body-2-regular text-status-rose-text">
                {addError}
              </p>
            )}
          </div>

          {!isPending && items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-t border-separator-border px-4 py-10 text-center">
              <p className="text-body-medium text-text-secondary">{t('watchlistPage.empty')}</p>
              <ButtonLink href="/markets" variant="secondary" leadingIcon={RiLineChartLine}>
                {t('watchlistPage.browse')}
              </ButtonLink>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="bui-table">
                <thead>
                  <tr>
                    <th scope="col">{t('watchlistPage.columns.company')}</th>
                    <th scope="col" className="text-right">
                      {t('watchlistPage.columns.close')}
                    </th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      {t('watchlistPage.columns.change')}
                    </th>
                    <th scope="col" className="w-12">
                      <span className="sr-only">{t('watchlistPage.columns.follow')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isPending
                    ? Array.from({ length: 3 }).map((_, index) => (
                        <SkeletonRow columns={COLUMN_COUNT} key={index} />
                      ))
                    : items.map((item) => (
                        <WatchlistRow key={item.symbol} item={item} newest={newest} locale={locale} />
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </AppPage>
  );
}

function WatchlistRow({
  item,
  newest,
  locale,
}: {
  item: WatchlistItem;
  newest: string | null;
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <tr>
      <td>
        <div className="flex flex-col">
          <Link
            to={`/markets/${encodeURIComponent(item.symbol)}`}
            className="inline-flex items-center gap-1.5 text-body-medium text-text-primary outline-none hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            {item.symbol}
            <RiArrowRightUpLine className="size-4 text-foreground-icon-tertiary" aria-hidden />
          </Link>
          <span className="text-body-2-regular text-text-secondary">{item.company_name}</span>
        </div>
      </td>
      <td className="text-right tabular-nums">
        {item.close === null ? (
          <span className="text-text-tertiary">{t('watchlistPage.dataGap')}</span>
        ) : (
          <div className="flex flex-col items-end">
            <span className="text-text-primary">{formatMoney(item.close, locale)}</span>
            {item.trade_date && item.trade_date !== newest && (
              <span className="text-body-2-regular text-text-tertiary">
                {t('watchlistPage.list.on', { date: formatDay(item.trade_date, locale) })}
              </span>
            )}
            {/* Phones have no room for the change column, so it sits here. */}
            <ChangePercent item={item} locale={locale} className="text-body-2-regular sm:hidden" />
          </div>
        )}
      </td>
      <td className="hidden text-right tabular-nums sm:table-cell">
        {item.change === null || item.change_pct === null ? (
          <span className="text-text-tertiary" aria-label={t('watchlistPage.noChange')}>
            —
          </span>
        ) : (
          <div className="flex flex-col items-end">
            <ChangePercent item={item} locale={locale} />
            <span className={cx('text-body-2-regular', financialToneClass(item.change))}>
              {formatSignedMoney(item.change, locale)}
            </span>
          </div>
        )}
      </td>
      <td className="text-right">
        <WatchButton symbol={item.symbol} />
      </td>
    </tr>
  );
}

/** "▲ +2.27%" in the gain or loss colour; nothing when there's no earlier price. */
function ChangePercent({
  item,
  locale,
  className,
}: {
  item: WatchlistItem;
  locale: string;
  className?: string;
}) {
  if (item.change === null || item.change_pct === null) return null;
  // Toned on the text itself: `.bui-table td` sets its own colour.
  return (
    <span className={cx(financialToneClass(item.change), className)}>
      <FinancialDirectionGlyph direction={changeDirection(item.change)} />
      {formatPercent(item.change_pct, locale)}
    </span>
  );
}

export default Watchlist;

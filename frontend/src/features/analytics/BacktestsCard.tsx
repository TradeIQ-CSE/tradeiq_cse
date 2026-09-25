import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RiArrowRightLine, RiFlaskLine, RiTrophyLine } from '@remixicon/react';
import { ButtonLink } from '../../components/base/buttons/button';
import { InfoTip } from '../../components/domain/info-tip';
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from '../../components/application/financial-data';
import { localeFor } from '../../i18n';
import { cx } from '../../utils/cx';
import {
  Card,
  CardHeading,
  CardProgress,
  ErrorCard,
  Pager,
  SkeletonRow,
} from '../paper-trading/ui';
import { changeDirection, formatDay, formatMoney, formatPercent } from '../paper-trading/format';
import type { BacktestSummary } from './api';
import { useBacktestList } from './useAnalytics';

const PAGE_SIZE = 20;

/** The backtests you saved, each beside the market over the same dates. */
export function BacktestsCard({ detail }: { detail: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const [page, setPage] = useState(1);
  const { data, isPending, isFetching, isError } = useBacktestList(page);

  if (isError) return <ErrorCard>{t('analyticsPage.backtests.unreachable')}</ErrorCard>;

  const runs = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Only stated when every run is on this page, so the count is never partial.
  const finished = runs.filter(
    (run) => run.total_return_pct !== null && run.aspi_return_pct !== null,
  );
  const beat = finished.filter((run) => run.total_return_pct! > run.aspi_return_pct!).length;
  const showTally = total <= PAGE_SIZE && finished.length > 0;

  const columns = detail ? 8 : 5;

  return (
    <Card busy={isFetching}>
      {isFetching && <CardProgress label={t('analyticsPage.loading')} />}
      <CardHeading
        title={t('analyticsPage.backtests.title')}
        subtitle={total > 0 ? t('analyticsPage.backtests.count', { count: total }) : undefined}
        actions={
          <ButtonLink href="/backtests/new" variant="secondary" leadingIcon={RiFlaskLine}>
            {t('analyticsPage.backtests.new')}
          </ButtonLink>
        }
      />

      {showTally && (
        <p className="flex items-center gap-2 px-4 pb-3 text-body-medium text-text-primary sm:px-5">
          <span className="flex size-6 items-center justify-center rounded-full bg-background-secondary-default text-foreground-icon-secondary">
            <RiTrophyLine className="size-4" aria-hidden />
          </span>
          {t('analyticsPage.backtests.tally', { beat, count: finished.length })}
        </p>
      )}

      {!isPending && runs.length === 0 ? (
        <p className="border-t border-separator-border px-4 py-10 text-center text-body-medium text-text-secondary">
          {t('analyticsPage.backtests.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cx('bui-table', detail ? 'min-w-[880px]' : 'min-w-[600px]')}>
            <thead>
              <tr>
                <th scope="col">{t('analyticsPage.backtests.columns.company')}</th>
                <th scope="col">{t('analyticsPage.backtests.columns.dates')}</th>
                <th scope="col" className="text-right">
                  {t('analyticsPage.backtests.columns.result')}
                </th>
                <th scope="col" className="text-right">
                  <span className="inline-flex items-center gap-1">
                    {t('analyticsPage.backtests.columns.market')}
                    <InfoTip label={t('analyticsPage.backtests.columns.market')}>
                      {t('analyticsPage.terms.sameDates')}
                    </InfoTip>
                  </span>
                </th>
                {detail && (
                  <>
                    <th scope="col" className="text-right">
                      <span className="inline-flex items-center gap-1">
                        {t('analyticsPage.detail.biggestDrop')}
                        <InfoTip label={t('analyticsPage.detail.biggestDrop')}>
                          {t('analyticsPage.terms.drawdown')}
                        </InfoTip>
                      </span>
                    </th>
                    <th scope="col" className="text-right">
                      {t('analyticsPage.backtests.columns.trades')}
                    </th>
                    <th scope="col" className="text-right">
                      {t('analyticsPage.backtests.columns.finalValue')}
                    </th>
                  </>
                )}
                <th scope="col">
                  <span className="sr-only">{t('analyticsPage.backtests.columns.open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isPending && !data
                ? Array.from({ length: 3 }).map((_, index) => <SkeletonRow columns={columns} key={index} />)
                : runs.map((run) => (
                    <BacktestRow key={run.id} run={run} detail={detail} locale={locale} />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <Pager
          label={t('analyticsPage.backtests.page', { page, lastPage })}
          previousLabel={t('analyticsPage.backtests.previous')}
          nextLabel={t('analyticsPage.backtests.next')}
          canGoPrevious={page > 1}
          canGoNext={page < lastPage}
          onPrevious={() => setPage((current) => current - 1)}
          onNext={() => setPage((current) => current + 1)}
        />
      )}
    </Card>
  );
}

function Signed({ value, locale }: { value: number; locale: string }) {
  // Toned on the text: `.bui-table td` sets its own colour.
  return (
    <span className={financialToneClass(value)}>
      <FinancialDirectionGlyph direction={changeDirection(value)} />
      {formatPercent(value, locale)}
    </span>
  );
}

function BacktestRow({
  run,
  detail,
  locale,
}: {
  run: BacktestSummary;
  detail: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const unfinished =
    run.status === 'failed'
      ? t('analyticsPage.backtests.failed')
      : run.status !== 'completed'
        ? t('analyticsPage.backtests.running')
        : null;

  return (
    <tr>
      <td>
        <div className="flex flex-col">
          <span className="text-body-medium text-text-primary">{run.symbol}</span>
          {run.company_name && (
            <span className="text-body-2-regular text-text-secondary">{run.company_name}</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap">
        {t('analyticsPage.backtests.range', {
          from: formatDay(run.start_date, locale),
          to: formatDay(run.end_date, locale),
        })}
      </td>
      <td className="text-right tabular-nums">
        {unfinished ? (
          <span className="text-text-tertiary">{unfinished}</span>
        ) : run.total_return_pct === null ? (
          '—'
        ) : (
          <Signed value={run.total_return_pct} locale={locale} />
        )}
      </td>
      <td className="text-right tabular-nums">
        {run.aspi_return_pct === null ? (
          <span className="text-text-tertiary">{t('analyticsPage.dataGap')}</span>
        ) : (
          <Signed value={run.aspi_return_pct} locale={locale} />
        )}
      </td>
      {detail && (
        <>
          <td className="text-right tabular-nums">
            {run.max_drawdown_pct === null ? '—' : <Signed value={run.max_drawdown_pct} locale={locale} />}
          </td>
          <td className="text-right tabular-nums">
            {run.trade_count === null ? '—' : run.trade_count.toLocaleString(locale)}
          </td>
          <td className="text-right tabular-nums">
            {run.final_equity === null ? '—' : formatMoney(run.final_equity, locale)}
          </td>
        </>
      )}
      <td className="text-right">
        {run.status === 'completed' && (
          <ButtonLink
            href={`/backtests/${run.id}/status`}
            variant="ghost"
            size="small"
            trailingIcon={RiArrowRightLine}
            aria-label={t('analyticsPage.backtests.openLabel', { symbol: run.symbol })}
          >
            {t('analyticsPage.backtests.columns.open')}
          </ButtonLink>
        )}
      </td>
    </tr>
  );
}

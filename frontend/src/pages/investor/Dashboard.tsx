import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiFlaskLine,
  RiFundsLine,
  RiLineChartLine,
  RiWallet3Line,
} from '@remixicon/react';
import {
  AppPage,
  AppPanel,
  PageIntro,
  PageState,
} from '../../components/application/layout/application-layout';
import { Button } from '../../components/base/buttons/button';
import {
  FinancialDirectionGlyph,
  financialToneClass,
} from '../../components/application/financial-data';
import { Card, CardHeading, CardProgress } from '../../features/paper-trading/ui';
import { SummaryStat } from '../../features/paper-trading/SummaryCards';
import { localeFor } from '../../i18n';
import { useMarketOverview } from '../../features/markets/useMarketOverview';
import { formatPrice, formatSigned, formatVolume } from '../../features/markets/format';
import { usePortfolioSummary, usePortfolios } from '../../features/paper-trading/usePortfolios';
import { useSelectedPortfolio } from '../../features/paper-trading/useSelectedPortfolio';
import {
  changeDirection,
  formatDay,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from '../../features/paper-trading/format';
import { cx } from '../../utils/cx';

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const portfolios = usePortfolios();
  const selection = useSelectedPortfolio(portfolios.data?.data);
  const activePortfolio =
    portfolios.data?.data.find(
      (portfolio) => portfolio.portfolio_id === selection.portfolioId,
    ) ?? portfolios.data?.data[0] ?? null;
  const summary = usePortfolioSummary(activePortfolio?.portfolio_id ?? null);
  const market = useMarketOverview({ limit: 3 });

  return (
    <AppPage>
      <PageIntro
        eyebrow={t('dashboardPage.eyebrow')}
        title={t('dashboardPage.title')}
        description={t('dashboardPage.dataNotice')}
      />

      <Card busy={summary.isFetching}>
        {summary.isFetching && <CardProgress label={t('portfolio.summary.loading')} />}
        <CardHeading
          title={t('dashboardPage.portfolio.title')}
          subtitle={
            activePortfolio
              ? summary.data?.data.as_of
                ? t('dashboardPage.portfolio.selected', {
                    name: activePortfolio.name,
                    date: formatDay(summary.data.data.as_of, locale),
                  })
                : activePortfolio.name
              : undefined
          }
          actions={
            activePortfolio && (
              <Button variant="secondary" size="small" trailingIcon={RiArrowRightLine} onClick={() => navigate('/portfolio')}>
                {t('dashboardPage.actions.portfolio')}
              </Button>
            )
          }
        />

        {portfolios.isError ? (
          <PageState
            className="border-0 shadow-none"
            kind="error"
            title={t('dashboardPage.portfolio.errorTitle')}
            description={t('dashboardPage.portfolio.errorDescription')}
          />
        ) : portfolios.isPending ? (
          <div className="mx-4 mb-4 h-20 animate-pulse rounded-2xl bg-background-secondary-default sm:mx-5" aria-busy="true" />
        ) : !activePortfolio ? (
          <PageState
            className="border-0 shadow-none"
            kind="empty"
            title={t('dashboardPage.portfolio.emptyTitle')}
            description={t('dashboardPage.portfolio.emptyDescription')}
            action={
              <Button leadingIcon={RiWallet3Line} onClick={() => navigate('/portfolio')}>
                {t('dashboardPage.actions.createPortfolio')}
              </Button>
            }
          />
        ) : summary.isError ? (
          <PageState
            className="border-0 shadow-none"
            kind="error"
            title={t('dashboardPage.portfolio.summaryErrorTitle')}
            description={t('dashboardPage.portfolio.summaryErrorDescription')}
            action={
              <Button variant="secondary" onClick={() => void summary.refetch()}>
                {t('dashboardPage.actions.retry')}
              </Button>
            }
          />
        ) : summary.isPending || !summary.data ? (
          <div className="mx-4 mb-4 h-20 animate-pulse rounded-2xl bg-background-secondary-default sm:mx-5" aria-busy="true" />
        ) : (
          <div className="grid grid-cols-1 border-t border-separator-border py-1 sm:grid-cols-3">
            <SummaryStat
              icon={RiFundsLine}
              label={t('dashboardPage.portfolio.equity')}
              value={formatMoney(summary.data.data.total_equity, locale)}
            />
            <SummaryStat
              icon={RiWallet3Line}
              label={t('dashboardPage.portfolio.cash')}
              value={formatMoney(summary.data.data.cash_balance, locale)}
            />
            <SummaryStat
              icon={RiBarChartBoxLine}
              label={t('dashboardPage.portfolio.return')}
              tone={financialToneClass(summary.data.data.total_pnl)}
              value={
                <>
                  <FinancialDirectionGlyph direction={changeDirection(summary.data.data.total_pnl)} />
                  {formatSignedMoney(summary.data.data.total_pnl, locale)}
                </>
              }
              sub={formatPercent(summary.data.data.total_return_pct, locale)}
            />
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <AppPanel className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-headline-medium text-text-primary">{t('dashboardPage.market.title')}</h2>
              {market.data?.data.as_of && (
                <p className="text-body-2-regular text-text-secondary">
                  {t('dashboardPage.market.asOf', { date: formatDay(market.data.data.as_of, locale) })}
                </p>
              )}
            </div>
            <Button variant="secondary" size="small" onClick={() => navigate('/markets')}>
              {t('dashboardPage.actions.viewAll')}
            </Button>
          </div>

          {market.isError ? (
            <PageState
              className="min-h-52"
              kind="error"
              title={t('dashboardPage.market.errorTitle')}
              description={t('dashboardPage.market.errorDescription')}
              action={
                <Button variant="secondary" onClick={() => void market.refetch()}>
                  {t('dashboardPage.actions.retry')}
                </Button>
              }
            />
          ) : market.isPending || !market.data ? (
            <div className="flex min-h-52 flex-col gap-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-background-secondary-default" />
              ))}
            </div>
          ) : market.data.data.gainers.length === 0 ? (
            <PageState
              className="min-h-52"
              kind="empty"
              title={t('dashboardPage.market.emptyTitle')}
              description={t('dashboardPage.market.emptyDescription')}
            />
          ) : (
            <ul className="divide-y divide-separator-border" aria-label={t('dashboardPage.market.gainers')}>
              {market.data.data.gainers.slice(0, 3).map((security) => (
                <li key={security.symbol} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/markets/${encodeURIComponent(security.symbol)}`)}
                    className="min-w-0 text-left outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    <span className="block truncate text-body-medium text-text-primary">{security.symbol}</span>
                    <span className="block truncate text-body-2-regular text-text-tertiary">{security.company_name}</span>
                  </button>
                  <div className="shrink-0 text-right">
                    <span className={cx('flex items-center justify-end tabular-nums text-body-medium', financialToneClass(security.change_pct))}>
                      <FinancialDirectionGlyph direction={changeDirection(security.change_pct)} />
                      {formatSigned(security.change_pct, 2, locale)}%
                    </span>
                    <span className="block tabular-nums text-body-2-regular text-text-secondary">
                      {t('dashboardPage.market.closedAt', { price: formatPrice(security.close, locale) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AppPanel>

        <AppPanel tone="glass" className="flex flex-col gap-4">
          <div>
            <h2 className="text-headline-medium text-text-primary">{t('dashboardPage.next.title')}</h2>
            <p className="mt-1 text-body-2-regular text-text-secondary">{t('dashboardPage.next.description')}</p>
          </div>
          <div className="grid gap-3">
            <Button className="w-full justify-between" leadingIcon={RiFlaskLine} trailingIcon={RiArrowRightLine} onClick={() => navigate('/paper-trading')}>
              {t('dashboardPage.actions.paperTrade')}
            </Button>
            <Button className="w-full justify-between" variant="secondary" leadingIcon={RiLineChartLine} trailingIcon={RiArrowRightLine} onClick={() => navigate('/backtests/new')}>
              {t('dashboardPage.actions.backtest')}
            </Button>
          </div>
          {market.data?.data.most_active[0] && (
            <p className="border-t border-separator-border pt-3 text-body-2-regular text-text-tertiary">
              {t('dashboardPage.market.mostActive', {
                symbol: market.data.data.most_active[0].symbol,
                volume: formatVolume(market.data.data.most_active[0].volume, locale),
              })}
            </p>
          )}
        </AppPanel>
      </div>
    </AppPage>
  );
}

export default Dashboard;

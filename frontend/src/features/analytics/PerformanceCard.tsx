import { useTranslation } from 'react-i18next';
import {
  RiArrowDownLine,
  RiArrowRightLine,
  RiArrowUpLine,
  RiBarChartBoxLine,
  RiEqualizerLine,
  RiLineChartLine,
  RiPulseLine,
  RiScales3Line,
} from '@remixicon/react';
import { ButtonLink } from '../../components/base/buttons/button';
import { Select, SelectItem } from '../../components/base/select/select';
import { financialToneClass } from '../../components/application/financial-data';
import { localeFor } from '../../i18n';
import { SummaryStat } from '../paper-trading/SummaryCards';
import { Card, CardHeading, CardProgress, ErrorCard, StateMessage } from '../paper-trading/ui';
import { formatDay, formatPercent } from '../paper-trading/format';
import { usePortfolios } from '../paper-trading/usePortfolios';
import { useSelectedPortfolio } from '../paper-trading/useSelectedPortfolio';
import { cx } from '../../utils/cx';
import { comparison, performanceStats } from './metrics';
import { PerformanceChart, PerformanceSeries } from './PerformanceChart';
import { usePortfolioPerformance } from './useAnalytics';

const COLORS = {
  yours: 'var(--color-accent-500)',
  ASPI: 'var(--color-text-tertiary)',
  // Purple, not pink: pink would read as the loss red.
  SL20: 'var(--color-chart-5)',
} as const;

/** Your practice portfolio's return beside the market's over the same days. */
export function PerformanceCard({ detail }: { detail: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.resolvedLanguage ?? i18n.language);
  const portfoliosQuery = usePortfolios();
  const portfolios = portfoliosQuery.data?.data ?? [];
  const { portfolioId, selectPortfolio } = useSelectedPortfolio(portfolios);
  const performance = usePortfolioPerformance(portfolioId);

  if (portfoliosQuery.isError || performance.isError) {
    return <ErrorCard>{t('analyticsPage.portfolio.unreachable')}</ErrorCard>;
  }

  if (!portfoliosQuery.isPending && portfolios.length === 0) {
    return (
      <Card>
        <CardHeading title={t('analyticsPage.portfolio.title')} />
        <div className="flex flex-col items-center gap-3 border-t border-separator-border px-4 py-10 text-center">
          <p className="text-body-medium text-text-secondary">{t('analyticsPage.portfolio.empty')}</p>
          <ButtonLink href="/paper-trading" variant="secondary" trailingIcon={RiArrowRightLine}>
            {t('analyticsPage.portfolio.startTrading')}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const data = performance.data;
  if (!data) {
    return (
      <div className="h-80 animate-pulse rounded-3xl bg-background-secondary-default" aria-busy="true" />
    );
  }

  const selected = portfolios.find((portfolio) => portfolio.portfolio_id === portfolioId);
  const last = data.points.at(-1);
  const benchmarkName = (code: 'ASPI' | 'SL20') =>
    data.benchmarks.find((benchmark) => benchmark.code === code)?.name ?? code;

  const picker =
    portfolios.length > 1 ? (
      <Select
        aria-label={t('analyticsPage.portfolio.pick')}
        className="w-full sm:w-64"
        selectedKey={portfolioId ?? undefined}
        onSelectionChange={(key) => selectPortfolio(String(key))}
      >
        {portfolios.map((portfolio) => (
          <SelectItem key={portfolio.portfolio_id} id={portfolio.portfolio_id} textValue={portfolio.name}>
            {portfolio.name}
          </SelectItem>
        ))}
      </Select>
    ) : undefined;

  const subtitle = [
    selected && portfolios.length === 1 ? selected.name : null,
    data.start_date ? t('analyticsPage.portfolio.since', { date: formatDay(data.start_date, locale) }) : null,
    data.as_of ? t('analyticsPage.portfolio.pricesFrom', { date: formatDay(data.as_of, locale) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!last) {
    return (
      <Card>
        <CardHeading title={t('analyticsPage.portfolio.title')} subtitle={subtitle} actions={picker} />
        <StateMessage>{t('analyticsPage.portfolio.noPrices')}</StateMessage>
      </Card>
    );
  }

  const market = last.benchmarks.ASPI;
  const verdict = market === null ? null : comparison(last.return_pct, market);
  const gap = market === null ? null : Math.round((last.return_pct - market) * 100) / 100;
  const stats = performanceStats(data.points);

  const series: PerformanceSeries[] = [
    { key: 'yours', label: t('analyticsPage.portfolio.yours'), color: COLORS.yours },
    { key: 'ASPI', label: benchmarkName('ASPI'), color: COLORS.ASPI },
    ...(detail && data.benchmarks.some((benchmark) => benchmark.code === 'SL20')
      ? [{ key: 'SL20' as const, label: benchmarkName('SL20'), color: COLORS.SL20 }]
      : []),
  ];

  const VerdictIcon = verdict === 'ahead' ? RiArrowUpLine : verdict === 'behind' ? RiArrowDownLine : RiScales3Line;

  return (
    <Card busy={performance.isFetching}>
      {performance.isFetching && <CardProgress label={t('analyticsPage.loading')} />}
      <CardHeading
        title={t('analyticsPage.portfolio.title')}
        info={t('analyticsPage.portfolio.help')}
        subtitle={subtitle}
        actions={picker}
      />

      {verdict && gap !== null && (
        <p className="flex items-center gap-2 px-4 pb-3 text-body-medium text-text-primary sm:px-5">
          <span
            className={cx(
              'flex size-6 items-center justify-center rounded-full bg-background-secondary-default',
              verdict === 'level' ? 'text-foreground-icon-secondary' : financialToneClass(gap),
            )}
          >
            <VerdictIcon className="size-4" aria-hidden />
          </span>
          {t(`analyticsPage.portfolio.verdict.${verdict}`, {
            gap: Math.abs(gap).toLocaleString(locale, { maximumFractionDigits: 2 }),
          })}
        </p>
      )}

      <div className="grid grid-cols-1 border-t border-separator-border py-1 sm:grid-cols-3">
        <SummaryStat
          icon={RiLineChartLine}
          label={t('analyticsPage.portfolio.yourReturn')}
          value={formatPercent(last.return_pct, locale)}
          tone={financialToneClass(last.return_pct)}
        />
        <SummaryStat
          icon={RiBarChartBoxLine}
          label={t('analyticsPage.portfolio.marketReturn')}
          info={t('analyticsPage.terms.aspi')}
          value={market === null ? t('analyticsPage.dataGap') : formatPercent(market, locale)}
          tone={market === null ? undefined : financialToneClass(market)}
        />
        <SummaryStat
          icon={RiScales3Line}
          label={t('analyticsPage.portfolio.difference')}
          info={t('analyticsPage.terms.difference')}
          value={gap === null ? t('analyticsPage.dataGap') : formatPercent(gap, locale)}
          tone={gap === null ? undefined : financialToneClass(gap)}
        />
      </div>

      {detail && (
        <div className="grid grid-cols-1 border-t border-separator-border py-1 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            icon={RiArrowDownLine}
            label={t('analyticsPage.detail.biggestDrop')}
            info={t('analyticsPage.terms.drawdown')}
            value={formatPercent(stats.maxDrawdownPct, locale)}
            tone={financialToneClass(stats.maxDrawdownPct)}
          />
          <SummaryStat
            icon={RiPulseLine}
            label={t('analyticsPage.detail.swings')}
            info={t('analyticsPage.terms.volatility')}
            value={
              stats.volatilityPct === null
                ? '—'
                : `${stats.volatilityPct.toLocaleString(locale, { maximumFractionDigits: 2 })}%`
            }
          />
          <SummaryStat
            icon={RiEqualizerLine}
            label={t('analyticsPage.detail.bestWorst')}
            info={t('analyticsPage.terms.bestWorst')}
            value={
              stats.bestDayPct === null || stats.worstDayPct === null
                ? '—'
                : `${formatPercent(stats.bestDayPct, locale)} · ${formatPercent(stats.worstDayPct, locale)}`
            }
          />
          <SummaryStat
            icon={RiBarChartBoxLine}
            label={benchmarkName('SL20')}
            info={t('analyticsPage.terms.sl20')}
            value={
              last.benchmarks.SL20 === null
                ? t('analyticsPage.dataGap')
                : formatPercent(last.benchmarks.SL20, locale)
            }
            tone={last.benchmarks.SL20 === null ? undefined : financialToneClass(last.benchmarks.SL20)}
          />
        </div>
      )}

      <div className="border-t border-separator-border px-4 py-4 sm:px-5">
        {data.points.length < 2 ? (
          <p className="text-body-2-regular text-text-secondary">{t('analyticsPage.portfolio.oneDay')}</p>
        ) : (
          <PerformanceChart
            points={data.points}
            series={series}
            locale={locale}
            dateLabel={t('analyticsPage.chart.date')}
            accessibleLabel={t('analyticsPage.chart.label')}
          />
        )}
      </div>
    </Card>
  );
}

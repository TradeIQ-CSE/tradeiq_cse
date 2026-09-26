import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../test/render';
import { server } from '../../test/server';
import { portfolioFixture } from '../../test/fixtures/paper-trading';
import type { BacktestSummary, PortfolioPerformance } from '../../features/analytics/api';
import { Analytics } from './Analytics';
import i18n from '../../i18n';

const t = i18n.t.bind(i18n);

const performance: PortfolioPerformance = {
  portfolio_id: portfolioFixture.portfolio_id,
  starting_capital: 1_000_000,
  start_date: '2026-09-21',
  as_of: '2026-09-24',
  benchmarks: [
    { code: 'ASPI', name: 'All Share Price Index' },
    { code: 'SL20', name: 'S&P Sri Lanka 20' },
  ],
  points: [
    { date: '2026-09-21', value: 1_000_000, return_pct: 0, benchmarks: { ASPI: 0, SL20: 0 } },
    { date: '2026-09-22', value: 1_020_000, return_pct: 2, benchmarks: { ASPI: 0.5, SL20: 0.4 } },
    { date: '2026-09-23', value: 1_005_000, return_pct: 0.5, benchmarks: { ASPI: 0.8, SL20: 0.6 } },
    { date: '2026-09-24', value: 1_030_000, return_pct: 3, benchmarks: { ASPI: 1, SL20: 0.9 } },
  ],
};

function run(overrides: Partial<BacktestSummary>): BacktestSummary {
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    symbol: 'JKH.N0000',
    company_name: 'John Keells Holdings PLC',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    created_at: '2026-09-20T00:00:00.000Z',
    starting_capital: 100_000,
    final_equity: 112_000,
    total_return_pct: 12,
    trade_count: 4,
    max_drawdown_pct: -8.5,
    aspi_return_pct: 9,
    ...overrides,
  };
}

function serve(runs: BacktestSummary[], perf: PortfolioPerformance = performance) {
  server.use(
    http.get('*/analytics/portfolios/:id/performance', () => HttpResponse.json({ data: perf })),
    http.get('*/analytics/backtests', () =>
      HttpResponse.json({ data: runs, meta: { page: 1, page_size: 20, total: runs.length } }),
    ),
  );
}

describe('Analytics page', () => {
  beforeEach(() => window.localStorage.removeItem('tradeiq.analytics.detail'));

  it('says plainly how the portfolio compares with the market', async () => {
    serve([]);
    renderWithProviders(<Analytics />);

    expect(await screen.findByText("You're ahead of the market by 2%")).toBeInTheDocument();
    expect(screen.getByText('+3.00%')).toBeInTheDocument();
    expect(screen.getByText('+1.00%')).toBeInTheDocument();
    expect(screen.getByText('+2.00%')).toBeInTheDocument();
    expect(
      screen.getByText('Evaluation portfolio · Since Sep 21, 2026 · Closing prices from Sep 24, 2026'),
    ).toBeInTheDocument();
    // Simple view: no detailed figures.
    expect(screen.queryByText(t('analyticsPage.detail.biggestDrop'))).not.toBeInTheDocument();
  });

  it('shows the detailed figures behind the switch and remembers the choice', async () => {
    const user = userEvent.setup();
    serve([run({})]);
    renderWithProviders(<Analytics />);
    await screen.findByText("You're ahead of the market by 2%");

    await user.click(screen.getByRole('switch', { name: t('analyticsPage.detailToggle') }));

    // Once on the portfolio, once as a backtest column.
    expect(screen.getAllByText(t('analyticsPage.detail.biggestDrop'))).toHaveLength(2);
    // 1,020,000 → 1,005,000 is the largest fall.
    expect(screen.getByText('-1.47%')).toBeInTheDocument();
    expect(screen.getByText(t('analyticsPage.backtests.columns.trades'))).toBeInTheDocument();
    expect(window.localStorage.getItem('tradeiq.analytics.detail')).toBe('on');
  });

  it('lists backtests with the market over the same dates and a tally', async () => {
    serve([
      run({ symbol: 'JKH.N0000', total_return_pct: 12, aspi_return_pct: 9 }),
      run({ symbol: 'HNB.N0000', total_return_pct: -3, aspi_return_pct: 4 }),
      run({ symbol: 'COMB.N0000', status: 'running', total_return_pct: null, final_equity: null }),
    ]);
    renderWithProviders(<Analytics />);

    expect(await screen.findByText('Beat the market in 1 of 2 tests')).toBeInTheDocument();
    const jkh = screen.getByText('JKH.N0000').closest('tr')!;
    expect(within(jkh).getByText('+12.00%')).toBeInTheDocument();
    expect(within(jkh).getByText('+9.00%')).toBeInTheDocument();
    expect(within(jkh).getByRole('link', { name: 'See the JKH.N0000 backtest' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/backtests\/.+\/status$/),
    );
    const comb = screen.getByText('COMB.N0000').closest('tr')!;
    expect(within(comb).getByText(t('analyticsPage.backtests.running'))).toBeInTheDocument();
    expect(within(comb).queryByRole('link')).not.toBeInTheDocument();
  });

  it('points to the next step when there is nothing yet', async () => {
    serve([]);
    server.use(
      http.get('*/portfolios', () =>
        HttpResponse.json({ data: [], meta: { page: 1, page_size: 50, total: 0 } }),
      ),
    );
    renderWithProviders(<Analytics />);

    expect(await screen.findByText(t('analyticsPage.portfolio.empty'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('analyticsPage.portfolio.startTrading') })).toHaveAttribute(
      'href',
      '/paper-trading',
    );
    expect(await screen.findByText(t('analyticsPage.backtests.empty'))).toBeInTheDocument();
  });

  it('waits for a second day before drawing the chart', async () => {
    serve([], { ...performance, points: performance.points.slice(0, 1), as_of: '2026-09-21' });
    renderWithProviders(<Analytics />);

    expect(await screen.findByText(t('analyticsPage.portfolio.oneDay'))).toBeInTheDocument();
    expect(screen.getByText(t('analyticsPage.portfolio.verdict.level'))).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '../../../test/render';
import { renderWithProviders } from '../../../test/render';
import { server } from '../../../test/server';
import { dataCoverageWithGapFixture } from '../../../test/fixtures/data-coverage';
import { BacktestWizard } from '../components/BacktestWizard';

const sampSecurity = {
  symbol: 'SAMP.N0000',
  company_name: 'Sampath Bank PLC',
  sector: { gics_code: '40101010', name: 'Banks' },
  data_from: '2017-01-02',
  data_to: '2026-09-23',
  price: 121.5,
};

function seedDraft(period?: { startDate: string; endDate: string }) {
  const config = {
    security: {
      symbol: sampSecurity.symbol,
      companyName: sampSecurity.company_name,
      sector: sampSecurity.sector.name,
      sectorGicsCode: sampSecurity.sector.gics_code,
      dataFrom: sampSecurity.data_from,
      dataTo: sampSecurity.data_to,
      price: sampSecurity.price,
    },
    period: period ?? { startDate: '2026-01-05', endDate: '2026-01-30' },
    rules: { buy: { type: 'period_start' }, sells: [{ type: 'end_of_period' }] },
    execution: {
      positionSizing: { type: 'full_capital' },
      fees: { brokerageRate: 0.0064, cseRate: 0.00084, cdsRate: 0.00024, secCessRate: 0.00072, stlRate: 0.003 },
      rounding: { shares: 'whole' },
      exitPrecedence: 'first_triggered',
      warmupPeriod: 0,
    },
    portfolio: { startingCapital: 1_000_000 },
    metrics: { selected: ['total_return'] },
  };
  sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
}

function renderPeriodStep(entry = '/backtests/new/period') {
  return renderWithProviders(
    <Routes>
      <Route path="/backtests/new/:step" element={<BacktestWizard />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

describe('PeriodStep — data gaps', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('greys out and disables a weekday inside a missing_data gap on the calendar', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft();
    renderPeriodStep();
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Backtest simulation date range' });
    await user.click(trigger);

    // 15 Jan 2026 sits inside the fixture's 1 Jan - 12 Jun 2026 gap.
    const unavailableCell = await screen.findByRole('button', {
      name: /January 15, 2026/i,
    });
    expect(unavailableCell).toHaveAttribute('data-unavailable', 'true');
  });

  it('leaves the weekend immediately after the gap selectable — it is not itself in the gap', async () => {
    // The fixture gap runs 2026-01-01..2026-06-12 (ends Friday). Sat 13 /
    // Sun 14 Jun roll backward onto that Friday, but as a START they roll
    // forward to Mon 15 Jun, which the backend accepts — so the calendar
    // must not block them outright; only the role-aware field validation
    // (below) can tell a bad role apart from a good one.
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2026-06-01', endDate: '2026-06-30' });
    renderPeriodStep();
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Backtest simulation date range' });
    await user.click(trigger);

    const saturday = await screen.findByRole('button', { name: /June 13, 2026/i });
    expect(saturday).not.toHaveAttribute('data-unavailable', 'true');

    const sunday = await screen.findByRole('button', { name: /June 14, 2026/i });
    expect(sunday).not.toHaveAttribute('data-unavailable', 'true');

    // The first real session after the gap, Mon 15 Jun, stays selectable.
    const monday = await screen.findByRole('button', { name: /June 15, 2026/i });
    expect(monday).not.toHaveAttribute('data-unavailable', 'true');
  });

  it('still disables an interior gap weekday on the calendar', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    // Starting the range in March keeps the calendar's default visible
    // months on March/April 2026, so the interior gap weekday is on screen
    // without navigating months.
    seedDraft({ startDate: '2026-03-01', endDate: '2026-08-01' });
    renderPeriodStep();
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Backtest simulation date range' });
    await user.click(trigger);

    // 10 Mar 2026 is a weekday strictly inside the gap.
    const interiorWeekday = await screen.findByRole('button', { name: /March 10, 2026/i });
    expect(interiorWeekday).toHaveAttribute('data-unavailable', 'true');
  });

  it('shows the in-gap field error when 06-13 is picked as the END date, but not as the START date', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    // As an END, 2026-06-13 rolls backward onto Fri 2026-06-12, the gap's
    // last day — the same message the API's DATE_IN_DATA_GAP would return.
    seedDraft({ startDate: '2025-06-02', endDate: '2026-06-13' });
    renderPeriodStep();

    await screen.findByText(
      'No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.',
    );
  });

  it('accepts 06-13 as the START date, clear of the gap', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    // As a START, 2026-06-13 rolls forward to Mon 2026-06-15, clear of the
    // gap — no field error.
    seedDraft({ startDate: '2026-06-13', endDate: '2026-08-01' });
    renderPeriodStep();

    await screen.findByRole('heading', { name: 'Choose dates' });
    expect(
      screen.queryByText(
        'No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.',
      ),
    ).not.toBeInTheDocument();
  });

  it('leaves the weekend before a Monday-starting gap selectable, but flags it as an invalid START', async () => {
    const mondayGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data' as const,
    };
    const coverageWithMondayGap = {
      prices: { from: '2017-01-02', to: '2026-09-23', gaps: [mondayGap] },
      indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
    };
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: coverageWithMondayGap })));
    const user = userEvent.setup();

    // Sat 06-06 rolls forward into the gap for a START, but is not itself
    // in the gap, so the calendar leaves it selectable.
    seedDraft({ startDate: '2026-06-06', endDate: '2026-08-01' });
    renderPeriodStep();

    const trigger = await screen.findByRole('button', { name: 'Backtest simulation date range' });
    await user.click(trigger);
    const saturday = await screen.findByRole('button', { name: /June 6, 2026/i });
    expect(saturday).not.toHaveAttribute('data-unavailable', 'true');

    // But as a chosen START it still gets caught by the role-aware field
    // validation, with the API's own message.
    await screen.findByText(
      'No market data from 2026-06-08 to 2026-06-12. Choose a date outside this period.',
    );
  });

  it('shows the crossing notice under the picker when the range crosses a gap', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2025-06-01', endDate: '2026-08-01' });
    renderPeriodStep();

    await waitFor(() => {
      expect(
        screen.getByText("Sell rules wait until Jun 15, 2026"),
      ).toBeInTheDocument();
    });
  });

  it('shows no crossing notice for a range that does not cross a gap', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2024-01-01', endDate: '2024-12-31' });
    renderPeriodStep();

    await screen.findByRole('heading', { name: 'Choose dates' });
    expect(screen.queryByText(/Shares you hold are kept through it/)).not.toBeInTheDocument();
  });

  it('does not restrict the calendar when coverage has no gaps', async () => {
    seedDraft();
    renderPeriodStep();
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Backtest simulation date range' });
    await user.click(trigger);

    const cell = await screen.findByRole('button', { name: /January 15, 2026/i });
    expect(cell).not.toHaveAttribute('data-unavailable', 'true');
  });
});

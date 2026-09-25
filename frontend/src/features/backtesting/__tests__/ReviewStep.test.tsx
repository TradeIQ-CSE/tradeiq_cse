// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '../../../test/render';
import { renderWithProviders } from '../../../test/render';
import { server } from '../../../test/server';
import { dataCoverageWithGapFixture } from '../../../test/fixtures/data-coverage';
import { BacktestWizard } from '../components/BacktestWizard';
import { createDefaultBacktestConfig } from '../domain/defaults';

const security = {
  symbol: 'SAMP.N0000',
  companyName: 'Sampath Bank PLC',
  sector: 'Banks',
  sectorGicsCode: '40101010',
  dataFrom: '2017-01-02',
  dataTo: '2026-09-23',
  price: 121.5,
};

function seedDraft(period: { startDate: string; endDate: string }, mode: 'advanced' | 'simple' = 'advanced') {
  const config = createDefaultBacktestConfig();
  config.security = security;
  config.period = period;
  sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
  return mode;
}

function renderReview(mode: 'advanced' | 'simple' = 'advanced') {
  return renderWithProviders(
    <Routes>
      <Route path="/backtests/new/:step" element={<BacktestWizard />} />
    </Routes>,
    { initialEntries: [`/backtests/new/review?mode=${mode}`] },
  );
}

describe('ReviewStep — crossing notice', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('repeats the crossing notice for a period that crosses a gap (advanced mode)', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2025-06-01', endDate: '2026-08-01' });
    renderReview('advanced');

    await waitFor(() => {
      expect(
        screen.getByText("Sell rules wait until Jun 15, 2026"),
      ).toBeInTheDocument();
    });
  });

  it('shows the same notice on the simple flow\'s review page', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2025-06-01', endDate: '2026-08-01' }, 'simple');
    renderReview('simple');

    await waitFor(() => {
      expect(screen.getByText("Jan 1 to Jun 12, 2026")).toBeInTheDocument();
    });
  });

  it('blocks submission when a restored draft has a start date inside a gap', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2026-03-15', endDate: '2026-08-01' });
    renderReview('advanced');

    await waitFor(() => {
      expect(screen.getByText(/^Fix \d+ things? before running$/)).toBeInTheDocument();
      expect(
        screen.getByText('No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /run backtest/i })).toBeDisabled();
  });

  it('shows no notice for a period that does not cross a gap', async () => {
    server.use(http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })));
    seedDraft({ startDate: '2024-01-01', endDate: '2024-12-31' });
    renderReview('advanced');

    await screen.findByRole('heading', { name: 'Check and run' });
    expect(screen.queryByText(/Shares you hold are kept through it/)).not.toBeInTheDocument();
  });
});

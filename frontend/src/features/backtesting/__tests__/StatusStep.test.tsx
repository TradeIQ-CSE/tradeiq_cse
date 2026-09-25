// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { StatusStep } from '../components/StatusStep';
import * as api from '../api/backtestApi';
import { renderWithProviders } from '../../../test/render';
import { server } from '../../../test/server';
import {
  dataCoverageWithBothGapsFixture,
  dataCoverageWithClosureFixture,
  dataCoverageWithGapFixture,
  marketClosureCovid,
  priceGap2026,
} from '../../../test/fixtures/data-coverage';

// StatusStep reads price gaps via useDataCoverage (React Query), so every
// render needs a QueryClientProvider — renderWithProviders supplies one,
// plus the router these tests were already using directly.
function renderStatusStep(runId: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/backtests/:runId/status" element={<StatusStep />} />
    </Routes>,
    { initialEntries: [`/backtests/${runId}/status`] },
  );
}

describe('StatusStep Polling & Retry Behavior', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('automatically retries status polling on transient network error', async () => {
    const getStatusSpy = vi.spyOn(api, 'getBacktestRunStatus')
      .mockRejectedValueOnce(new Error('Network glitch'))
      .mockResolvedValueOnce({
        id: 'run-123',
        status: 'completed',
        startedAt: '2026-09-06T10:00:00Z',
        completedAt: '2026-09-06T10:01:00Z',
      });
    const getResultsSpy = vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 1_000_000,
      finalCash: 1_085_000,
      finalEquity: 1_085_000,
      trades: [],
      equityCurve: [
        {
          date: '2025-01-02',
          cash: 1_000_000,
          positionQuantity: 0,
          positionMarketValue: 0,
          totalEquity: 1_000_000,
        },
        {
          date: '2025-12-31',
          cash: 1_085_000,
          positionQuantity: 0,
          positionMarketValue: 0,
          totalEquity: 1_085_000,
        },
      ],
    });

    renderStatusStep('run-123');

    // Initial load executes first status check (which fails)
    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Network glitch/i)).toBeTruthy();
    });

    // Wait for the automatic transient retry (2000ms delay) to complete
    await waitFor(
      () => {
        expect(getStatusSpy).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Your test is done')).toBeTruthy();
        expect(screen.getByText('Trades', { selector: 'p' })).toBeTruthy();
      },
      { timeout: 4000 },
    );
    expect(getResultsSpy).toHaveBeenCalledWith('run-123');
  });

  it('allows manual retry when Retry Status Check button is clicked', async () => {
    const getStatusSpy = vi.spyOn(api, 'getBacktestRunStatus')
      .mockRejectedValueOnce(new Error('Persistent 500 error'))
      .mockResolvedValueOnce({
        id: 'run-456',
        status: 'running',
      });

    renderStatusStep('run-456');

    await waitFor(() => {
      expect(screen.getByText(/Persistent 500 error/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /Try again/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Running your test')).toBeTruthy();
    });
  });
});

describe('StatusStep equity curve — data gaps', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockCompletedRun() {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-gap',
      status: 'completed',
      startedAt: '2026-09-06T10:00:00Z',
      completedAt: '2026-09-06T10:01:00Z',
    });
    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 1_000_000,
      finalCash: 1_150_000,
      finalEquity: 1_150_000,
      trades: [],
      equityCurve: [
        { date: '2025-12-01', cash: 1_000_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_000_000 },
        { date: '2025-12-31', cash: 1_020_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_020_000 },
        // Skips straight from the last session before the gap to the first
        // session after it (2026-06-15) — no price data exists in between.
        { date: '2026-06-15', cash: 1_050_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_050_000 },
        { date: '2026-07-01', cash: 1_150_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_150_000 },
      ],
    });
  }

  it('splits the line into segments and draws a labelled band when a run crosses a gap', async () => {
    server.use(
      http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithGapFixture })),
    );
    mockCompletedRun();

    const { container } = renderStatusStep('run-gap');

    await screen.findByText('Your test is done');
    await waitFor(() => {
      expect(container.querySelectorAll('svg polyline')).toHaveLength(2);
    });

    expect(container.querySelector('svg rect')).toBeTruthy();
    expect(screen.getByText('Data gap')).toBeInTheDocument();
    expect(
      screen.getByText(`Includes ${priceGap2026.sessions.toLocaleString('en-LK')} trading days in a data gap`),
    ).toBeInTheDocument();
  });

  it('renders a single unbroken segment and no gap caption when coverage has no gaps', async () => {
    mockCompletedRun();

    const { container } = renderStatusStep('run-gap');

    await screen.findByText('Your test is done');
    await waitFor(() => {
      expect(container.querySelectorAll('svg polyline')).toHaveLength(1);
    });

    expect(container.querySelector('svg rect')).toBeNull();
    expect(screen.queryByText(/trading days in a data gap/)).not.toBeInTheDocument();
  });

  function mockClosureCrossingRun() {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-closure',
      status: 'completed',
      startedAt: '2020-06-01T10:00:00Z',
      completedAt: '2020-06-01T10:01:00Z',
    });
    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 1_000_000,
      finalCash: 1_010_000,
      finalEquity: 1_010_000,
      trades: [],
      equityCurve: [
        // Last session before the COVID closure (Fri 2020-03-20) and the
        // first session after it (Mon 2020-05-11) — no price data in between
        // because the exchange itself was shut, not because it's missing.
        { date: '2020-03-20', cash: 1_000_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_000_000 },
        { date: '2020-05-11', cash: 1_010_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_010_000 },
      ],
    });
  }

  it('bands a market_closed closure with a lighter fill and a "Market closed" label, and counts no sessions for it', async () => {
    server.use(
      http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithClosureFixture })),
    );
    mockClosureCrossingRun();

    const { container } = renderStatusStep('run-closure');

    await screen.findByText('Your test is done');
    await waitFor(() => {
      expect(container.querySelectorAll('svg rect')).toHaveLength(1);
    });

    const rect = container.querySelector('svg rect');
    expect(rect).toHaveAttribute('fill-opacity', '0.18');
    expect(screen.getByText('Market closed')).toBeInTheDocument();
    // A closure is real market history, not something the run skipped, so
    // it never contributes to the "trading days in a data gap" caption.
    expect(screen.queryByText(/trading days in a data gap/)).not.toBeInTheDocument();
  });

  function mockBothGapsCrossingRun() {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-both-gaps',
      status: 'completed',
      startedAt: '2026-07-01T10:00:00Z',
      completedAt: '2026-07-01T10:01:00Z',
    });
    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 1_000_000,
      finalCash: 1_200_000,
      finalEquity: 1_200_000,
      trades: [],
      equityCurve: [
        { date: '2020-03-20', cash: 1_000_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_000_000 },
        { date: '2020-05-11', cash: 1_010_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_010_000 },
        { date: '2025-12-31', cash: 1_020_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_020_000 },
        { date: '2026-06-15', cash: 1_200_000, positionQuantity: 0, positionMarketValue: 0, totalEquity: 1_200_000 },
      ],
    });
  }

  it('bands both a market_closed closure and a missing_data gap on the same run, counting only the missing_data sessions', async () => {
    server.use(
      http.get('*/coverage', () => HttpResponse.json({ data: dataCoverageWithBothGapsFixture })),
    );
    mockBothGapsCrossingRun();

    const { container } = renderStatusStep('run-both-gaps');

    await screen.findByText('Your test is done');
    await waitFor(() => {
      expect(container.querySelectorAll('svg rect')).toHaveLength(2);
    });

    const opacities = Array.from(container.querySelectorAll('svg rect')).map((rect) =>
      rect.getAttribute('fill-opacity'),
    );
    expect(opacities.sort()).toEqual(['0.18', '0.4']);
    // The date-proportional x-axis spans six years here (2020 to 2026), so
    // the ~7-week closure band renders under MIN_LABEL_WIDTH and hides its
    // on-band text label by design (same "no room" rule as gap-band.tsx) —
    // its <title> still carries the kind, which is what a hover/tooltip and
    // an a11y tree read from. The much wider missing_data band does clear
    // the threshold and keeps its visible "Data gap" label.
    const titles = Array.from(container.querySelectorAll('svg title')).map(
      (title) => title.textContent,
    );
    expect(titles).toContain('Market closed, 2020-03-23 to 2020-05-08');
    expect(screen.getByText('Data gap')).toBeInTheDocument();
    expect(screen.queryByText('Market closed')).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg polyline')).toHaveLength(3);

    // Only the missing_data gap's 117 sessions count — the closure's 33 are
    // real history, not missing data.
    expect(
      screen.getByText(`Includes ${priceGap2026.sessions.toLocaleString('en-LK')} trading days in a data gap`),
    ).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`${marketClosureCovid.sessions}\\s+trading days`))).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BacktestWizard } from '../components/BacktestWizard';
import * as api from '../api/backtestApi';
import { ApiError } from '../../../lib/api';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { renderWithProviders } from '../../../test/render';

import { CreateBacktestRunResponse } from '../domain/types';

const sampSecurity = {
  symbol: 'SAMP.N0000',
  company_name: 'Sampath Bank PLC',
  sector: { gics_code: '40101010', name: 'Banks' },
  shares_outstanding: 1_100_000_000,
  data_from: '2017-01-02',
  data_to: '2025-12-31',
  price: 121.5,
  change: 1.25,
  change_pct: 1.04,
  volume: 250_000,
  pe_ratio: 7.8,
};

function seedValidDraft() {
  const config = createDefaultBacktestConfig();
  config.security = {
    symbol: sampSecurity.symbol,
    companyName: sampSecurity.company_name,
    sector: sampSecurity.sector.name,
    sectorGicsCode: sampSecurity.sector.gics_code,
    dataFrom: '2017-01-02',
    dataTo: '2025-12-31',
    price: sampSecurity.price,
  };
  sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
}

describe('BacktestWizard Workflow Integration', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    // Default mock for universe search
    vi.spyOn(api, 'getSecuritiesUniverse').mockResolvedValue([sampSecurity]);
  });

  it('renders step 1 (Security) by default and displays heading', () => {
    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
      </Routes>,
      { initialEntries: ['/backtests/new/security'] },
    );

    expect(screen.getByRole('heading', { name: 'Test an idea on past prices' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose a company' })).toBeTruthy();
  });

  it('does not present an incomplete direct review as ready to submit', () => {
    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'] },
    );

    expect(screen.getByText(/^Fix \d+ things? before running$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /run backtest/i })).toBeDisabled();
  });

  it('preserves entered values when moving to the next step and then back', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
      </Routes>,
      { initialEntries: ['/backtests/new/security'] },
    );

    // Select SAMP from the API-backed universe.
    const sampResult = await screen.findByRole('button', {
      name: /SAMP\.N0000.*Sampath Bank PLC/i,
    });
    fireEvent.click(sampResult);

    // Verify SAMP.N0000 is now selected
    expect(screen.getAllByText('SAMP.N0000').length).toBeGreaterThanOrEqual(1);

    // Click Next Step
    const nextBtn = screen.getByRole('button', { name: /advance to next step/i });
    fireEvent.click(nextBtn);

    // Now on Period step
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose dates' })).toBeTruthy();
    });

    // A fresh draft already follows the selected company's latest coverage.
    expect(screen.getByText('Selected: 2025-01-01 to 2025-12-31')).toBeTruthy();
    // The same range remains explicitly configurable using BoardUI presets.
    fireEvent.click(screen.getByRole('button', { name: '1 year' }));
    expect(screen.getByText('Selected: 2025-01-01 to 2025-12-31')).toBeTruthy();

    // Advance to Rules step
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'When to buy and sell' })).toBeTruthy();
    });

    // Click Back
    const backBtn = screen.getByRole('button', { name: /navigate to previous step/i });
    fireEvent.click(backBtn);

    // Returned to Period step and preserved the selected range.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose dates' })).toBeTruthy();
      expect(screen.getByText('Selected: 2025-01-01 to 2025-12-31')).toBeTruthy();
    });

    // Click Back again to return to Security step
    fireEvent.click(screen.getByRole('button', { name: /navigate to previous step/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose a company' })).toBeTruthy();
      expect(screen.getAllByText('SAMP.N0000').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('submits valid configuration to API and redirects with returned runId', async () => {
    seedValidDraft();
    const submitSpy = vi.spyOn(api, 'submitBacktestRun').mockResolvedValue({
      id: 'mock-uuid-12345',
      status: 'queued',
    });

    const LocationTracker: React.FC = () => {
      return (
        <div data-testid="status-target">Status Page Reached for mock-uuid-12345</div>
      );
    };

    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        <Route path="/backtests/:runId/status" element={<LocationTracker />} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'] },
    );

    expect(screen.getByRole('heading', { name: 'Check and run' })).toBeTruthy();

    // Click Run Backtest button
    const runBtn = screen.getByRole('button', { name: /run backtest/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1);
    });

    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: expect.any(String),
        startDate: expect.any(String),
        endDate: expect.any(String),
        startingCapital: expect.any(Number),
      }),
    );

    // Verify navigation to status screen
    await waitFor(() => {
      expect(screen.getByTestId('status-target')).toBeTruthy();
    });
  });

  it('runs a preview without an account and shows the results page, saving nothing', async () => {
    seedValidDraft();
    const submitSpy = vi.spyOn(api, 'submitBacktestRun');
    const previewSpy = vi.spyOn(api, 'previewBacktestRun').mockResolvedValue({
      initialCapital: 1_000_000,
      finalCash: 1_050_000,
      finalEquity: 1_050_000,
      trades: [],
      equityCurve: [],
    });

    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        <Route path="/backtests/preview" element={<div data-testid="preview-target" />} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'], auth: { status: 'anonymous' } },
    );

    expect(screen.getByText(/No account needed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /run backtest/i }));

    await waitFor(() => expect(screen.getByTestId('preview-target')).toBeTruthy());
    expect(previewSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).not.toHaveBeenCalled();
    const stored = JSON.parse(sessionStorage.getItem('tradeiq_backtest_preview_v1') ?? 'null');
    expect(stored.results.finalEquity).toBe(1_050_000);
    expect(stored.config.security.symbol).toBe(sampSecurity.symbol);
  });

  it('prevents duplicate submissions when Run Backtest is clicked repeatedly', async () => {
    seedValidDraft();
    let resolveSubmit: (val: CreateBacktestRunResponse) => void;
    const submitPromise = new Promise<CreateBacktestRunResponse>((resolve) => {
      resolveSubmit = resolve;
    });

    const submitSpy = vi.spyOn(api, 'submitBacktestRun').mockReturnValue(submitPromise);

    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        <Route path="/backtests/:runId/status" element={<div>Status</div>} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'] },
    );

    const runBtn = screen.getByRole('button', { name: /run backtest/i });

    // Click multiple times rapidly
    fireEvent.click(runBtn);
    fireEvent.click(runBtn);
    fireEvent.click(runBtn);

    // Only one API submission should be triggered
    expect(submitSpy).toHaveBeenCalledTimes(1);

    // Button should be disabled during submission
    expect(runBtn.hasAttribute('disabled')).toBe(true);

    // Resolve promise
    resolveSubmit!({ id: 'mock-uuid-999', status: 'queued' });
  });

  it('surfaces structured API validation error envelope and preserves configuration on failure', async () => {
    seedValidDraft();
    vi.spyOn(api, 'submitBacktestRun').mockRejectedValue(
      new ApiError({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fields: [{ field: 'rule.buy', reason: 'Invalid buy threshold' }],
        trace_id: 'corr-id-998877',
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'] },
    );

    const runBtn = screen.getByRole('button', { name: /run backtest/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Couldn’t run the test')).toBeTruthy();
      expect(screen.getByText('Request validation failed.')).toBeTruthy();
      expect(screen.getByText('corr-id-998877')).toBeTruthy();
      expect(screen.getByText(/Your settings are kept/)).toBeTruthy();
    });
  });

  it('maps a DATE_IN_DATA_GAP submission error onto the period step (docs/plans/data-gap-handling.md §5)', async () => {
    seedValidDraft();
    vi.spyOn(api, 'submitBacktestRun').mockRejectedValue(
      new ApiError({
        code: 'DATE_IN_DATA_GAP',
        message: 'No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.',
        details: { field: 'startDate', from: '2026-01-01', to: '2026-06-12' },
        trace_id: 'corr-id-gap-1',
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
      </Routes>,
      { initialEntries: ['/backtests/new/review'] },
    );

    fireEvent.click(screen.getByRole('button', { name: /run backtest/i }));

    // Surfaced immediately on the review page, like any other API error —
    // ValidationSummary lists every current validation error regardless of
    // which step is showing (and the "Couldn’t run the test" notice repeats the
    // same message on its own, hence >0 rather than exactly one match).
    await waitFor(() => {
      expect(
        screen.getAllByText('No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.').length,
      ).toBeGreaterThan(0);
    });

    // Following it opens the period step, where the same message anchors
    // the start-date field, exactly like a client-caught gap error would.
    fireEvent.click(screen.getByRole('button', { name: 'Go to dates' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose dates' })).toBeTruthy();
    });
    expect(
      screen.getAllByText('No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.').length,
    ).toBeGreaterThan(0);
  });
});

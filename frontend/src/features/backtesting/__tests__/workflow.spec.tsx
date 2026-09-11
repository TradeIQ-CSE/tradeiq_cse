// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BacktestWizard } from '../components/BacktestWizard';
import * as api from '../api/backtestApi';
import { ApiError } from '../../../lib/api';
import { createDefaultBacktestConfig } from '../domain/defaults';

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
    render(
      <MemoryRouter initialEntries={['/backtests/new/security']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Test a strategy against the past' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Choose a CSE security' })).toBeTruthy();
  });

  it('does not present an incomplete direct review as ready to submit', () => {
    render(
      <MemoryRouter initialEntries={['/backtests/new/review']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Configuration requires attention')).toBeTruthy();
    expect(screen.getByRole('button', { name: /run backtest/i })).toBeDisabled();
  });

  it('preserves entered values when moving to the next step and then back', async () => {
    render(
      <MemoryRouter initialEntries={['/backtests/new/security']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
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
      expect(screen.getByRole('heading', { name: 'Choose the historical period' })).toBeTruthy();
    });

    // Change the range using the BoardUI preset control.
    fireEvent.click(screen.getByRole('button', { name: '1 year' }));
    expect(screen.getByText('Selected: 2025-01-01 to 2025-12-31')).toBeTruthy();

    // Advance to Rules step
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Define entry and exit rules' })).toBeTruthy();
    });

    // Click Back
    const backBtn = screen.getByRole('button', { name: /navigate to previous step/i });
    fireEvent.click(backBtn);

    // Returned to Period step and preserved the selected range.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose the historical period' })).toBeTruthy();
      expect(screen.getByText('Selected: 2025-01-01 to 2025-12-31')).toBeTruthy();
    });

    // Click Back again to return to Security step
    fireEvent.click(screen.getByRole('button', { name: /navigate to previous step/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Choose a CSE security' })).toBeTruthy();
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

    render(
      <MemoryRouter initialEntries={['/backtests/new/review']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
          <Route path="/backtests/:runId/status" element={<LocationTracker />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Review simulation assumptions' })).toBeTruthy();
    expect(screen.getByText('Everything looks valid.')).toBeTruthy();

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

  it('prevents duplicate submissions when Run Backtest is clicked repeatedly', async () => {
    seedValidDraft();
    let resolveSubmit: (val: CreateBacktestRunResponse) => void;
    const submitPromise = new Promise<CreateBacktestRunResponse>((resolve) => {
      resolveSubmit = resolve;
    });

    const submitSpy = vi.spyOn(api, 'submitBacktestRun').mockReturnValue(submitPromise);

    render(
      <MemoryRouter initialEntries={['/backtests/new/review']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
          <Route path="/backtests/:runId/status" element={<div>Status</div>} />
        </Routes>
      </MemoryRouter>,
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

    render(
      <MemoryRouter initialEntries={['/backtests/new/review']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
    );

    const runBtn = screen.getByRole('button', { name: /run backtest/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Submission Failed')).toBeTruthy();
      expect(screen.getByText('Request validation failed.')).toBeTruthy();
      expect(screen.getByText('corr-id-998877')).toBeTruthy();
      expect(screen.getByText(/Your parameters have been retained/)).toBeTruthy();
    });
  });
});

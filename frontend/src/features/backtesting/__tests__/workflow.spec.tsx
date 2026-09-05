// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BacktestWizard } from '../components/BacktestWizard';
import * as api from '../api/backtestApi';
import { ApiError } from '../../../lib/api';

describe('BacktestWizard Workflow Integration', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    // Default mock for universe search
    vi.spyOn(api, 'getSecuritiesUniverse').mockResolvedValue([]);
  });

  it('renders step 1 (Security) by default and displays heading', () => {
    render(
      <MemoryRouter initialEntries={['/backtests/new/security']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Configure Backtest Strategy')).toBeTruthy();
    expect(screen.getByText('1. Select Security')).toBeTruthy();
  });

  it('preserves entered values when moving to the next step and then back', async () => {
    render(
      <MemoryRouter initialEntries={['/backtests/new/security']}>
        <Routes>
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial security should display default JKH.N0000
    expect(screen.getAllByText('JKH.N0000').length).toBeGreaterThanOrEqual(1);

    // Select SAMP chip
    const sampChip = screen.getAllByRole('button', { name: /SAMP · Sampath/i })[0];
    fireEvent.click(sampChip);

    // Verify SAMP.N0000 is now selected
    expect(screen.getAllByText('SAMP.N0000').length).toBeGreaterThanOrEqual(1);

    // Click Next Step
    const nextBtn = screen.getByRole('button', { name: /advance to next step/i });
    fireEvent.click(nextBtn);

    // Now on Period step
    await waitFor(() => {
      expect(screen.getByText('2. Simulation Period')).toBeTruthy();
    });

    // Change start date
    const startInput = screen.getByLabelText(/start date/i);
    fireEvent.change(startInput, { target: { value: '2023-05-15' } });
    expect(screen.getByDisplayValue('2023-05-15')).toBeTruthy();

    // Advance to Rules step
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    await waitFor(() => {
      expect(screen.getByText('3. Configure Strategy Rules (v1 Price DSL)')).toBeTruthy();
    });

    // Click Back
    const backBtn = screen.getByRole('button', { name: /navigate to previous step/i });
    fireEvent.click(backBtn);

    // Returned to Period step and preserved 2023-05-15
    await waitFor(() => {
      expect(screen.getByText('2. Simulation Period')).toBeTruthy();
      expect(screen.getByDisplayValue('2023-05-15')).toBeTruthy();
    });

    // Click Back again to return to Security step
    fireEvent.click(screen.getByRole('button', { name: /navigate to previous step/i }));
    await waitFor(() => {
      expect(screen.getByText('1. Select Security')).toBeTruthy();
      expect(screen.getAllByText('SAMP.N0000').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('submits valid configuration to API and redirects with returned runId', async () => {
    const submitSpy = vi.spyOn(api, 'submitBacktestRun').mockResolvedValue({
      id: 'mock-uuid-12345',
      status: 'queued',
    });

    let currentPath = '';

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

    expect(screen.getByText('7. Review Simulation Assumptions')).toBeTruthy();
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
    let resolveSubmit: (val: any) => void;
    const submitPromise = new Promise((resolve) => {
      resolveSubmit = resolve;
    });

    const submitSpy = vi.spyOn(api, 'submitBacktestRun').mockReturnValue(submitPromise as any);

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

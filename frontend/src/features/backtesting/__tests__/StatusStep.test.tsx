// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StatusStep } from '../components/StatusStep';
import * as api from '../api/backtestApi';

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

    render(
      <MemoryRouter initialEntries={['/backtests/run-123/status']}>
        <Routes>
          <Route path="/backtests/:runId/status" element={<StatusStep />} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial load executes first status check (which fails)
    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Network glitch/i)).toBeTruthy();
    });

    // Wait for the automatic transient retry (2000ms delay) to complete
    await waitFor(
      () => {
        expect(getStatusSpy).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Backtest Simulation Complete!')).toBeTruthy();
        expect(screen.getByText('Trade count')).toBeTruthy();
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

    render(
      <MemoryRouter initialEntries={['/backtests/run-456/status']}>
        <Routes>
          <Route path="/backtests/:runId/status" element={<StatusStep />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Persistent 500 error/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Status Check/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Simulation in Progress...')).toBeTruthy();
    });
  });
});

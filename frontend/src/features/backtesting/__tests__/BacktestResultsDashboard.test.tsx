// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BacktestResultsDashboard } from '../components/BacktestResultsDashboard';
import * as api from '../api/backtestApi';

describe('BacktestResultsDashboard', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders completed backtest results with performance metrics, equity curve, and trade ledger', async () => {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-completed-1',
      status: 'completed',
      symbol: 'JKH',
      startDate: '2026-01-01',
      endDate: '2026-01-10',
      startingCapital: 1000000,
    });

    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 1000000,
      finalCash: 1050000,
      finalEquity: 1120000,
      totalReturnPct: 12.0,
      maxDrawdownPct: -3.5,
      volatilityPct: 8.2,
      tradeCount: 2,
      winRatePct: 100.0,
      trades: [
        {
          id: 1,
          date: '2026-01-02',
          type: 'BUY',
          executionPrice: 100.0,
          quantity: 100,
          grossValue: 10000,
          fees: 50,
          netCashFlow: -10050,
          reason: 'period_start',
        },
        {
          id: 2,
          date: '2026-01-08',
          type: 'SELL',
          executionPrice: 112.0,
          quantity: 100,
          grossValue: 11200,
          fees: 60,
          netCashFlow: 11140,
          realizedPnl: 1090,
          reason: 'target_price',
        },
      ],
      equityCurve: [
        { date: '2026-01-01', cash: 1000000, totalEquity: 1000000 },
        { date: '2026-01-02', cash: 989950, totalEquity: 1000000 },
        { date: '2026-01-08', cash: 1101090, totalEquity: 1120000 },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/backtests/run-completed-1']}>
        <Routes>
          <Route path="/backtests/:runId" element={<BacktestResultsDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Backtest Results Dashboard')).toBeTruthy();
      expect(screen.getByText(/run-completed-1/i)).toBeTruthy();
      expect(screen.getByText(/JKH/i)).toBeTruthy();
    });

    // Check performance metrics grid values rendered directly from API
    await waitFor(() => {
      expect(screen.getByText('+12.00%')).toBeTruthy();
      expect(screen.getByText('-3.50%')).toBeTruthy();
      expect(screen.getByText('8.20%')).toBeTruthy();
      expect(screen.getByText('100.00%')).toBeTruthy();
    });

    // Check trade ledger presence
    expect(screen.getByText('Trade Execution Ledger (2 trades)')).toBeTruthy();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    expect(screen.getByText('2026-01-08')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('SELL')).toBeTruthy();
  });

  it('renders running state with auto-polling banner and suppresses partial metrics', async () => {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-running-1',
      status: 'running',
      symbol: 'COMB',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      startingCapital: 500000,
    });

    const getResultsSpy = vi.spyOn(api, 'getBacktestRunResults');

    render(
      <MemoryRouter initialEntries={['/backtests/run-running-1']}>
        <Routes>
          <Route path="/backtests/:runId" element={<BacktestResultsDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Simulation in Progress…')).toBeTruthy();
      expect(screen.getByText(/2026-01-01 — 2026-06-30/i)).toBeTruthy();
    });

    // Results endpoint should NOT be called for running state
    expect(getResultsSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Trade Execution Ledger')).toBeNull();
  });

  it('renders failed state with safe failure reason and suppresses metrics', async () => {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-failed-1',
      status: 'failed',
      symbol: 'SAMP',
      failureReason: 'Insufficient historical price bars for symbol SAMP in requested range.',
    });

    render(
      <MemoryRouter initialEntries={['/backtests/run-failed-1']}>
        <Routes>
          <Route path="/backtests/:runId" element={<BacktestResultsDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Backtest Execution Failed')).toBeTruthy();
      expect(
        screen.getByText(/Insufficient historical price bars for symbol SAMP in requested range/i),
      ).toBeTruthy();
    });

    expect(screen.queryByText('Total Return')).toBeNull();
  });

  it('renders no-trade backtest as a valid completed result rather than an error', async () => {
    vi.spyOn(api, 'getBacktestRunStatus').mockResolvedValue({
      id: 'run-notrade-1',
      status: 'completed',
      symbol: 'DIAL',
    });

    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 200000,
      finalCash: 200000,
      finalEquity: 200000,
      totalReturnPct: 0.0,
      maxDrawdownPct: 0.0,
      volatilityPct: 0.0,
      tradeCount: 0,
      winRatePct: 0.0,
      trades: [],
      equityCurve: [{ date: '2026-01-01', cash: 200000, totalEquity: 200000 }],
    });

    render(
      <MemoryRouter initialEntries={['/backtests/run-notrade-1']}>
        <Routes>
          <Route path="/backtests/:runId" element={<BacktestResultsDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Backtest Results Dashboard')).toBeTruthy();
      expect(screen.getByText('No Trades Executed')).toBeTruthy();
      expect(
        screen.getByText(/The strategy completed successfully but generated no trades/i),
      ).toBeTruthy();
    });

    // Zero return rendered across metrics
    expect(screen.getAllByText('0.00%').length).toBeGreaterThan(0);
  });

  it('handles unavailable fetch failure with a manual retry action', async () => {
    const getStatusSpy = vi.spyOn(api, 'getBacktestRunStatus')
      .mockRejectedValueOnce(new Error('Network connection error'))
      .mockResolvedValueOnce({
        id: 'run-retry-1',
        status: 'completed',
        symbol: 'HNB',
      });

    vi.spyOn(api, 'getBacktestRunResults').mockResolvedValue({
      initialCapital: 100000,
      finalCash: 100000,
      finalEquity: 100000,
      trades: [],
      equityCurve: [],
    });

    render(
      <MemoryRouter initialEntries={['/backtests/run-retry-1']}>
        <Routes>
          <Route path="/backtests/:runId" element={<BacktestResultsDashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to retrieve backtest results')).toBeTruthy();
      expect(screen.getByText('Network connection error')).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Request/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Backtest Results Dashboard')).toBeTruthy();
    });
  });
});

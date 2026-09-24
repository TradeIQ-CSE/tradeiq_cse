// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BacktestPreviewPage } from '../components/BacktestPreviewPage';
import * as api from '../api/backtestApi';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { storeBacktestPreview } from '../domain/preview';
import { renderWithProviders } from '../../../test/render';

function seedPreview() {
  const config = createDefaultBacktestConfig();
  config.security.symbol = 'SAMP.N0000';
  config.period = { startDate: '2025-01-01', endDate: '2025-12-31' };
  storeBacktestPreview({
    config,
    results: {
      initialCapital: 1_000_000,
      finalCash: 1_050_000,
      finalEquity: 1_050_000,
      trades: [],
      equityCurve: [],
    },
    ranAt: '2026-09-24T10:00:00Z',
  });
}

function renderPage(status: 'authenticated' | 'anonymous') {
  return renderWithProviders(
    <Routes>
      <Route path="/backtests/preview" element={<BacktestPreviewPage />} />
      <Route path="/backtests/new/:step" element={<div data-testid="wizard" />} />
      <Route path="/backtests/:runId/status" element={<div data-testid="saved-run" />} />
      <Route path="/signup" element={<div data-testid="signup" />} />
    </Routes>,
    { initialEntries: ['/backtests/preview'], auth: { status } },
  );
}

describe('BacktestPreviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows the results and asks a visitor to sign in to keep them', () => {
    seedPreview();
    renderPage('anonymous');

    expect(screen.getByText('SAMP.N0000 · 2025-01-01 to 2025-12-31')).toBeTruthy();
    expect(screen.getByText('Want to keep this result?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByTestId('signup')).toBeTruthy();
  });

  it('saves the same settings as a run once signed in', async () => {
    seedPreview();
    const submitSpy = vi
      .spyOn(api, 'submitBacktestRun')
      .mockResolvedValue({ id: 'run-1', status: 'queued' });
    renderPage('authenticated');

    fireEvent.click(screen.getByRole('button', { name: 'Save this backtest' }));

    await waitFor(() => expect(screen.getByTestId('saved-run')).toBeTruthy());
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'SAMP.N0000', startDate: '2025-01-01' }),
    );
    expect(sessionStorage.getItem('tradeiq_backtest_preview_v1')).toBeNull();
  });

  it('sends a visitor with no preview back to the wizard', () => {
    renderPage('anonymous');
    expect(screen.getByTestId('wizard')).toBeTruthy();
  });
});

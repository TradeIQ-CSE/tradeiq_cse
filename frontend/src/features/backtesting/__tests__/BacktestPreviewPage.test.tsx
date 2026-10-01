// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { BacktestPreviewPage } from '../components/BacktestPreviewPage';
import * as api from '../api/backtestApi';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { storeBacktestPreview } from '../domain/preview';
import { renderWithProviders } from '../../../test/render';

function seedPreview(endDate = '2025-12-31') {
  const config = createDefaultBacktestConfig();
  config.security.symbol = 'SAMP.N0000';
  config.period = { startDate: '2025-01-01', endDate };
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

  it('saves an old preview under its original single-cycle rules after reload and sign-in', async () => {
    seedPreview();
    const old = JSON.parse(sessionStorage.getItem('tradeiq_backtest_preview_v1')!);
    delete old.config.rules.version; delete old.config.rules.reentry;
    sessionStorage.setItem('tradeiq_backtest_preview_v1', JSON.stringify(old));
    const submit = vi.spyOn(api, 'submitBacktestRun').mockResolvedValue({ id: 'legacy', status: 'queued' });
    renderPage('authenticated');
    expect(screen.getByText('Original single-cycle strategy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save this backtest' }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].rule.version).toBe('1.0');
    expect(submit.mock.calls[0][0].rule.reentry).toBeUndefined();
  });

  it('preserves a historical preview and requires date repair before saving', async () => {
    seedPreview('2026-09-30');
    const original = JSON.parse(sessionStorage.getItem('tradeiq_backtest_preview_v1')!);
    const submit = vi.spyOn(api, 'submitBacktestRun');
    renderPage('authenticated');
    expect(screen.getByText('Result from a previous supported period')).toBeTruthy();
    expect(screen.getByText('SAMP.N0000 · 2025-01-01 to 2026-09-30')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save this backtest' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose supported dates' }));
    const draft = JSON.parse(sessionStorage.getItem('tradeiq_backtest_draft_v1')!);
    expect(draft.period.endDate).toBe('2025-12-31');
    expect(draft.rules).toEqual(original.config.rules);
    expect(draft.portfolio).toEqual(original.config.portfolio);
    expect(JSON.parse(sessionStorage.getItem('tradeiq_backtest_preview_v1')!)).toEqual(original);
    expect(submit).not.toHaveBeenCalled();
  });

  it('sends a visitor with no preview back to the wizard', () => {
    renderPage('anonymous');
    expect(screen.getByTestId('wizard')).toBeTruthy();
  });
});

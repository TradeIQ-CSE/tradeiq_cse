// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { createTestQueryClient, renderWithProviders } from '../../../test/render';
import * as api from '../api/backtestApi';
import { BacktestWizardProvider } from '../context/BacktestContext';
import { useBacktestWizard } from '../hooks/useBacktestWizard';
import { defaultBacktestPeriod, createDefaultBacktestConfig } from '../domain/defaults';
import { backtestBounds, suggestedBacktestPeriod } from '../domain/bounds';
import { validateBacktestConfig } from '../domain/validation';
import { BacktestWizard } from '../components/BacktestWizard';
import { ValidationSummary } from '../components/ValidationSummary';
import { ApiError } from '../../../lib/api';

const security = { symbol: 'COMB.N0000', dataFrom: '2017-01-02', dataTo: '2026-12-31' };
function Probe() {
  const wizard = useBacktestWizard();
  return <><output data-testid="policy-state">{JSON.stringify({ config: wizard.config, maxDate: wizard.maxDate, fallback: wizard.policyIsFallback, errors: wizard.getStepErrors('period'), summary: wizard.validationErrors })}</output><button onClick={() => wizard.selectSecurity(security)}>Choose</button><button onClick={() => wizard.validateCurrentStep()}>Validate</button><button onClick={() => wizard.submitBacktest()}>Submit</button><ValidationSummary /></>;
}
function state() { return JSON.parse(screen.getByTestId('policy-state').textContent!); }
function probe(client = createTestQueryClient()) {
  renderWithProviders(<Routes><Route path="/backtests/new/:step" element={<BacktestWizardProvider><Probe /></BacktestWizardProvider>} /></Routes>, { initialEntries: ['/backtests/new/period'], queryClient: client });
  return client;
}

describe('backtesting policy', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  it('caps history and every trailing-year preset while leaving shorter history intact', () => {
    expect(defaultBacktestPeriod(security.dataFrom, security.dataTo)).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
    for (const years of [1, 2, 5, undefined]) expect(suggestedBacktestPeriod(security.dataFrom, security.dataTo, [], '2025-12-31', years)?.endDate).toBe('2025-12-31');
    expect(backtestBounds('2024-06-01', '2024-12-31').maximum).toBe('2024-12-31');
    expect(defaultBacktestPeriod('2026-01-01', '2026-12-31')).toEqual({ startDate: '', endDate: '' });
  });
  it('does not snap a generated start beyond the configured cutoff', () => {
    expect(suggestedBacktestPeriod('2025-01-01', '2026-12-31', [{ from: '2025-01-01', to: '2026-06-12', kind: 'missing_data', sessions: 300 }], '2025-12-31')).toBeNull();
  });
  it('permits future history only when the policy is extended', () => {
    const config = createDefaultBacktestConfig(); config.security = security; config.period = { startDate: '2026-01-01', endDate: '2026-12-31' };
    expect(validateBacktestConfig(config, 'period').isValid).toBe(false);
    expect(validateBacktestConfig(config, 'period', [], '2026-12-31').isValid).toBe(true);
  });
  it('uses a conservative fallback on policy failure', async () => {
    vi.spyOn(api, 'getBacktestPolicy').mockRejectedValue(new Error('offline'));
    probe(); fireEvent.click(screen.getByText('Choose'));
    await waitFor(() => expect(state().fallback).toBe(true));
    expect(state().config.period.endDate).toBe('2025-12-31');
  });
  it('refreshes default dates when delayed policy arrives, and on a later configuration change', async () => {
    let resolve!: (policy: { maxDate: string }) => void;
    const pending = new Promise<{ maxDate: string }>((done) => { resolve = done; });
    const policy = vi.spyOn(api, 'getBacktestPolicy').mockReturnValueOnce(pending).mockResolvedValue({ maxDate: '2026-09-30' });
    const client = probe(); fireEvent.click(screen.getByText('Choose'));
    expect(state().config.period.endDate).toBe('2025-12-31');
    resolve({ maxDate: '2026-12-31' });
    await waitFor(() => expect(state().config.period.endDate).toBe('2026-12-31'));
    await client.invalidateQueries({ queryKey: ['backtest-policy'] });
    await waitFor(() => expect(state().config.period.endDate).toBe('2026-09-30'));
    expect(policy).toHaveBeenCalledTimes(2);
  });
  it('retains the previously loaded policy through a transient refresh failure', async () => {
    const policy = vi.spyOn(api, 'getBacktestPolicy').mockResolvedValueOnce({ maxDate: '2026-12-31' }).mockRejectedValue(new Error('offline'));
    const client = probe(); fireEvent.click(screen.getByText('Choose'));
    await waitFor(() => expect(state().maxDate).toBe('2026-12-31'));
    await client.invalidateQueries({ queryKey: ['backtest-policy'] });
    expect(policy.mock.calls.length).toBeGreaterThan(1);
    expect(state().maxDate).toBe('2026-12-31'); expect(state().fallback).toBe(false);
  });
  it('recomputes a restored coverage default while preserving custom strategy settings', async () => {
    const config = createDefaultBacktestConfig(); config.security = security; config.period = { startDate: '2026-01-01', endDate: '2026-12-31' }; config.portfolio.startingCapital = 500_000;
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify({ ...config, periodUsesCoverageDefault: true })); probe();
    await waitFor(() => expect(state().config.period.endDate).toBe('2025-12-31'));
    expect(state().config.portfolio).toEqual(config.portfolio); expect(state().config.rules).toEqual(config.rules);
  });
  it('retires stored cutoff errors from both fields and summary when the policy is raised', async () => {
    const config = createDefaultBacktestConfig(); config.security = security; config.period = { startDate: '2026-01-01', endDate: '2026-12-31' };
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
    const policy = vi.spyOn(api, 'getBacktestPolicy').mockResolvedValue({ maxDate: '2025-12-31' });
    const client = probe(); await waitFor(() => expect(state().fallback).toBe(false));
    fireEvent.click(screen.getByText('Validate'));
    expect(state().summary).toHaveLength(2); expect(state().errors).toHaveLength(2);
    policy.mockResolvedValue({ maxDate: '2026-12-31' });
    await client.invalidateQueries({ queryKey: ['backtest-policy'] });
    await waitFor(() => expect(state().maxDate).toBe('2026-12-31'));
    expect(state().errors).toEqual([]); expect(state().summary).toEqual([]);
    expect(screen.queryByText(/to continue/)).not.toBeInTheDocument();
  });
  it('reconciles stored errors when delayed policy supplies an eligible coverage-default period', async () => {
    const config = createDefaultBacktestConfig(); config.security = { ...security, dataFrom: '2026-01-01' }; config.period = { startDate: '2026-01-01', endDate: '2026-12-31' };
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify({ ...config, periodUsesCoverageDefault: true }));
    let resolve!: (policy: { maxDate: string }) => void;
    vi.spyOn(api, 'getBacktestPolicy').mockReturnValue(new Promise((done) => { resolve = done; }));
    probe(); await waitFor(() => expect(state().config.period.startDate).toBe(''));
    fireEvent.click(screen.getByText('Validate'));
    expect(state().summary.length).toBeGreaterThan(0);
    resolve({ maxDate: '2026-12-31' });
    await waitFor(() => expect(state().config.period).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' }));
    expect(state().errors).toEqual([]); expect(state().summary).toEqual([]);
    expect(screen.queryByText(/to continue/)).not.toBeInTheDocument();
  });
  it('preserves relevant API-origin period errors across unrelated policy refresh then retires them when resolved', async () => {
    const config = createDefaultBacktestConfig(); config.security = security;
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
    const policy = vi.spyOn(api, 'getBacktestPolicy').mockResolvedValue({ maxDate: '2025-12-31' });
    vi.spyOn(api, 'submitBacktestRun').mockRejectedValue(new ApiError({ code: 'INVALID_DATE_RANGE', message: 'Server supports an earlier historical period.', details: { field: 'endDate', maxDate: '2024-12-31' }, trace_id: 'cutoff' }));
    const client = probe(); await waitFor(() => expect(state().fallback).toBe(false));
    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => expect(state().errors).toEqual([expect.objectContaining({ message: 'Server supports an earlier historical period.' })]));
    await client.invalidateQueries({ queryKey: ['backtest-policy'] });
    fireEvent.click(screen.getByText('Validate'));
    expect(state().errors).toEqual([expect.objectContaining({ message: 'Server supports an earlier historical period.' })]);
    policy.mockResolvedValue({ maxDate: '2026-12-31' });
    await client.invalidateQueries({ queryKey: ['backtest-policy'] });
    await waitFor(() => expect(state().maxDate).toBe('2026-12-31'));
    expect(state().errors).toEqual([]); expect(state().summary).toEqual([]);
  });
  it('preserves custom stale dates and investment settings when policy loads', async () => {
    const config = createDefaultBacktestConfig(); config.security = security; config.period = { startDate: '2026-01-01', endDate: '2026-09-30' }; config.portfolio.startingCapital = 500_000;
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config)); probe();
    await waitFor(() => expect(state().fallback).toBe(false));
    expect(state().config.period).toEqual(config.period); expect(state().config.portfolio).toEqual(config.portfolio);
    expect(state().errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endDate', message: expect.stringContaining('Backtesting is available through') })]));
  });
  it.each(['simple', 'advanced'])('repairs a stale custom period in %s without resetting strategy or capital', async (mode) => {
    const config = createDefaultBacktestConfig(); config.security = security; config.period = { startDate: '2026-01-01', endDate: '2026-09-30' }; config.portfolio.startingCapital = 500_000;
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
    renderWithProviders(<Routes><Route path="/backtests/new/:step" element={<BacktestWizard />} /></Routes>, { initialEntries: [`/backtests/new/${mode === 'simple' ? 'security' : 'period'}?mode=${mode}`] });
    fireEvent.click(await screen.findByRole('button', { name: 'Use suggested period' }));
    await waitFor(() => {
      const draft = JSON.parse(sessionStorage.getItem('tradeiq_backtest_draft_v1')!);
      expect(draft.period).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
      expect(draft.portfolio).toEqual(config.portfolio); expect(draft.rules).toEqual(config.rules); expect(draft.execution).toEqual(config.execution);
    });
  });
  it('shows unavailable history rather than an invented range', async () => {
    const config = createDefaultBacktestConfig(); config.security = { ...security, dataFrom: '2026-01-01' };
    sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
    renderWithProviders(<Routes><Route path="/backtests/new/:step" element={<BacktestWizard />} /></Routes>, { initialEntries: ['/backtests/new/period'] });
    expect(await screen.findByText('No eligible backtesting period')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Backtest simulation date range' })).not.toBeInTheDocument();
  });
});

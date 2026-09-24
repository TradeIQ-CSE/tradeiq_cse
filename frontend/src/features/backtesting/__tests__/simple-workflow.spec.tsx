// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BacktestWizard } from '../components/BacktestWizard';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { mapToBacktestRequest } from '../domain/mapper';
import { ADVANCED_STEPS, simplePageFor, sectionsForPage, workflowLocation } from '../domain/workflow';
import type { BacktestConfig, CreateBacktestRunResponse } from '../domain/types';
import * as api from '../api/backtestApi';
import { renderWithProviders } from '../../../test/render';

const storageKey = 'tradeiq_backtest_draft_v1';
const company = {
  symbol: 'SAMP.N0000', company_name: 'Sampath Bank PLC',
  sector: { gics_code: '40101010', name: 'Banks' },
  shares_outstanding: 1_100_000_000, data_from: '2017-01-02', data_to: '2025-12-31',
  price: 121.5, change: 1.25, change_pct: 1.04, volume: 250_000, pe_ratio: 7.8,
};

function seedDraft(edit?: (config: BacktestConfig) => void) {
  const config = createDefaultBacktestConfig();
  config.security = { symbol: company.symbol, companyName: company.company_name,
    sector: company.sector.name, dataFrom: company.data_from, dataTo: company.data_to };
  edit?.(config);
  sessionStorage.setItem(storageKey, JSON.stringify(config));
  return config;
}

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button></>;
}

function renderWorkflow(entry = '/backtests/new') {
  return renderWithProviders(
    <>
      <HistoryControls />
      <Routes>
        <Route path="/backtests/new" element={<Navigate to="/backtests/new/security?mode=simple" replace />} />
        <Route path="/backtests/new/:step" element={<BacktestWizard />} />
        <Route path="/backtests/:runId/status" element={<h1>Simulation status</h1>} />
      </Routes>
    </>,
    { initialEntries: [entry] },
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(api, 'getSecuritiesUniverse').mockResolvedValue([company]);
});

describe('Simple backtesting workflow', () => {
  it('starts with three pages and hides the detailed calendar until requested', () => {
    renderWorkflow();
    expect(screen.getByRole('heading', { name: 'Choose a company and period' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Configure historical period' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '1 year' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Backtest configuration steps' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByText('Step 1 of 7')).not.toBeInTheDocument();
  });

  it('completes a fresh draft with company selection, two Continue actions and Run', async () => {
    const submit = vi.spyOn(api, 'submitBacktestRun').mockResolvedValue({ id: 'run-simple', status: 'queued' });
    renderWorkflow();
    fireEvent.click(await screen.findByRole('button', { name: /SAMP.N0000.*Sampath Bank PLC/i }));
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getByRole('heading', { name: 'Describe your investing idea' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Virtual starting cash (LKR)' })).toHaveValue(1_000_000);
    expect(screen.queryByRole('radio', { name: /Buy|Price/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Take profit after a 10% gain/)).toBeInTheDocument();
    expect(screen.getByText(/Stop loss after a 5% fall/)).toBeInTheDocument();
    expect(screen.getByText(/Combined simulation charge: 1.120%/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getAllByText('Step 3 of 3')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
    await screen.findByRole('heading', { name: 'Simulation status' });
    expect(submit).toHaveBeenCalledTimes(1);
    const expected = createDefaultBacktestConfig();
    expected.security.symbol = company.symbol;
    expect(submit).toHaveBeenCalledWith(mapToBacktestRequest(expected));
    expect(submit.mock.calls[0][0]).not.toHaveProperty('mode');
  });

  it('validates both company and period before leaving page one', async () => {
    seedDraft((config) => { config.period.startDate = '2016-01-01'; });
    renderWorkflow();
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getByRole('heading', { name: 'Choose a company and period' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide historical period' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/Start date cannot precede/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '1 year' }));
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getByRole('heading', { name: 'Describe your investing idea' })).toBeInTheDocument();
  });

  it('validates rules, execution and capital together and reveals invalid hidden settings', () => {
    seedDraft((config) => { config.rules.sells = []; config.execution.positionSizing = { type: 'fixed_quantity', value: 0 }; });
    renderWorkflow('/backtests/new/rules?mode=simple');
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getByRole('button', { name: 'Hide buy and sell rules' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Hide trade settings' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Describe your investing idea' })).toBeInTheDocument();
    expect(screen.getAllByText(/At least one sell condition/).length).toBeGreaterThan(0);
  });

  it('preserves custom settings and identical payloads through mode changes and reload', async () => {
    const config = seedDraft((draft) => {
      draft.period = { startDate: '2023-01-01', endDate: '2024-12-31' };
      draft.rules.buy = { type: 'price_falls_to', value: 100 };
      draft.execution.positionSizing = { type: 'fixed_quantity', value: 30 };
      draft.execution.fees.brokerageRate = 0.005;
      draft.portfolio.startingCapital = 500_000;
    });
    const user = userEvent.setup();
    const view = renderWorkflow('/backtests/new/execution');
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/backtests/new/rules?mode=simple');
    expect(screen.getAllByText('Custom')).toHaveLength(2);
    expect(screen.getByText('Buy at or below LKR 100.00.')).toBeInTheDocument();
    expect(screen.getByText('30 whole shares per entry.')).toBeInTheDocument();
    expect(mapToBacktestRequest(JSON.parse(sessionStorage.getItem(storageKey)!))).toEqual(mapToBacktestRequest(config));
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/backtests/new/rules?mode=advanced');
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    view.unmount();
    renderWorkflow('/backtests/new/rules?mode=simple');
    expect(screen.getByRole('spinbutton', { name: 'Virtual starting cash (LKR)' })).toHaveValue(500_000);
    expect(mapToBacktestRequest(JSON.parse(sessionStorage.getItem(storageKey)!))).toEqual(mapToBacktestRequest(config));
  });

  it('reveals and marks an invalid custom fee without requiring another configuration action', () => {
    seedDraft((config) => { config.execution.fees.brokerageRate = -0.005; });
    renderWorkflow('/backtests/new/rules?mode=simple');
    fireEvent.click(screen.getByRole('button', { name: /advance to next step/i }));
    expect(screen.getByRole('spinbutton', { name: 'Brokerage commission (%)' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Hide trade settings' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('supports keyboard disclosure controls and retains settings when closed', async () => {
    seedDraft();
    renderWorkflow('/backtests/new/rules?mode=simple');
    const user = userEvent.setup();
    const configure = screen.getByRole('button', { name: 'Configure buy and sell rules' });
    configure.focus();
    await user.keyboard('[Enter]');
    expect(configure).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('checkbox', { name: /Target Exit Price/i }));
    await user.click(screen.getByRole('button', { name: 'Hide buy and sell rules' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Sell at or above LKR/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Configure buy and sell rules' }));
    expect(screen.getByRole('checkbox', { name: /Target Exit Price/i })).toBeChecked();
  });

  it('restores the mode and page through browser back and forward without resetting cash', async () => {
    seedDraft();
    renderWorkflow('/backtests/new/rules?mode=simple');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Virtual starting cash (LKR)' }), { target: { value: '250000' } });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByRole('spinbutton', { name: 'Virtual starting cash (LKR)' })).toHaveValue(250_000);
    fireEvent.click(screen.getByRole('button', { name: 'Browser forward' }));
    expect(screen.getByRole('heading', { name: 'Define entry and exit rules' })).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).portfolio.startingCapital).toBe(250_000);
  });

  it('review edits open the relevant Simple configuration panel', () => {
    seedDraft();
    renderWorkflow('/backtests/new/review?mode=simple');
    const execution = screen.getByText('Execution').closest('section')!;
    fireEvent.click(execution.querySelector('button')!);
    expect(screen.getByTestId('location')).toHaveTextContent('/backtests/new/rules?mode=simple#execution');
    expect(screen.getByRole('button', { name: 'Hide trade settings' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('explains invalid direct review and provides a route to repair hidden analysis settings', () => {
    seedDraft((config) => { config.metrics.selected = []; });
    renderWorkflow('/backtests/new/review?mode=simple');
    expect(screen.getByRole('button', { name: 'Run backtest' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Open metrics' }));
    expect(screen.getByRole('button', { name: 'Hide analysis focus' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Run backtest' })).not.toBeDisabled();
  });

  it('blocks mode changes and duplicate requests during submission, and permits retry on failure', async () => {
    seedDraft();
    let reject!: (reason: Error) => void;
    const submit = vi.spyOn(api, 'submitBacktestRun').mockImplementationOnce(() => new Promise<CreateBacktestRunResponse>((_, fail) => { reject = fail; }))
      .mockResolvedValueOnce({ id: 'run-retry', status: 'queued' });
    renderWorkflow('/backtests/new/review?mode=simple');
    const run = screen.getByRole('button', { name: 'Run backtest' });
    fireEvent.click(run);
    fireEvent.click(run);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Advanced' })).toBeDisabled();
    reject(new Error('Connection interrupted'));
    await screen.findByText('Connection interrupted');
    expect(screen.getByRole('radio', { name: 'Advanced' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
    await screen.findByRole('heading', { name: 'Simulation status' });
    expect(submit.mock.calls[1][0]).toEqual(submit.mock.calls[0][0]);
  });

  it.each(ADVANCED_STEPS)('maps Advanced %s to its corresponding Simple page without mutating the draft', async (step) => {
    const config = seedDraft();
    renderWorkflow(`/backtests/new/${step}`);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Simple' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(workflowLocation('simple', step)));
    expect(mapToBacktestRequest(JSON.parse(sessionStorage.getItem(storageKey)!))).toEqual(mapToBacktestRequest(config));
  });
});

describe('workflow grouping', () => {
  it('uses the same section keys for validation and routing', () => {
    expect(sectionsForPage('simple', 'security')).toEqual(['security', 'period']);
    expect(sectionsForPage('simple', 'rules')).toEqual(['rules', 'execution', 'portfolio']);
    expect(sectionsForPage('simple', 'review')).toEqual(['metrics', 'review']);
    expect(simplePageFor('portfolio')).toBe('rules');
    expect(workflowLocation('simple', 'period', true)).toBe('/backtests/new/security?mode=simple#period');
    expect(sectionsForPage('advanced', 'execution')).toEqual(['execution']);
  });
});

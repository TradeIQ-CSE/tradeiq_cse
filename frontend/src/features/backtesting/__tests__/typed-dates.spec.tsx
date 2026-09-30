// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { parseDate } from '@internationalized/date';
import { DateRangePicker } from '../../../components/base/date-picker/date-range-picker';
import { renderWithProviders } from '../../../test/render';
import { createDefaultBacktestConfig } from '../domain/defaults';
import { BacktestWizard } from '../components/BacktestWizard';

function seed() {
  const config = createDefaultBacktestConfig();
  config.security = { symbol: 'COMB.N0000', dataFrom: '2017-01-02', dataTo: '2026-12-31' };
  sessionStorage.setItem('tradeiq_backtest_draft_v1', JSON.stringify(config));
  return config;
}
function wizard() {
  renderWithProviders(<Routes><Route path="/backtests/new/:step" element={<BacktestWizard />} /></Routes>, { initialEntries: ['/backtests/new/period'] });
}
describe('backtesting strict typed dates', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  it.each([
    ['Start date', '01/01/2026', /Backtesting is available through/],
    ['End date', '01/01/2026', /Backtesting is available through/],
    ['Start date', 'not-a-date', /Enter a real start date/],
    ['End date', '30/02/2025', /Enter a real end date/],
  ])('retains invalid %s text %s with field feedback and blocks Apply', async (label, text, error) => {
    const initial = seed(); wizard(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Backtest simulation date range' }));
    const input = screen.getByRole('textbox', { name: label });
    await user.clear(input); await user.type(input, text); await user.tab();
    expect(input).toHaveValue(text); expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.getByRole('button', { name: 'Apply range' })).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem('tradeiq_backtest_draft_v1')!).period).toEqual(initial.period);
  });
  it('clears strict errors after a correction and commits the entered valid period', async () => {
    seed(); wizard(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Backtest simulation date range' }));
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'End date' });
    await user.clear(input); await user.type(input, '01/01/2026'); await user.tab();
    expect(screen.getByRole('button', { name: 'Apply range' })).toBeDisabled();
    await user.clear(input); await user.type(input, '30/12/2025'); await user.tab();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply range' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(JSON.parse(sessionStorage.getItem('tradeiq_backtest_draft_v1')!).period.endDate).toBe('2025-12-30');
  });
  it('preserves other callers default clamping and built-in preset behavior', async () => {
    const change = vi.fn();
    renderWithProviders(<DateRangePicker value={{ start: parseDate('2025-01-01'), end: parseDate('2025-12-31') }} maxValue={parseDate('2025-12-31')} onChange={change} />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'Date range' }));
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'End date' });
    await user.clear(input); await user.type(input, '01/01/2026'); await user.tab();
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(change.mock.calls[0][0].end.toString()).toBe('2025-12-31');
  });
});

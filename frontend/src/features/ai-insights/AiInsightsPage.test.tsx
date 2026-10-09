import { describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test/render';
import { server } from '../../test/server';
import { securityDetailFixture } from '../../test/fixtures/security-detail';
import { predictionBatch, predictionCatalog, savedPrediction } from '../../test/fixtures/ml-predictions';
import { AiInsightsPage } from './AiInsightsPage';
import type { ConfigurationCatalog, PredictionStatus, SavedPrediction } from './types';

const predictionRoute = /\/predictions\/[A-Z0-9][A-Z0-9.-]{0,29}$/;

function serve({ prediction = savedPrediction(), catalog = predictionCatalog, status = { latest_run: predictionBatch, latest_completed_run: predictionBatch }, priceDate = '2026-10-07' }: {
  prediction?: SavedPrediction | null; catalog?: ConfigurationCatalog; status?: PredictionStatus; priceDate?: string;
} = {}) {
  server.use(
    http.get('*/predictions/configurations', () => HttpResponse.json({ data: catalog })),
    http.get('*/predictions/status', () => HttpResponse.json({ data: status })),
    http.get('*/securities/:symbol', ({ params }) => HttpResponse.json({ data: { ...securityDetailFixture, symbol: params.symbol, data_to: priceDate } })),
    http.get(predictionRoute, ({ request }) => HttpResponse.json({ data: {
      symbol: new URL(request.url).pathname.split('/').at(-1), config_key: new URL(request.url).searchParams.get('config_key'),
      prediction, availability: prediction ? 'available' : 'no_prediction',
    } })),
  );
}

function renderPage(path = '/ai-insights?symbol=COMB.N0000') {
  return renderWithProviders(<AiInsightsPage />, { initialEntries: [path] });
}

function unavailable() {
  return HttpResponse.json({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', trace_id: 'test' } }, { status: 503 });
}

describe('AI Insights', () => {
  it('shows the real setup, fractional probability and per-company date', async () => {
    serve();
    renderPage('/ai-insights?symbol=comb.n0000');
    expect(await screen.findByText('48.13%')).toBeInTheDocument();
    expect(screen.getByText('Profit target 1.5% · Loss threshold 0.75% · 36 trading days')).toBeInTheDocument();
    expect(screen.getByText('Data through Oct 7, 2026')).toBeInTheDocument();
    expect(screen.getByText('No model signal detected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View company' })).toHaveAttribute('href', '/markets/COMB.N0000');
    expect(screen.queryByText(/7560|7,560|T30/)).not.toBeInTheDocument();
  });

  it('uses the saved flag rather than a rounded probability threshold', async () => {
    serve({ prediction: savedPrediction({ prob_long: 0.65, is_long_signal: false }) });
    renderPage();
    expect(await screen.findByText('65%')).toBeInTheDocument();
    expect(screen.getByText('No model signal detected')).toBeInTheDocument();
    expect(screen.getByText(/does not mean you should sell/)).toBeInTheDocument();
  });

  it('shows a positive saved signal without executing an order', async () => {
    serve({ prediction: savedPrediction({ prob_long: 0.7123, is_long_signal: true }) });
    renderPage();
    expect(await screen.findByText('Model signal detected')).toBeInTheDocument();
    expect(screen.getByText(/does not place an order/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Buy|Train|Run model/ })).not.toBeInTheDocument();
  });

  it('keeps available partial-batch results visible during a newer update and uses their own date', async () => {
    serve({ prediction: savedPrediction({ data_as_of: '2026-10-06' }), status: {
      latest_run: { ...predictionBatch, run_id: 'new-run', status: 'running', completed_at: null }, latest_completed_run: predictionBatch,
    } });
    renderPage();
    expect(await screen.findByText('48.13%')).toBeInTheDocument();
    expect(screen.getByText('Results are being updated')).toBeInTheDocument();
    expect(screen.getByText('Data through Oct 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('This result uses older prices')).toBeInTheDocument();
  });

  it('does not treat elapsed calendar days as missing price data', async () => {
    serve({ prediction: savedPrediction({ data_as_of: '2026-10-02' }), priceDate: '2026-10-02' });
    renderPage();
    await screen.findByText('48.13%');
    expect(screen.queryByText('This result uses older prices')).not.toBeInTheDocument();
  });

  it('keeps a successful prediction when update status fails', async () => {
    serve();
    server.use(http.get('*/predictions/status', unavailable));
    renderPage();
    expect(await screen.findByText('48.13%')).toBeInTheDocument();
    expect(await screen.findByText(/Update status is unavailable/)).toBeInTheDocument();
  });

  it('shows a legitimate missing-result state without inventing a reason or zero probability', async () => {
    serve({ prediction: null });
    renderPage();
    expect(await screen.findByText('No saved result for this setup')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText(/insufficient history|training failed/i)).not.toBeInTheDocument();
  });

  it('handles a database with no completed batch', async () => {
    serve({ catalog: { configurations: [], default_config_key: null }, status: { latest_run: null, latest_completed_run: null } });
    renderPage();
    expect(await screen.findByText('No completed results yet')).toBeInTheDocument();
    expect(screen.queryByText(/Profit target 1.5%/)).not.toBeInTheDocument();
  });

  it('asks the user to choose a company without querying a prediction', async () => {
    serve();
    server.use(http.get(predictionRoute, () => { throw new Error('Prediction requested before a company was chosen'); }));
    renderPage('/ai-insights');
    expect(await screen.findByText('Choose a company to see its estimate')).toBeInTheDocument();
  });

  it('rejects malformed company links before requesting ML results', async () => {
    serve();
    server.use(http.get(predictionRoute, () => { throw new Error('Invalid company reached ML'); }));
    renderPage('/ai-insights?symbol=%3Cscript%3E');
    expect(await screen.findByText('Choose a listed company')).toBeInTheDocument();
  });

  it('handles a well-formed company that is not listed without requesting ML', async () => {
    serve();
    let predictionRequests = 0;
    server.use(
      http.get('*/securities/:symbol', () => HttpResponse.json({ error: { code: 'SECURITY_NOT_FOUND', message: 'Not found', trace_id: 'test' } }, { status: 404 })),
      http.get(predictionRoute, () => { predictionRequests += 1; return unavailable(); }),
    );
    renderPage('/ai-insights?symbol=UNKNOWN.N0000');
    expect(await screen.findByText('Choose a listed company')).toBeInTheDocument();
    expect(predictionRequests).toBe(0);
    expect(screen.queryByText('We couldn’t load this estimate')).not.toBeInTheDocument();
  });

  it('shows company lookup failures with a retry', async () => {
    serve();
    server.use(http.get('*/securities/:symbol', unavailable));
    renderPage();
    expect(await screen.findByText('We couldn’t load this company')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('recovers a prediction error using the read-only retry', async () => {
    const user = userEvent.setup();
    serve();
    server.use(http.get(predictionRoute, unavailable));
    renderPage();
    await screen.findByText('We couldn’t load this estimate');
    serve();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('48.13%')).toBeInTheDocument();
  });

  it('preserves a displayed result with an explicit warning if refresh fails', async () => {
    const user = userEvent.setup();
    serve();
    renderPage();
    await screen.findByText('48.13%');
    server.use(http.get(predictionRoute, unavailable));
    await user.click(screen.getByRole('button', { name: 'Refresh results' }));
    expect(await screen.findByText(/The result could not be refreshed/)).toBeInTheDocument();
    expect(screen.getByText('48.13%')).toBeInTheDocument();
  });

  it('only queries a supported setup and hides the previous probability while the next loads', async () => {
    const user = userEvent.setup();
    serve();
    const seen: string[] = [];
    server.use(http.get(predictionRoute, async ({ request }) => {
      const symbol = new URL(request.url).pathname.split('/').at(-1)!;
      const key = new URL(request.url).searchParams.get('config_key')!;
      seen.push(key);
      const configuration = predictionCatalog.configurations.find((item) => item.config_key === key)!;
      if (configuration.horizon_bars === 48) await delay(150);
      return HttpResponse.json({ data: { symbol, config_key: key, availability: 'available', prediction: savedPrediction({ configuration, prob_long: configuration.horizon_bars === 48 ? 0.83 : 0.4813 }) } });
    }));
    renderPage();
    await screen.findByText('48.13%');
    await user.click(screen.getByRole('button', { name: 'Change setup' }));
    await user.click(screen.getByRole('button', { name: /Trading period/ }));
    await user.click(await screen.findByRole('option', { name: '48 trading days' }));
    expect(screen.queryByText('48.13%')).not.toBeInTheDocument();
    expect(await screen.findByText('83%')).toBeInTheDocument();
    expect(seen).toContain('pt0.015_sl0.0075_H48_T30');
    expect(seen.every((key) => predictionCatalog.configurations.some((item) => item.config_key === key))).toBe(true);
  });

  it('adjusts dependent choices to supported combinations in a sparse catalog', async () => {
    const user = userEvent.setup();
    const setups = [
      { config_key: 'pt0.015_sl0.0075_H36_T30', take_profit_pct: 0.015, stop_loss_pct: 0.0075, horizon_bars: 36, test_days: 30 },
      { config_key: 'pt0.02_sl0.0075_H24_T30', take_profit_pct: 0.02, stop_loss_pct: 0.0075, horizon_bars: 24, test_days: 30 },
      { config_key: 'pt0.02_sl0.01_H48_T30', take_profit_pct: 0.02, stop_loss_pct: 0.01, horizon_bars: 48, test_days: 30 },
    ];
    serve({ catalog: { configurations: setups, default_config_key: setups[0].config_key } });
    const seen: string[] = [];
    server.use(http.get(predictionRoute, ({ request }) => {
      const key = new URL(request.url).searchParams.get('config_key')!;
      const configuration = setups.find((item) => item.config_key === key)!;
      seen.push(key);
      return HttpResponse.json({ data: { symbol: 'COMB.N0000', config_key: key, availability: 'available', prediction: savedPrediction({ configuration }) } });
    }));
    renderPage();
    await screen.findByText('48.13%');
    await user.click(screen.getByRole('button', { name: 'Change setup' }));
    await user.click(screen.getByRole('button', { name: /Profit target/ }));
    await user.click(await screen.findByRole('option', { name: '2%' }));
    await screen.findByText('Profit target 2% · Loss threshold 0.75% · 24 trading days');
    await user.click(screen.getByRole('button', { name: /Loss threshold/ }));
    await user.click(await screen.findByRole('option', { name: '1%' }));
    await screen.findByText('Profit target 2% · Loss threshold 1% · 48 trading days');
    await waitFor(() => expect(seen).toEqual(setups.map((item) => item.config_key)));
  });

  it('does not show a late response under a different company', async () => {
    const user = userEvent.setup();
    serve();
    server.use(http.get(predictionRoute, async ({ request }) => {
      const symbol = new URL(request.url).pathname.split('/').at(-1)!;
      if (symbol === 'COMB.N0000') await delay(700);
      return HttpResponse.json({ data: { symbol, config_key: new URL(request.url).searchParams.get('config_key'), availability: 'available', prediction: savedPrediction({ symbol: symbol, prob_long: symbol === 'JKH.N0000' ? 0.83 : 0.4813 }) } });
    }));
    renderPage();
    await screen.findByRole('link', { name: 'View company' });
    await user.clear(screen.getByRole('combobox', { name: 'Company' }));
    await user.type(screen.getByRole('combobox', { name: 'Company' }), 'JKH');
    await user.click(await screen.findByRole('option', { name: /JKH.N0000/ }));
    await screen.findByText('83%');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('JKH.N0000'));
    await delay(750);
    expect(screen.getByText('83%')).toBeInTheDocument();
    expect(screen.queryByText('48.13%')).not.toBeInTheDocument();
  });

  it('uses the catalog default instead of hardcoding the standard grid', async () => {
    const setup = { config_key: 'pt0.02_sl0.01_H24_T30', take_profit_pct: 0.02, stop_loss_pct: 0.01, horizon_bars: 24, test_days: 30 };
    serve({ catalog: { configurations: [setup], default_config_key: setup.config_key }, prediction: savedPrediction({ configuration: setup }) });
    renderPage();
    await screen.findByText('48.13%');
    expect(screen.getByText('Profit target 2% · Loss threshold 1% · 24 trading days')).toBeInTheDocument();
  });
});

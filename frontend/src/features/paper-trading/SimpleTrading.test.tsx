import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { server } from '@/test/server';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/render';
import { filledOrderFixture, orderEstimateFixture, portfolioFixture } from '@/test/fixtures/paper-trading';
import { PaperTradingPage } from './PaperTradingPage';
import { OrderTicket } from './OrderTicket';
import { CreatePortfolioForm } from './CreatePortfolioForm';
import { formatDay, formatMoney, formatSignedMoney } from './format';
import { within } from '@testing-library/react';

const t = i18n.t.bind(i18n);
const firstId = portfolioFixture.portfolio_id;
const secondId = '22222222-2222-4222-8222-222222222222';
const userSetup = () => userEvent.setup({ delay: null });
const review = () => screen.getByRole('button', { name: t('paperTrading.workflow.reviewTrade') });
const confirm = (side = 'buy') => screen.getByRole('button', { name: t(`paperTrading.workflow.confirm.${side}`) });

async function fill(user: ReturnType<typeof userSetup>) {
  await user.type(await screen.findByRole('combobox', { name: t('paperTrading.workflow.company') }), 'COMB.N0000');
  await user.type(screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') }), '1000');
}

function estimateMock() {
  const calls = vi.fn();
  server.use(http.post('*/portfolios/:portfolioId/orders/estimate', async ({ request, params }) => {
    const input = await request.json() as { symbol: string; side: 'buy' | 'sell'; quantity: number };
    calls(params.portfolioId, input);
    return HttpResponse.json({ data: { ...orderEstimateFixture, ...input } });
  }));
  return calls;
}

describe('Simple/Advanced paper trading', () => {
  it('guides missing inputs and advances the non-interactive steps only after an explicit review', async () => {
    const estimates = estimateMock();
    renderWithProviders(<OrderTicket portfolioId={firstId} mode="simple" />);
    const user = userSetup();
    const steps = screen.getByRole('list', { name: t('paperTrading.workflow.steps.label') });
    const current = () => within(steps).getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step');
    expect(current()).toHaveTextContent(t('paperTrading.workflow.steps.choose'));
    expect(screen.getByText(t('paperTrading.workflow.guidance.missingBoth'))).toBeVisible();
    expect(review()).toBeDisabled();
    expect(review()).toHaveAccessibleDescription(t('paperTrading.workflow.guidance.missingBoth'));
    const shares = screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') });
    await user.type(shares, '10');
    expect(review()).toHaveAccessibleDescription(t('paperTrading.workflow.guidance.missingCompany'));
    const company = screen.getByRole('combobox', { name: t('paperTrading.workflow.company') });
    await user.type(company, 'COMB.N0000');
    expect(review()).toBeEnabled();
    expect(current()).toHaveTextContent(t('paperTrading.workflow.steps.review'));
    expect(review()).toHaveAccessibleDescription(t('paperTrading.workflow.guidance.readyToReview'));
    expect(estimates).not.toHaveBeenCalled();
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(current()).toHaveTextContent(t('paperTrading.workflow.steps.confirm'));
    await user.clear(shares);
    expect(current()).toHaveTextContent(t('paperTrading.workflow.steps.choose'));
    expect(review()).toHaveAccessibleDescription(t('paperTrading.workflow.guidance.missingShares'));
    expect(screen.queryByRole('button', { name: /Confirm practice/ })).not.toBeInTheDocument();
  });

  it('keeps the selected company name visible across mode changes and removes it after editing the symbol', async () => {
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    const company = await screen.findByRole('combobox', { name: t('paperTrading.workflow.company') });
    await user.type(company, 'Commercial');
    await user.click(await screen.findByRole('option', { name: /COMB.N0000 Commercial Bank of Ceylon PLC/ }));
    expect(company).toHaveValue('COMB.N0000');
    expect(company).toHaveAccessibleDescription('Commercial Bank of Ceylon PLC');
    const descriptionId = company.getAttribute('aria-describedby')!;
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(screen.queryByRole('list', { name: t('paperTrading.workflow.steps.label') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    expect(company).toHaveAccessibleDescription('Commercial Bank of Ceylon PLC');
    await user.type(company, 'X');
    expect(company).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById(descriptionId)).not.toBeInTheDocument();
  });

  it('starts compact and requires explicit review followed by confirmation, with API figures unchanged', async () => {
    const estimates = estimateMock();
    const orders = vi.fn();
    server.use(http.post('*/portfolios/:portfolioId/orders', async ({ request, params }) => {
      orders(params.portfolioId, await request.json(), request.headers.get('Idempotency-Key'));
      return HttpResponse.json({ data: filledOrderFixture }, { status: 201 });
    }));
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await fill(user);
    expect(screen.getByRole('radio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('combobox', { name: t('portfolio.selector.label') })).not.toBeInTheDocument();
    expect(screen.getByText(portfolioFixture.name)).toBeVisible();
    expect(screen.queryByRole('button', { name: t('portfolio.selector.new') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('paperTrading.workflow.confirm.buy') })).not.toBeInTheDocument();
    expect(estimates).not.toHaveBeenCalled();
    expect(orders).not.toHaveBeenCalled();
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(estimates).toHaveBeenCalledTimes(1);
    expect(estimates).toHaveBeenCalledWith(firstId, { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 });
    expect(orders).not.toHaveBeenCalled();
    expect(screen.getByText(formatMoney(orderEstimateFixture.fee_total, 'en-LK'))).toBeVisible();
    expect(screen.getByText(formatSignedMoney(orderEstimateFixture.cash_effect, 'en-LK'))).toBeVisible();
    expect(screen.getByText(formatDay(orderEstimateFixture.price_as_of, 'en-LK'))).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.chargeBreakdown') }));
    expect(screen.getByRole('table')).toBeVisible();
    for (const fee of orderEstimateFixture.fees) expect(screen.getByText(formatMoney(fee.amount, 'en-LK'))).toBeVisible();
    await user.hover(screen.getByRole('button', { name: `More about ${t('paperTrading.ticket.estimate.title')}` }));
    expect(await screen.findByText(t('paperTrading.workflow.settlementHelp', { date: formatDay(orderEstimateFixture.settlement_date, 'en-LK') }))).toBeVisible();
    await user.click(confirm());
    await screen.findByText(t('paperTrading.ticket.result.filledTitle', { side: 'Buy', quantity: 1000, symbol: 'COMB.N0000' }));
    expect(orders).toHaveBeenCalledTimes(1);
    expect(orders).toHaveBeenCalledWith(firstId, { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 }, expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it('preserves inputs, a valid estimate and open details when toggling modes, without requests', async () => {
    const estimates = estimateMock();
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    const details = screen.getByRole('button', { name: t('paperTrading.workflow.chargeBreakdown') });
    details.focus();
    await user.keyboard('{Enter}');
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(details).toHaveAttribute('aria-controls');
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: t('paperTrading.ticket.confirm') })).toBeEnabled();
    expect(screen.getByRole('button', { name: new RegExp(`${t('portfolio.selector.label')}$`) })).toBeVisible();
    expect(screen.getByRole('button', { name: t('portfolio.selector.new') })).toBeVisible();
    expect(screen.getByText(formatDay(orderEstimateFixture.settlement_date, 'en-LK'))).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    expect(confirm()).toBeEnabled();
    expect(screen.getByRole('combobox', { name: t('paperTrading.workflow.company') })).toHaveValue('COMB.N0000');
    expect(screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') })).toHaveValue(1000);
    expect(screen.getByRole('button', { name: t('paperTrading.workflow.chargeBreakdown') })).toHaveAttribute('aria-expanded', 'true');
    expect(estimates).toHaveBeenCalledTimes(1);
  });

  it('invalidates a preview on portfolio changes and never resurrects it when switching back', async () => {
    const estimates = estimateMock();
    function Harness() {
      const [id, setId] = useState(firstId);
      return <><button onClick={() => setId(id === firstId ? secondId : firstId)}>Switch account</button><OrderTicket portfolioId={id} mode="simple" /></>;
    }
    renderWithProviders(<Harness />);
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(screen.queryByRole('button', { name: t('paperTrading.workflow.confirm.buy') })).not.toBeInTheDocument();
    expect(screen.getByText(t('paperTrading.ticket.estimate.stale'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    expect(screen.queryByRole('button', { name: t('paperTrading.workflow.confirm.buy') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch account' }));
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(estimates.mock.calls.map(([id]) => id)).toEqual([firstId, secondId]);
  });

  it.each(['quantity', 'symbol', 'side'] as const)('invalidates Simple confirmation immediately on %s changes', async (field) => {
    estimateMock();
    renderWithProviders(<OrderTicket portfolioId={firstId} mode="simple" />);
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    if (field === 'quantity') await user.clear(screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') }));
    if (field === 'symbol') await user.type(screen.getByRole('combobox', { name: t('paperTrading.workflow.company') }), 'X');
    if (field === 'side') await user.click(screen.getByRole('radio', { name: 'Sell' }));
    expect(screen.queryByRole('button', { name: /Confirm practice/ })).not.toBeInTheDocument();
    expect(screen.getByText(t('paperTrading.ticket.estimate.stale'))).toBeVisible();
  });

  it('guards duplicate keyboard reviews and leaves a late changed-input estimate stale', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    server.use(http.post('*/portfolios/:portfolioId/orders/estimate', async () => {
      calls += 1;
      await held;
      return HttpResponse.json({ data: orderEstimateFixture });
    }));
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await fill(user);
    const form = review().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(calls).toBe(1));
    expect(screen.getByRole('radio', { name: 'Advanced' })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('paperTrading.workflow.manageAccounts') })).toBeDisabled();
    await user.type(screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') }), '0');
    release();
    await screen.findByText(t('paperTrading.ticket.estimate.stale'));
    expect(screen.queryByRole('button', { name: /Confirm practice/ })).not.toBeInTheDocument();
  });

  it('blocks confirmation while refreshing an estimate, including native submits', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    const orders = vi.fn();
    server.use(
      http.post('*/portfolios/:portfolioId/orders/estimate', async () => {
        if (++count === 2) await held;
        return HttpResponse.json({ data: orderEstimateFixture });
      }),
      http.post('*/portfolios/:portfolioId/orders', () => { orders(); return HttpResponse.json({ data: filledOrderFixture }, { status: 201 }); }),
    );
    renderWithProviders(<OrderTicket portfolioId={firstId} mode="simple" />);
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    const form = review().closest('form')!;
    await user.click(review());
    await waitFor(() => expect(count).toBe(2));
    fireEvent.submit(form);
    expect(orders).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(confirm()).toBeEnabled());
  });

  it('prevents duplicate confirmation and retains the retry key across a mode change', async () => {
    estimateMock();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const keys: string[] = [];
    server.use(http.post('*/portfolios/:portfolioId/orders', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!);
      if (keys.length === 1) {
        await held;
        return HttpResponse.json({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', trace_id: 'qa' } }, { status: 503 });
      }
      return HttpResponse.json({ data: filledOrderFixture }, { status: 201 });
    }));
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    const form = confirm().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(keys).toHaveLength(1));
    expect(screen.getByRole('radio', { name: 'Advanced' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: t('paperTrading.workflow.shareCount') })).toBeDisabled();
    release();
    await screen.findByText(t('orders.codes.dependencyUnavailable'));
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: t('paperTrading.ticket.confirm') }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('creates a new account explicitly with visible defaults and no configuration required', async () => {
    const create = vi.fn();
    server.use(
      http.get('*/portfolios', () => HttpResponse.json({ data: create.mock.calls.length ? [portfolioFixture] : [], meta: { total: 0 } })),
      http.post('*/portfolios', async ({ request }) => { create(await request.json()); return HttpResponse.json({ data: portfolioFixture }, { status: 201 }); }),
    );
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await screen.findByRole('button', { name: t('paperTrading.workflow.createAccount') });
    expect(screen.getByText('Practice portfolio')).toBeVisible();
    expect(screen.getByText(t('paperTrading.workflow.setupCash', { cash: formatMoney(1_000_000, 'en-LK') }))).toBeVisible();
    expect(screen.queryByRole('textbox', { name: t('portfolio.create.name') })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.createAccount') }));
    await screen.findByRole('heading', { name: t('paperTrading.ticket.title') });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0]).toMatchObject({ name: 'Practice portfolio', starting_capital: 1_000_000 });
  });

  it('preserves custom setup fields across disclosures and modes', async () => {
    server.use(http.get('*/portfolios', () => HttpResponse.json({ data: [], meta: { total: 0 } })));
    renderWithProviders(<PaperTradingPage />);
    const user = userSetup();
    await user.click(await screen.findByRole('button', { name: t('paperTrading.workflow.configureAccount') }));
    const name = screen.getByRole('textbox', { name: t('portfolio.create.name') });
    const cash = screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') });
    await user.clear(name); await user.type(name, 'Custom practice account');
    await user.clear(cash); await user.type(cash, '500000');
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.configureAccount') }));
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(screen.getByRole('textbox', { name: t('portfolio.create.name') })).toHaveValue('Custom practice account');
    expect(screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') })).toHaveValue(500000);
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    expect(screen.getByText('Custom practice account')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: t('portfolio.create.name') })).not.toBeInTheDocument();
  });

  it('opens hidden invalid setup fields for client validation', async () => {
    renderWithProviders(<CreatePortfolioForm simple initialName="Practice portfolio" initialCapital={1_000_000} />);
    const user = userSetup();
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.configureAccount') }));
    const cash = screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') });
    await user.clear(cash); await user.type(cash, '1');
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.configureAccount') }));
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.createAccount') }));
    expect(screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: t('portfolio.create.startingCapital') })).toHaveAttribute('aria-invalid', 'true');
  });

  it('exposes server validation on hidden setup fields', async () => {
    server.use(http.post('*/portfolios', () => HttpResponse.json({ error: {
      code: 'VALIDATION_FAILED', message: 'Invalid setup', trace_id: 'qa',
      fields: [{ field: 'starting_capital', reason: 'Choose a different starting amount.' }],
    } }, { status: 400 })));
    renderWithProviders(<CreatePortfolioForm simple initialName="Practice portfolio" initialCapital={1_000_000} />);
    const user = userSetup();
    await user.click(screen.getByRole('button', { name: t('paperTrading.workflow.createAccount') }));
    expect(await screen.findByRole('spinbutton', { name: t('portfolio.create.startingCapital') })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Choose a different starting amount.')).toBeVisible();
  });

  it('honours an explicit Advanced URL', async () => {
    renderWithProviders(<PaperTradingPage />, { initialEntries: ['/paper-trading?mode=advanced'] });
    expect(await screen.findByRole('button', { name: t('paperTrading.ticket.preview') })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps multi-account switching visible in Simple and invalidates the estimate through the real selector', async () => {
    const second = { ...portfolioFixture, portfolio_id: secondId, name: 'Second practice account', cash_balance: 500_000 };
    server.use(http.get('*/portfolios', () => HttpResponse.json({ data: [portfolioFixture, second], meta: { total: 2 } })));
    const estimates = estimateMock();
    renderWithProviders(<PaperTradingPage />, { initialEntries: [`/paper-trading?portfolioId=${firstId}`] });
    const user = userSetup();
    await fill(user);
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    await user.click(screen.getByRole('button', { name: new RegExp(`${t('portfolio.selector.label')}$`) }));
    await user.click(await screen.findByRole('option', { name: /Second practice account/ }));
    expect(screen.queryByRole('button', { name: /Confirm practice/ })).not.toBeInTheDocument();
    expect(screen.getByText(t('paperTrading.ticket.estimate.stale'))).toBeVisible();
    expect(screen.getByText(t('paperTrading.workflow.availableCash', { cash: formatMoney(500_000, 'en-LK') }))).toBeVisible();
    await user.click(review());
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(estimates.mock.calls.map(([id]) => id)).toEqual([firstId, secondId]);
    await user.click(screen.getByRole('radio', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: t('paperTrading.ticket.confirm') })).toBeEnabled();
  });

  it('reviews and confirms a Simple sell using the same existing request fields', async () => {
    const estimates = estimateMock();
    const orders = vi.fn();
    server.use(http.post('*/portfolios/:portfolioId/orders', async ({ request }) => {
      orders(await request.json());
      return HttpResponse.json({ data: { ...filledOrderFixture, side: 'sell' } }, { status: 201 });
    }));
    renderWithProviders(<OrderTicket portfolioId={firstId} mode="simple" />);
    const user = userSetup();
    await fill(user);
    await user.click(screen.getByRole('radio', { name: 'Sell' }));
    await user.click(review());
    await waitFor(() => expect(confirm('sell')).toBeEnabled());
    expect(screen.getByText('Sell 1000 shares of COMB.N0000')).toBeVisible();
    expect(screen.getByText(t('paperTrading.workflow.cashEffect.sell'))).toBeVisible();
    await user.click(confirm('sell'));
    await waitFor(() => expect(orders).toHaveBeenCalledTimes(1));
    expect(orders).toHaveBeenCalledWith({ symbol: 'COMB.N0000', side: 'sell', quantity: 1000 });
    expect(estimates).toHaveBeenCalledWith(firstId, { symbol: 'COMB.N0000', side: 'sell', quantity: 1000 });
  });
});

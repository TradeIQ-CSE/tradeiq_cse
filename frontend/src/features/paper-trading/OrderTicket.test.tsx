import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { server } from '../../test/server';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../test/render';
import {
  filledOrderFixture,
  orderEstimateFixture,
  portfolioFixture,
  rejectedOrderFixture,
} from '../../test/fixtures/paper-trading';
import { formatMoney } from './format';
import * as queryKeys from './queryKeys';
import { OrderTicket } from './OrderTicket';

const t = i18n.t.bind(i18n);
const portfolioId = portfolioFixture.portfolio_id;
const locale = 'en-LK';

function errorBody(code: string, message: string) {
  return { error: { code, message, trace_id: 'test-trace' } };
}

function mockEstimate(body: Record<string, unknown> = { data: orderEstimateFixture }, status = 200) {
  server.use(
    http.post('*/portfolios/:portfolioId/orders/estimate', () =>
      HttpResponse.json(body, { status }),
    ),
  );
}

async function fillTicket(user: ReturnType<typeof userEvent.setup>) {
  const symbolInput = screen.getByRole('combobox', { name: t('paperTrading.ticket.symbol') });
  await user.clear(symbolInput);
  await user.type(symbolInput, 'COMB.N0000');

  const quantityInput = screen.getByLabelText(t('paperTrading.ticket.quantity'));
  await user.clear(quantityInput);
  await user.type(quantityInput, '1000');
}

async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: t('paperTrading.ticket.preview') }));
  await screen.findByText(t('paperTrading.ticket.estimate.title'));
}

function confirmButton() {
  return screen.getByRole('button', { name: t('paperTrading.ticket.confirm') });
}

describe('OrderTicket', () => {
  // Issue #40, case 1.
  it('shows the fees verbatim, fills the order, and invalidates every affected family', async () => {
    mockEstimate();
    server.use(
      http.post('*/portfolios/:portfolioId/orders', () =>
        HttpResponse.json({ data: filledOrderFixture }, { status: 201 }),
      ),
    );

    // Seeded so there is something for the mutation's onSuccess to mark
    // invalidated — an empty cache has nothing to invalidate, which would let
    // a dropped invalidation call pass unnoticed.
    const queryClient = (() => {
      const { queryClient: client } = renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
      client.setQueryData(queryKeys.positions(portfolioId), []);
      client.setQueryData(queryKeys.portfolioSummary(portfolioId), {});
      client.setQueryData(queryKeys.portfolios(), []);
      client.setQueryData(queryKeys.cashTransactions(portfolioId, 1), []);
      client.setQueryData(queryKeys.orders(portfolioId, undefined, 1), []);
      client.setQueryData(queryKeys.fills(portfolioId, 1), []);
      return client;
    })();

    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await preview(user);

    // The server's fee figures, rendered with no arithmetic of this
    // component's own (ADR 0008) — asserted with the same formatMoney the
    // component uses, against the fixture's own numbers.
    for (const fee of orderEstimateFixture.fees) {
      expect(screen.getByText(formatMoney(fee.amount, locale))).toBeInTheDocument();
    }
    expect(screen.getByText(formatMoney(orderEstimateFixture.fee_total, locale))).toBeInTheDocument();
    expect(
      screen.getByText(formatMoney(orderEstimateFixture.gross_consideration, locale)),
    ).toBeInTheDocument();

    await user.click(confirmButton());

    expect(
      await screen.findByText(
        t('paperTrading.ticket.result.filledTitle', {
          side: t('paperTrading.ticket.sides.buy'),
          quantity: filledOrderFixture.filled_quantity,
          symbol: filledOrderFixture.symbol,
        }),
      ),
    ).toBeInTheDocument();

    function isInvalidated(queryKey: readonly unknown[]) {
      const entry = queryClient
        .getQueryCache()
        .find({ queryKey: queryKey as unknown[], exact: true });
      return entry?.state.isInvalidated ?? false;
    }

    await waitFor(() => {
      expect(isInvalidated(queryKeys.positions(portfolioId))).toBe(true);
      expect(isInvalidated(queryKeys.portfolioSummary(portfolioId))).toBe(true);
      expect(isInvalidated(queryKeys.portfolios())).toBe(true);
      expect(isInvalidated(queryKeys.cashTransactions(portfolioId, 1))).toBe(true);
      expect(isInvalidated(queryKeys.orders(portfolioId, undefined, 1))).toBe(true);
      expect(isInvalidated(queryKeys.fills(portfolioId, 1))).toBe(true);
    });
  });

  // Issue #40, case 2.
  it('renders a rejected order as a warning, not an error, and invalidates only orders', async () => {
    mockEstimate();
    server.use(
      http.post('*/portfolios/:portfolioId/orders', () =>
        HttpResponse.json({ data: rejectedOrderFixture }, { status: 201 }),
      ),
    );

    const { queryClient } = renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
    queryClient.setQueryData(queryKeys.positions(portfolioId), []);
    queryClient.setQueryData(queryKeys.orders(portfolioId, undefined, 1), []);

    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await preview(user);
    await user.click(confirmButton());

    const banner = await screen.findByText(
      t('paperTrading.ticket.result.rejectedTitle', { symbol: rejectedOrderFixture.symbol }),
    );
    const region = banner.closest('[role]');
    expect(region).toHaveAttribute('role', 'status');
    // Warning treatment (yellow), never the error one (rose) — the two are
    // distinct BoardUI status tokens, and a rejected order must not be
    // dressed as a failed request.
    expect(region).toHaveClass('bg-status-yellow-background');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // The mapped reason — the exact text the equivalent 422 estimate error
    // would show (order-messages.ts is the one place either path is allowed
    // to word INSUFFICIENT_CASH).
    expect(screen.getByText(t('orders.codes.insufficientCash'))).toBeInTheDocument();

    const positionsEntry = queryClient
      .getQueryCache()
      .find({ queryKey: [...queryKeys.positions(portfolioId)], exact: true });
    const ordersEntry = queryClient
      .getQueryCache()
      .find({ queryKey: [...queryKeys.orders(portfolioId, undefined, 1)], exact: true });

    await waitFor(() => expect(ordersEntry?.state.isInvalidated).toBe(true));
    expect(positionsEntry?.state.isInvalidated).toBe(false);
  });

  // Issue #40, case 4 — the whole reason mapOrderCode returns an i18n key
  // rather than a display string: the same code must read identically
  // whether it came back from the estimate (422, never persisted) or from a
  // submitted order (201 rejected, persisted).
  it('renders a 422 estimate error identically to the equivalent 201 rejection', async () => {
    mockEstimate(errorBody('INSUFFICIENT_CASH', 'Not enough cash.'), 422);
    renderWithProviders(<OrderTicket portfolioId={portfolioId} />);

    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await user.click(screen.getByRole('button', { name: t('paperTrading.ticket.preview') }));

    expect(await screen.findByText(t('orders.codes.insufficientCash'))).toBeInTheDocument();
    expect(screen.queryByText('Not enough cash.')).not.toBeInTheDocument();
  });

  // Issue #40, case 3a: a transient failure keeps the same idempotency key so
  // a retry is the same logical submission, not a second one (§4).
  it('retries a 503 with the same Idempotency-Key', async () => {
    mockEstimate();
    const keys: string[] = [];
    let call = 0;
    server.use(
      http.post('*/portfolios/:portfolioId/orders', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        call += 1;
        if (call === 1) {
          return HttpResponse.json(
            errorBody('DEPENDENCY_UNAVAILABLE', 'Market data is unavailable.'),
            { status: 503 },
          );
        }
        return HttpResponse.json({ data: filledOrderFixture }, { status: 201 });
      }),
    );

    renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await preview(user);

    await user.click(confirmButton());
    const banner = await screen.findByText(t('orders.codes.dependencyUnavailable'));
    expect(banner.closest('[role]')).toHaveAttribute('role', 'alert');

    await user.click(confirmButton());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  // Issue #40, case 3b: a stored-key conflict is a different failure mode —
  // there is nothing safe to replay, so the next attempt must be a brand new
  // logical submission.
  it('rotates the Idempotency-Key after a 409 IDEMPOTENCY_KEY_REUSED', async () => {
    mockEstimate();
    const keys: string[] = [];
    let call = 0;
    server.use(
      http.post('*/portfolios/:portfolioId/orders', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        call += 1;
        if (call === 1) {
          return HttpResponse.json(errorBody('IDEMPOTENCY_KEY_REUSED', 'Key already used.'), {
            status: 409,
          });
        }
        return HttpResponse.json({ data: filledOrderFixture }, { status: 201 });
      }),
    );

    renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await preview(user);

    await user.click(confirmButton());
    await screen.findByText(t('orders.codes.idempotencyKeyReused'));

    await user.click(confirmButton());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  // Issue #40, case 5.
  it('disables Confirm the moment symbol, side or quantity changes after a preview', async () => {
    mockEstimate();
    renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
    const user = userEvent.setup({ delay: null });

    await fillTicket(user);
    await preview(user);
    expect(confirmButton()).toBeEnabled();

    // Quantity.
    const quantityInput = screen.getByLabelText(t('paperTrading.ticket.quantity'));
    await user.type(quantityInput, '0'); // 1000 -> 10000
    expect(confirmButton()).toBeDisabled();
    await preview(user);
    expect(confirmButton()).toBeEnabled();

    // Symbol.
    const symbolInput = screen.getByRole('combobox', { name: t('paperTrading.ticket.symbol') });
    await user.type(symbolInput, 'X');
    expect(confirmButton()).toBeDisabled();
    await preview(user);
    expect(confirmButton()).toBeEnabled();

    // Side.
    await user.selectOptions(
      screen.getByLabelText(t('paperTrading.ticket.side')),
      t('paperTrading.ticket.sides.sell'),
    );
    expect(confirmButton()).toBeDisabled();
  });

  // Issue #40, case 6. Two `user.click`s would each await their own
  // microtask queue and never overlap — proving nothing about the guard.
  // Firing two native submit events in the same tick, with the request held
  // open, is the only way to reproduce an actual double-click/double-Enter.
  it('issues exactly one POST /orders for two submits fired in the same tick', async () => {
    mockEstimate();
    let releaseSubmit: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      releaseSubmit = resolve;
    });
    let requests = 0;

    server.use(
      http.post('*/portfolios/:portfolioId/orders', async () => {
        requests += 1;
        await held;
        return HttpResponse.json({ data: filledOrderFixture }, { status: 201 });
      }),
    );

    renderWithProviders(<OrderTicket portfolioId={portfolioId} />);
    const user = userEvent.setup({ delay: null });
    await fillTicket(user);
    await preview(user);

    const form = confirmButton().closest('form');
    if (!form) throw new Error('order ticket form not found');

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(requests).toBeGreaterThan(0));
    expect(requests).toBe(1);

    releaseSubmit?.();
  });
});

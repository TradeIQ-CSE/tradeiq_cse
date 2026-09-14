// Plain .ts (not .tsx), so the wrapper is built with createElement rather
// than JSX — same convention as useSelectedPortfolio.test.ts and
// features/markets/useSecurities.test.ts.
import { createElement, ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { createTestQueryClient } from '../../test/render';
import {
  filledOrderFixture,
  portfolioFixture,
  rejectedOrderFixture,
} from '../../test/fixtures/paper-trading';
import * as queryKeys from './queryKeys';
import { useSubmitOrder } from './useOrders';

const portfolioId = portfolioFixture.portfolio_id;

function wrapperFor(queryClient: QueryClient = createTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { Wrapper, queryClient };
}

/**
 * Seeds one cache entry per query family a filled order is documented to
 * affect (useOrders.ts's onSuccess), so `invalidateQueries` has something to
 * mark. Some families get a second, differently-parameterised entry to prove
 * the `exact: false` invalidation catches every variant, not just the one a
 * component currently has mounted — the actual bug an `exact: true` (or a
 * hand-rolled single key) regression would introduce.
 */
function seedAllFamilies(queryClient: QueryClient) {
  queryClient.setQueryData(queryKeys.positions(portfolioId), []);
  queryClient.setQueryData(queryKeys.positions(portfolioId, '2025-01-09'), []);
  queryClient.setQueryData(queryKeys.portfolioSummary(portfolioId), {});
  queryClient.setQueryData(queryKeys.portfolios(), []);
  queryClient.setQueryData(queryKeys.cashTransactions(portfolioId, 1), []);
  queryClient.setQueryData(queryKeys.cashTransactions(portfolioId, 2), []);
  queryClient.setQueryData(queryKeys.orders(portfolioId, undefined, 1), []);
  queryClient.setQueryData(queryKeys.fills(portfolioId, 1), []);
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  const entry = queryClient.getQueryCache().find({ queryKey: queryKey as unknown[], exact: true });
  if (!entry) throw new Error(`no cache entry seeded for ${JSON.stringify(queryKey)}`);
  return entry.state.isInvalidated;
}

describe('useSubmitOrder', () => {
  it('invalidates every affected family (and every variant of it) when an order fills', async () => {
    server.use(
      http.post('*/portfolios/:portfolioId/orders', () =>
        HttpResponse.json({ data: filledOrderFixture }, { status: 201 }),
      ),
    );

    const { Wrapper, queryClient } = wrapperFor();
    seedAllFamilies(queryClient);

    const { result } = renderHook(() => useSubmitOrder(portfolioId), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        symbol: 'COMB.N0000',
        side: 'buy',
        quantity: 1000,
        idempotencyKey: 'test-key-1',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(isInvalidated(queryClient, queryKeys.positions(portfolioId))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.positions(portfolioId, '2025-01-09'))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.portfolioSummary(portfolioId))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.portfolios())).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.cashTransactions(portfolioId, 1))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.cashTransactions(portfolioId, 2))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.orders(portfolioId, undefined, 1))).toBe(true);
    expect(isInvalidated(queryClient, queryKeys.fills(portfolioId, 1))).toBe(true);
  });

  // §6.2: a 201 with `status: "rejected"` is a persisted, auditable order —
  // never a mutation error. Nothing but cash/holdings/history actually moved
  // NOT moving means invalidating positions/summary/portfolios/cash/fills
  // here would be a lie (point F). Both the mutation's own state and the
  // scope of what gets invalidated are asserted from the cache/hook, not by
  // spying on internals.
  it('treats a 201 rejection as a successful mutation and invalidates only orders', async () => {
    server.use(
      http.post('*/portfolios/:portfolioId/orders', () =>
        HttpResponse.json({ data: rejectedOrderFixture }, { status: 201 }),
      ),
    );

    const { Wrapper, queryClient } = wrapperFor();
    seedAllFamilies(queryClient);

    const { result } = renderHook(() => useSubmitOrder(portfolioId), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        symbol: 'COMB.N0000',
        side: 'buy',
        quantity: 100_000,
        idempotencyKey: 'test-key-2',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.data.status).toBe('rejected');

    expect(isInvalidated(queryClient, queryKeys.orders(portfolioId, undefined, 1))).toBe(true);

    expect(isInvalidated(queryClient, queryKeys.positions(portfolioId))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.positions(portfolioId, '2025-01-09'))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.portfolioSummary(portfolioId))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.portfolios())).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.cashTransactions(portfolioId, 1))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.cashTransactions(portfolioId, 2))).toBe(false);
    expect(isInvalidated(queryClient, queryKeys.fills(portfolioId, 1))).toBe(false);
  });
});

// TanStack Query wrappers over api.ts's order/estimate endpoints, in the
// style of usePortfolios.ts. No component exports here — react-refresh/
// only-export-components is a lint warning and this repo lints with
// --max-warnings 0.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { estimateOrder, getOrder, listOrders, submitOrder } from './api';
import * as queryKeys from './queryKeys';
import { OrderSide, OrderStatus } from './types';

// §6.1 — validation/pricing preview only, no idempotency key, no mutation of
// server state, so there is nothing to invalidate on success or failure.
export function useEstimateOrder(portfolioId: string) {
  return useMutation({
    mutationFn: (input: { symbol: string; side: OrderSide; quantity: number }) =>
      estimateOrder(portfolioId, input),
  });
}

// §6.2 — always a 201 for a well-formed order, `status: 'filled' | 'rejected'`
// decided synchronously (point B: orders are never pending, so there is no
// polling here). The invalidation below is the one place point F's asymmetry
// lives: a filled order moved cash, holdings and history, so every affected
// list/summary variant is invalidated (`exact: false`); a rejected order is
// still a successful, persisted submission, but nothing else changed, so only
// the order list is invalidated — invalidating summary/positions/cash for a
// rejected order would incorrectly suggest something moved.
export function useSubmitOrder(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...input
    }: {
      symbol: string;
      side: OrderSide;
      quantity: number;
      idempotencyKey: string;
    }) => submitOrder(portfolioId, input, idempotencyKey),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ordersAll(portfolioId), exact: false });

      if (result.data.status === 'filled') {
        queryClient.invalidateQueries({ queryKey: queryKeys.positionsAll(portfolioId), exact: false });
        queryClient.invalidateQueries({
          queryKey: queryKeys.portfolioSummaryAll(portfolioId),
          exact: false,
        });
        // The portfolio list itself carries `cash_balance` (§5.2).
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolios(), exact: false });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cashTransactionsAll(portfolioId),
          exact: false,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.fillsAll(portfolioId), exact: false });
      }
    },
  });
}

// §6.3 — list rows omit the nested `fill` (see types.ts).
export function useOrders(
  portfolioId: string | null,
  params?: { status?: OrderStatus; page?: number; page_size?: number },
) {
  return useQuery({
    queryKey: queryKeys.orders(portfolioId ?? '', params?.status, params?.page),
    queryFn: () => listOrders(portfolioId as string, params),
    enabled: !!portfolioId,
    // v5 passes (previousData, previousQuery). Mirrors usePortfolios.ts's
    // useCashTransactions: an unscoped `(previous) => previous` would reuse
    // the last page across a portfolio switch OR a status-filter change,
    // rendering portfolio A's (or "filled"'s) rows under portfolio B's (or
    // "rejected"'s) heading while the new request is in flight. Comparing
    // both the portfolio-id and status key segments (positions 1 and 2,
    // matching queryKeys.orders) keeps the smooth page-to-page transition
    // within one portfolio+filter and drops it whenever either changes.
    placeholderData: (previousData, previousQuery) => {
      const [, previousPortfolioId, previousStatus] = previousQuery?.queryKey ?? [];
      return previousPortfolioId === portfolioId && previousStatus === params?.status
        ? previousData
        : undefined;
    },
  });
}

// §6.4 — the complete order, including its fill when present.
export function useOrder(portfolioId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.order(portfolioId ?? '', orderId ?? ''),
    queryFn: () => getOrder(portfolioId as string, orderId as string),
    enabled: !!orderId && !!portfolioId,
  });
}

// TanStack Query wrappers over api.ts, in the style of
// features/markets/useSecurities.ts. Every key comes from queryKeys.ts so no
// call site re-derives one by hand.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortfolio, getPositions, getSummary, listCashTransactions, listPortfolios } from './api';
import * as queryKeys from './queryKeys';

export function usePortfolios() {
  return useQuery({
    queryKey: queryKeys.portfolios(),
    queryFn: () => listPortfolios(),
  });
}

export function useCreatePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...input
    }: {
      name: string;
      starting_capital: number;
      idempotencyKey: string;
    }) => createPortfolio(input, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolios() });
    },
  });
}

// `asOf` is for reproducible viewing only (docs/api/paper-trading-v1.md §7.1);
// it never affects order execution.
export function usePortfolioSummary(portfolioId: string | null, asOf?: string) {
  return useQuery({
    queryKey: queryKeys.portfolioSummary(portfolioId ?? '', asOf),
    queryFn: () => getSummary(portfolioId as string, asOf),
    enabled: !!portfolioId,
  });
}

export function usePositions(portfolioId: string | null, asOf?: string) {
  return useQuery({
    queryKey: queryKeys.positions(portfolioId ?? '', asOf),
    queryFn: () => getPositions(portfolioId as string, asOf),
    enabled: !!portfolioId,
  });
}

export function useCashTransactions(portfolioId: string | null, page: number) {
  return useQuery({
    queryKey: queryKeys.cashTransactions(portfolioId ?? '', page),
    queryFn: () => listCashTransactions(portfolioId as string, { page }),
    enabled: !!portfolioId,
    // v5 passes (previousData, previousQuery). An unscoped `(previous) =>
    // previous` reuses the last page across ANY key change, including a
    // portfolio switch — CashLedger isn't remounted on selection change, so
    // portfolio A's rows would render as "placeholder" data (which is not
    // `isPending`) under portfolio B's heading while B's request is in
    // flight. Comparing the previous query's portfolio-id key segment
    // (position 1, matching queryKeys.cashTransactions) against the current
    // one keeps the smooth page-to-page transition within one portfolio and
    // drops it across portfolios.
    placeholderData: (previousData, previousQuery) => {
      const [, previousPortfolioId] = previousQuery?.queryKey ?? [];
      return previousPortfolioId === portfolioId ? previousData : undefined;
    },
  });
}

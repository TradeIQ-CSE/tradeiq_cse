// Centralised TanStack Query keys for paper-trading, so nothing re-derives
// them by hand and every invalidation site agrees on the shape.
//
// The `*All` prefixes exist for `invalidateQueries({ queryKey, exact: false })`:
// a filled order changes cash, positions and fills at once, and each of
// those is keyed per as_of/page variant, so invalidation has to match every
// variant rather than one exact key.

export function portfolios() {
  return ['portfolios'] as const;
}

export function portfolioSummary(portfolioId: string, asOf?: string) {
  return ['portfolio-summary', portfolioId, asOf] as const;
}

export function portfolioSummaryAll(portfolioId: string) {
  return ['portfolio-summary', portfolioId] as const;
}

export function positions(portfolioId: string, asOf?: string) {
  return ['positions', portfolioId, asOf] as const;
}

export function positionsAll(portfolioId: string) {
  return ['positions', portfolioId] as const;
}

export function cashTransactions(portfolioId: string, page?: number) {
  return ['cash-transactions', portfolioId, page] as const;
}

export function cashTransactionsAll(portfolioId: string) {
  return ['cash-transactions', portfolioId] as const;
}

export function orders(portfolioId: string, status?: string, page?: number) {
  return ['orders', portfolioId, status, page] as const;
}

export function ordersAll(portfolioId: string) {
  return ['orders', portfolioId] as const;
}

export function order(portfolioId: string, orderId: string) {
  return ['order', portfolioId, orderId] as const;
}

export function fills(portfolioId: string, page?: number) {
  return ['fills', portfolioId, page] as const;
}

export function fillsAll(portfolioId: string) {
  return ['fills', portfolioId] as const;
}

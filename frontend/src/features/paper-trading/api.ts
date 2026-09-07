// One typed function per docs/api/paper-trading-v1.md endpoint, over the
// shared authedGet/authedPost/authedDelete helpers (lib/authed-api.ts). No
// React here — hooks live alongside the components that use them.
//
// Idempotency keys (§4) are always explicit arguments, never minted here:
// a key's lifecycle (generate once, reuse across retries of the same logical
// submission) is the calling component's responsibility, not this module's.

import { authedDelete, authedGet, authedPost, EnvelopeResult } from '../../lib/authed-api';
import {
  CashTransaction,
  FillListItem,
  Order,
  OrderEstimate,
  OrderSide,
  OrderStatus,
  Portfolio,
  PortfolioSummary,
  Position,
} from './types';

export interface PageParams {
  page?: number;
  page_size?: number;
}

// §5.2
export function listPortfolios(params?: PageParams): Promise<EnvelopeResult<Portfolio[]>> {
  return authedGet<Portfolio[]>('/portfolios', { page: params?.page, page_size: params?.page_size });
}

// §5.1
export function createPortfolio(
  input: { name: string; starting_capital: number },
  idempotencyKey: string,
): Promise<EnvelopeResult<Portfolio>> {
  return authedPost<Portfolio>('/portfolios', input, { idempotencyKey });
}

// §5.3
export function getPortfolio(portfolioId: string): Promise<EnvelopeResult<Portfolio>> {
  return authedGet<Portfolio>(`/portfolios/${portfolioId}`);
}

// §5.4
export function deletePortfolio(portfolioId: string): Promise<void> {
  return authedDelete(`/portfolios/${portfolioId}`);
}

// §7.1 — `asOf` is for reproducible viewing only; omitted means the latest session.
export function getPositions(
  portfolioId: string,
  asOf?: string,
): Promise<EnvelopeResult<Position[]>> {
  return authedGet<Position[]>(`/portfolios/${portfolioId}/positions`, { as_of: asOf });
}

// §7.2
export function getSummary(
  portfolioId: string,
  asOf?: string,
): Promise<EnvelopeResult<PortfolioSummary>> {
  return authedGet<PortfolioSummary>(`/portfolios/${portfolioId}/summary`, { as_of: asOf });
}

// §5.5
export function listCashTransactions(
  portfolioId: string,
  params?: PageParams,
): Promise<EnvelopeResult<CashTransaction[]>> {
  return authedGet<CashTransaction[]>(`/portfolios/${portfolioId}/cash-transactions`, {
    page: params?.page,
    page_size: params?.page_size,
  });
}

// §6.1 — validates only, no idempotency key, no database mutation. A domain
// failure here is thrown as an HTTP error, not a 200: 404 SECURITY_NOT_FOUND,
// or 422 for INSUFFICIENT_CASH, INSUFFICIENT_HOLDINGS, PRICE_UNAVAILABLE,
// STALE_PRICE, SECURITY_NOT_TRADABLE, TRANSACTION_LIMIT_EXCEEDED. This is the
// opposite of §6.2 submitOrder below: the *same* domain conditions on a
// submitted order come back as a 201 with `status: "rejected"`, not an error.
// Callers must not assume "estimate succeeded" implies "order will fill".
export function estimateOrder(
  portfolioId: string,
  input: { symbol: string; side: OrderSide; quantity: number },
): Promise<EnvelopeResult<OrderEstimate>> {
  return authedPost<OrderEstimate>(`/portfolios/${portfolioId}/orders/estimate`, input);
}

// §6.2 — key is required: a well-formed order is auditable and always 201,
// filled or rejected, so the key is what makes a retried submission safe.
export function submitOrder(
  portfolioId: string,
  input: { symbol: string; side: OrderSide; quantity: number },
  idempotencyKey: string,
): Promise<EnvelopeResult<Order>> {
  return authedPost<Order>(`/portfolios/${portfolioId}/orders`, input, { idempotencyKey });
}

// §6.3 — list rows omit `fill` entirely (see types.ts).
export function listOrders(
  portfolioId: string,
  params?: PageParams & { status?: OrderStatus },
): Promise<EnvelopeResult<Order[]>> {
  return authedGet<Order[]>(`/portfolios/${portfolioId}/orders`, {
    status: params?.status,
    page: params?.page,
    page_size: params?.page_size,
  });
}

// §6.4
export function getOrder(portfolioId: string, orderId: string): Promise<EnvelopeResult<Order>> {
  return authedGet<Order>(`/portfolios/${portfolioId}/orders/${orderId}`);
}

// §6.5
export function listFills(
  portfolioId: string,
  params?: PageParams,
): Promise<EnvelopeResult<FillListItem[]>> {
  return authedGet<FillListItem[]>(`/portfolios/${portfolioId}/fills`, {
    page: params?.page,
    page_size: params?.page_size,
  });
}

// Maps every server-side order condition to one i18n key. This is the single
// place either code path is allowed to word a domain condition, so the two
// ways the same condition can arrive — §6.1's estimate error and §6.2's
// persisted rejection (docs/api/paper-trading-v1.md) — can never drift into
// saying two different things for, say, INSUFFICIENT_CASH. Callers always do
// `t(mapOrderCode(code))`; this module never renders text itself.

// Namespace: kept under `orders.codes.*`, NOT moved to `paperTrading.*` with
// the rest of the ticket's strings — these are domain-condition messages
// (INSUFFICIENT_CASH, STALE_PRICE, …), not paper-trading-page UI copy, and
// the planned `/orders` history page will render the exact same codes for
// its own rejected/failed rows. `orders.*` is reserved for that page, but a
// shared domain vocabulary reads correctly living there regardless of which
// page renders it — `paperTrading.*` would read oddly once `/orders` starts
// depending on it too.
//
// §6.2 / §9.1 rejection codes, plus every other code an estimate or submit
// call can produce (§6.1 errors, §9.1 boundary errors) that this ticket has
// to render a message for.
export type MappedOrderCode =
  | 'SECURITY_NOT_FOUND'
  | 'SECURITY_NOT_TRADABLE'
  | 'PRICE_UNAVAILABLE'
  | 'STALE_PRICE'
  | 'TRANSACTION_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_HOLDINGS'
  | 'VALIDATION_FAILED'
  | 'PORTFOLIO_NOT_FOUND'
  | 'ORDER_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

const CODE_KEYS: Record<MappedOrderCode, string> = {
  INSUFFICIENT_CASH: 'orders.codes.insufficientCash',
  INSUFFICIENT_HOLDINGS: 'orders.codes.insufficientHoldings',
  TRANSACTION_LIMIT_EXCEEDED: 'orders.codes.transactionLimitExceeded',
  SECURITY_NOT_FOUND: 'orders.codes.securityNotFound',
  SECURITY_NOT_TRADABLE: 'orders.codes.securityNotTradable',
  PRICE_UNAVAILABLE: 'orders.codes.priceUnavailable',
  STALE_PRICE: 'orders.codes.stalePrice',
  VALIDATION_FAILED: 'orders.codes.validationFailed',
  PORTFOLIO_NOT_FOUND: 'orders.codes.portfolioNotFound',
  ORDER_NOT_FOUND: 'orders.codes.orderNotFound',
  IDEMPOTENCY_KEY_REUSED: 'orders.codes.idempotencyKeyReused',
  DEPENDENCY_UNAVAILABLE: 'orders.codes.dependencyUnavailable',
  INTERNAL: 'orders.codes.internal',
};

/** Returns an i18n key, never a display string — see the file banner above. */
export function mapOrderCode(code: string): string {
  return CODE_KEYS[code as MappedOrderCode] ?? 'orders.codes.unknown';
}

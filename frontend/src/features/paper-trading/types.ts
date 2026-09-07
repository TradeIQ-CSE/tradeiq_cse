// Mirrors docs/api/paper-trading-v1.md. Money fields (LKR, 4dp) and
// percentage fields (2dp) are JSON numbers on the wire (§3.1); nullable API
// fields are typed `T | null`, not `T | undefined`.

// The doc's only documented value; a soft-deleted portfolio (§5.4) is hidden
// from normal reads (404) rather than returned with a different status.
export type PortfolioStatus = 'active';

// §5.1 / §5.2 / §5.3
export interface Portfolio {
  portfolio_id: string;
  name: string;
  currency: 'LKR';
  starting_capital: number;
  cash_balance: number;
  status: PortfolioStatus;
  created_at: string;
}

// §7.2
export interface PortfolioSummary {
  portfolio_id: string;
  currency: 'LKR';
  // Null when no price data exists at all for the valuation session
  // (docs/api/paper-trading-v1.md §2.4); callers must not pass this straight
  // into a date formatter.
  as_of: string | null;
  starting_capital: number;
  cash_balance: number;
  holdings_value: number;
  total_equity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_return_pct: number;
}

// §7.1
export interface Position {
  symbol: string;
  quantity: number;
  cost_basis: number;
  average_cost: number;
  price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_return_pct: number;
}

// §5.5. Credits are positive, debits are negative (see the doc).
export type CashTransactionType = 'initial_capital' | 'buy_debit' | 'sell_credit';

export interface CashTransaction {
  transaction_id: string;
  type: CashTransactionType;
  amount: number;
  balance_after: number;
  effective_date: string;
  fill_id: string | null;
  created_at: string;
}

// §3.2 fee schedule component names.
export type OrderFeeType = 'brokerage' | 'cse' | 'cds' | 'sec_cess' | 'stl';

export interface OrderFee {
  type: OrderFeeType;
  rate_percent: number;
  amount: number;
}

// §6.1 — POST .../orders/estimate response.
export interface OrderEstimate {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  price_as_of: string;
  settlement_date: string;
  gross_consideration: number;
  fees: OrderFee[];
  fee_total: number;
  cash_effect: number;
}

// §6.2 nested fill and the §6.5 fill shape share these fields.
export interface Fill {
  fill_id: string;
  fill_date: string;
  settlement_date: string;
  quantity: number;
  price: number;
  gross_consideration: number;
  fee_total: number;
  cash_effect: number;
  realized_pnl: number | null;
}

// §6.5 — the standalone /fills list row, which additionally carries the
// order/symbol/side and the per-component fee breakdown that the order's
// nested fill (§6.2) does not.
export interface FillListItem extends Fill {
  order_id: string;
  symbol: string;
  side: OrderSide;
  fees: OrderFee[];
}

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'filled' | 'rejected';

// §6.2 / §9.1 — stable rejection codes for a persisted rejected order.
export type OrderRejectionCode =
  | 'SECURITY_NOT_FOUND'
  | 'SECURITY_NOT_TRADABLE'
  | 'PRICE_UNAVAILABLE'
  | 'STALE_PRICE'
  | 'TRANSACTION_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_HOLDINGS';

// §6.2 / §6.3 / §6.4. `fill` is optional, not just nullable: §6.3 (list)
// omits the key entirely, while §6.2/§6.4 (create/detail) always include it,
// set to `null` for a rejected order.
export interface Order {
  order_id: string;
  portfolio_id: string;
  symbol: string;
  side: OrderSide;
  order_type: 'market';
  quantity: number;
  filled_quantity: number;
  status: OrderStatus;
  rejection_code: OrderRejectionCode | null;
  placed_at: string;
  fill?: Fill | null;
}

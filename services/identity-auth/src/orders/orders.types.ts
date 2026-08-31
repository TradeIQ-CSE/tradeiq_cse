// Response shapes from docs/api/paper-trading-v1.md §6.

export interface FeeResponse {
  type: string;
  rate_percent: number;
  amount: number;
}

export interface EstimateResponse {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  price_as_of: string;
  settlement_date: string;
  gross_consideration: number;
  fees: FeeResponse[];
  fee_total: number;
  cash_effect: number;
}

export interface FillResponse {
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

export interface OrderResponse {
  order_id: string;
  portfolio_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: 'market';
  quantity: number;
  filled_quantity: number;
  status: 'filled' | 'rejected';
  rejection_code: string | null;
  placed_at: string;
  // §6.3 omits the nested fill on the list endpoint.
  fill?: FillResponse | null;
}

// §6.5 — a fill listed on its own carries the order context and its fee rows.
export interface FillListItem extends FillResponse {
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  fees: FeeResponse[];
}

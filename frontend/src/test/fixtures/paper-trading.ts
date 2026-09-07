import {
  CashTransaction,
  Order,
  OrderEstimate,
  Portfolio,
  PortfolioSummary,
  Position,
} from '../../features/paper-trading/types';

export const portfolioFixture: Portfolio = {
  portfolio_id: '11111111-1111-4111-8111-111111111111',
  name: 'Evaluation portfolio',
  currency: 'LKR',
  starting_capital: 1_000_000,
  cash_balance: 946_342.4,
  status: 'active',
  created_at: '2026-08-27T13:00:00Z',
};

// The figures here deliberately do NOT foot: cash + holdings - starting is
// 18342.4, while total_pnl is 17000. ADR 0008 forbids the frontend deriving
// any money figure, so a test asserting the rendered value equals total_pnl
// goes red the moment anyone computes it from the other three instead.
export const summaryFixture: PortfolioSummary = {
  portfolio_id: portfolioFixture.portfolio_id,
  currency: 'LKR',
  as_of: '2025-01-10',
  starting_capital: 1_000_000,
  cash_balance: 946_342.4,
  holdings_value: 72_000,
  total_equity: 1_018_342.4,
  realized_pnl: 7_014.4,
  unrealized_pnl: 11_328,
  total_pnl: 17_000,
  total_return_pct: 1.83,
};

export const positionsFixture: Position[] = [
  {
    symbol: 'COMB.N0000',
    quantity: 600,
    cost_basis: 60_672,
    average_cost: 101.12,
    price: 120,
    market_value: 72_000,
    unrealized_pnl: 11_328,
    unrealized_return_pct: 18.67,
  },
  {
    symbol: 'JKH.N0000',
    quantity: 100,
    cost_basis: 20_224,
    average_cost: 202.24,
    price: 198.5,
    market_value: 19_850,
    unrealized_pnl: -374,
    unrealized_return_pct: -1.85,
  },
];

// docs/api/paper-trading-v1.md §6.1's example, verbatim: every figure a test
// asserts against this must come from here unchanged, never recomputed —
// that is the point of the "server's fees verbatim" requirement (ADR 0008).
export const orderEstimateFixture: OrderEstimate = {
  symbol: 'COMB.N0000',
  side: 'buy',
  quantity: 1000,
  price: 100,
  price_as_of: '2025-01-10',
  settlement_date: '2025-01-14',
  gross_consideration: 100_000,
  fees: [
    { type: 'brokerage', rate_percent: 0.64, amount: 640 },
    { type: 'cse', rate_percent: 0.084, amount: 84 },
    { type: 'cds', rate_percent: 0.024, amount: 24 },
    { type: 'sec_cess', rate_percent: 0.072, amount: 72 },
    { type: 'stl', rate_percent: 0.3, amount: 300 },
  ],
  fee_total: 1120,
  cash_effect: -101_120,
};

// §6.2's filled example, verbatim.
export const filledOrderFixture: Order = {
  order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  portfolio_id: portfolioFixture.portfolio_id,
  symbol: 'COMB.N0000',
  side: 'buy',
  order_type: 'market',
  quantity: 1000,
  filled_quantity: 1000,
  status: 'filled',
  rejection_code: null,
  placed_at: '2026-08-27T13:05:00Z',
  fill: {
    fill_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    fill_date: '2025-01-10',
    settlement_date: '2025-01-14',
    quantity: 1000,
    price: 100,
    gross_consideration: 100_000,
    fee_total: 1120,
    cash_effect: -101_120,
    realized_pnl: null,
  },
};

// §6.2's rejected example, verbatim — a well-formed order that failed a
// domain check, still a 201 with no fill.
export const rejectedOrderFixture: Order = {
  order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  portfolio_id: portfolioFixture.portfolio_id,
  // Deliberately distinct from filledOrderFixture.symbol so tests that
  // render both rows in one table can query each unambiguously.
  symbol: 'JKH.N0000',
  side: 'buy',
  order_type: 'market',
  quantity: 100_000,
  filled_quantity: 0,
  status: 'rejected',
  rejection_code: 'INSUFFICIENT_CASH',
  placed_at: '2026-08-27T13:06:00Z',
  fill: null,
};

// §6.3 list rows: same orders, `fill` omitted entirely (not just null) —
// exactly the shape a real GET /orders list response has.
export const ordersListFixture: Order[] = [
  {
    order_id: filledOrderFixture.order_id,
    portfolio_id: filledOrderFixture.portfolio_id,
    symbol: filledOrderFixture.symbol,
    side: filledOrderFixture.side,
    order_type: filledOrderFixture.order_type,
    quantity: filledOrderFixture.quantity,
    filled_quantity: filledOrderFixture.filled_quantity,
    status: filledOrderFixture.status,
    rejection_code: filledOrderFixture.rejection_code,
    placed_at: filledOrderFixture.placed_at,
  },
  {
    order_id: rejectedOrderFixture.order_id,
    portfolio_id: rejectedOrderFixture.portfolio_id,
    symbol: rejectedOrderFixture.symbol,
    side: rejectedOrderFixture.side,
    order_type: rejectedOrderFixture.order_type,
    quantity: rejectedOrderFixture.quantity,
    filled_quantity: rejectedOrderFixture.filled_quantity,
    status: rejectedOrderFixture.status,
    rejection_code: rejectedOrderFixture.rejection_code,
    placed_at: rejectedOrderFixture.placed_at,
  },
];

export const cashTransactionsFixture: CashTransaction[] = [
  {
    transaction_id: '33333333-3333-4333-8333-333333333333',
    type: 'buy_debit',
    amount: -60_672,
    balance_after: 946_342.4,
    effective_date: '2025-01-10',
    fill_id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-08-27T13:05:00Z',
  },
  {
    transaction_id: '22222222-2222-4222-8222-222222222222',
    type: 'initial_capital',
    amount: 1_000_000,
    balance_after: 1_000_000,
    effective_date: '2025-01-09',
    fill_id: null,
    created_at: '2026-08-27T13:00:00Z',
  },
];

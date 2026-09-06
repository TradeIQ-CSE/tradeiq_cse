import {
  CashTransaction,
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

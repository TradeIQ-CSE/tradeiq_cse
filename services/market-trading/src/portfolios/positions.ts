import Decimal from 'decimal.js';
import { R2, R4, ZERO, money, toJsonNumber } from '../common/money/money';

// docs/api/paper-trading-v1.md §7.1 — one open position, priced at the
// response's single effective session.
export interface PositionResponse {
  symbol: string;
  quantity: number;
  cost_basis: number;
  average_cost: number;
  price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_return_pct: number;
}

// §7.2 — the whole-portfolio view.
export interface PortfolioSummaryResponse {
  portfolio_id: string;
  currency: 'LKR';
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

// One symbol's open lots, already aggregated. Costs stay Decimal all the way
// from the numeric column to the rounded result (§3.1: no binary float).
export interface OpenHolding {
  symbol: string;
  quantity: number;
  costBasis: Decimal;
}

export interface ValuedHolding {
  position: PositionResponse;
  marketValue: Decimal;
  unrealizedPnl: Decimal;
}

// §3.4:
//   cost_basis        = R4(sum(open lot remaining cost))
//   average_cost      = R4(cost_basis / quantity)
//   market_value      = R4(quantity × latest_close)
//   unrealized_pnl    = R4(market_value - cost_basis)
//   unrealized_return = R2(unrealized_pnl / cost_basis × 100)
//
// market_value and unrealized_pnl are returned alongside the response as
// Decimals so summarise() can total them without parsing its inputs back out of
// JSON numbers. They are the same R4 values the response carries, which is what
// §3.4 asks for: holdings_value = R4(sum(position market_value)) sums the
// per-position figures as printed.
export function valueHolding(
  holding: OpenHolding,
  close: Decimal,
): ValuedHolding {
  const costBasis = R4(holding.costBasis);
  const marketValue = R4(close.times(holding.quantity));
  const unrealizedPnl = R4(marketValue.minus(costBasis));

  return {
    marketValue,
    unrealizedPnl,
    position: {
      symbol: holding.symbol,
      quantity: holding.quantity,
      cost_basis: toJsonNumber(costBasis),
      average_cost: toJsonNumber(R4(costBasis.div(holding.quantity))),
      price: toJsonNumber(close),
      market_value: toJsonNumber(marketValue),
      unrealized_pnl: toJsonNumber(unrealizedPnl),
      // A zero cost basis cannot happen while quantity > 0 — a lot's cost is
      // gross consideration plus fees, and fees alone are non-zero — but
      // dividing by it would yield Infinity and serialise as null, so it is
      // reported as a flat 0% rather than left to produce a broken number.
      unrealized_return_pct: costBasis.isZero()
        ? 0
        : toJsonNumber(R2(unrealizedPnl.div(costBasis).times(100))),
    },
  };
}

// §3.4:
//   holdings_value = R4(sum(position market_value))
//   total_equity   = R4(cash_balance + holdings_value)
//   total_pnl      = R4(total_equity - starting_capital)
//   total_return   = R2(total_pnl / starting_capital × 100)
//
// cash + holdings == equity holds against the numbers in the response because
// each of the three is rounded to the same 4 places from exact operands.
export function summarise(input: {
  portfolioId: string;
  asOf: string | null;
  startingCapital: Decimal;
  cashBalance: Decimal;
  realizedPnl: Decimal;
  holdings: readonly ValuedHolding[];
}): PortfolioSummaryResponse {
  const holdingsValue = R4(
    input.holdings.reduce((sum, held) => sum.plus(held.marketValue), ZERO),
  );
  const unrealizedPnl = R4(
    input.holdings.reduce((sum, held) => sum.plus(held.unrealizedPnl), ZERO),
  );
  const cashBalance = R4(input.cashBalance);
  const startingCapital = R4(input.startingCapital);
  const totalEquity = R4(cashBalance.plus(holdingsValue));
  const totalPnl = R4(totalEquity.minus(startingCapital));

  return {
    portfolio_id: input.portfolioId,
    currency: 'LKR',
    as_of: input.asOf,
    starting_capital: toJsonNumber(startingCapital),
    cash_balance: toJsonNumber(cashBalance),
    holdings_value: toJsonNumber(holdingsValue),
    total_equity: toJsonNumber(totalEquity),
    realized_pnl: toJsonNumber(R4(input.realizedPnl)),
    unrealized_pnl: toJsonNumber(unrealizedPnl),
    total_pnl: toJsonNumber(totalPnl),
    // starting_capital is required to be positive at creation
    // (create-portfolio.dto.ts), so this cannot divide by zero.
    total_return_pct: toJsonNumber(
      R2(totalPnl.div(startingCapital).times(100)),
    ),
  };
}

// numeric columns arrive from the pg driver as strings; parsing them with
// Number first would put every figure through a binary float before the
// decimal arithmetic ever started.
export function fromNumericString(value: string | null): Decimal {
  return value === null ? ZERO : money(value);
}

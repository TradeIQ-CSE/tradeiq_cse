import Decimal from 'decimal.js';
import { OrderRejectionCode } from '../common/errors/api-exception';
import {
  FeeBreakdown,
  buyCashDebit,
  computeFees,
  exceedsTransactionLimit,
  grossConsideration,
  sellCashCredit,
} from '../common/money/fees';
import { money } from '../common/money/money';
import {
  ExecutionQuote,
  QuoteResult,
} from '../market-trading/market-trading.client';

export type OrderSide = 'buy' | 'sell';

export interface ExecutionInputs {
  side: OrderSide;
  quantity: number;
  quote: QuoteResult;
  // Both read under lock inside the transaction, per §4.
  cashBalance: Decimal;
  openQuantity: number;
}

export interface PricedOrder {
  price: Decimal;
  fillDate: string;
  settlementDate: string;
  gross: Decimal;
  fees: FeeBreakdown;
  // Negative on a buy, positive on a sell — the signed cash movement.
  cashEffect: Decimal;
}

export type ExecutionOutcome =
  | { rejected: true; code: OrderRejectionCode }
  | { rejected: false; priced: PricedOrder };

// The subset of a quote that is actually usable for pricing, with the nullable
// fields resolved. Returning these narrowed rather than re-reading the quote
// keeps the compiler responsible for the invariant: without it the caller
// needs `as number` / `as string` casts that would silently keep compiling if
// a null check here were ever removed.
interface PricedQuote {
  close: number;
  fillDate: string;
  settlementDate: string;
}

type QuoteCheck =
  { ok: true; priced: PricedQuote } | { ok: false; code: OrderRejectionCode };

function checkQuote(quote: ExecutionQuote): QuoteCheck {
  // §2.2 — a suspended or delisted security cannot be traded. Checked before
  // price: whether a delisted security has a recent close is irrelevant.
  if (quote.listing_status !== 'listed') {
    return { ok: false, code: 'SECURITY_NOT_TRADABLE' };
  }

  const { market_as_of, price_as_of, close, settlement_date } = quote;

  // §2.2 — "A missing or zero close rejects the order as PRICE_UNAVAILABLE."
  // Non-positive rather than exactly zero: a negative price is not a tradable
  // one either, and nothing upstream forbids it. market_as_of is null only
  // when the price database is empty, which amounts to the same thing.
  if (
    market_as_of === null ||
    price_as_of === null ||
    settlement_date === null ||
    close === null ||
    close <= 0
  ) {
    return { ok: false, code: 'PRICE_UNAVAILABLE' };
  }

  // §2.2 — "price_as_of must equal market_as_of. A security whose latest price
  // is older than the market session is stale and cannot be traded in v1."
  if (price_as_of !== market_as_of) {
    return { ok: false, code: 'STALE_PRICE' };
  }

  return {
    ok: true,
    priced: {
      close,
      fillDate: market_as_of,
      settlementDate: settlement_date,
    },
  };
}

// docs/api/paper-trading-v1.md §2.2, §3.2 — decides whether an order fills and
// at what cost.
//
// Deliberately pure and shared by both order submission and the estimate
// endpoint. Submission persists a returned rejection as a 201 order (§6.2);
// estimate throws it as an error envelope (§9.1). Deriving both from one
// function is what stops the two endpoints disagreeing about whether the same
// order was tradable.
export function priceOrder(inputs: ExecutionInputs): ExecutionOutcome {
  const { side, quantity, quote, cashBalance, openQuantity } = inputs;

  if (!quote.found) return { rejected: true, code: 'SECURITY_NOT_FOUND' };

  const check = checkQuote(quote.quote);
  if (!check.ok) return { rejected: true, code: check.code };

  const { close, fillDate, settlementDate } = check.priced;
  const price = money(close);

  const gross = grossConsideration(quantity, price);
  if (exceedsTransactionLimit(gross)) {
    return { rejected: true, code: 'TRANSACTION_LIMIT_EXCEEDED' };
  }

  const fees = computeFees(gross);

  if (side === 'buy') {
    const debit = buyCashDebit(gross, fees.total);
    // §11 puts margin and negative cash out of scope, so the debit must be
    // fully covered including fees.
    if (debit.greaterThan(cashBalance)) {
      return { rejected: true, code: 'INSUFFICIENT_CASH' };
    }
    return {
      rejected: false,
      priced: {
        price,
        fillDate,
        settlementDate,
        gross,
        fees,
        cashEffect: debit.negated(),
      },
    };
  }

  // §11 also rules out short selling, so a sell needs the shares already held.
  if (quantity > openQuantity) {
    return { rejected: true, code: 'INSUFFICIENT_HOLDINGS' };
  }

  return {
    rejected: false,
    priced: {
      price,
      fillDate,
      settlementDate,
      gross,
      fees,
      cashEffect: sellCashCredit(gross, fees.total),
    },
  };
}

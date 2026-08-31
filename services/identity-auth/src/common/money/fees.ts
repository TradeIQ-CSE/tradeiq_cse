import Decimal from 'decimal.js';
import { R4, ZERO, money } from './money';

export type FeeType = 'brokerage' | 'cse' | 'cds' | 'sec_cess' | 'stl';

export interface FeeComponent {
  type: FeeType;
  rate_percent: number;
  amount: Decimal;
}

export interface FeeBreakdown {
  components: FeeComponent[];
  total: Decimal;
}

// docs/api/paper-trading-v1.md §3.2 — the pinned CSE equity schedule for
// transaction values up to LKR 100 million, held to 5 decimal places in
// percent units. These are versioned simulator inputs: changing a rate changes
// what every historical fill would have cost, so they live here as a constant
// rather than as configuration someone can vary per environment.
//
// Buy and sell orders use the same schedule. Total is 1.12000%.
export const FEE_SCHEDULE: ReadonlyArray<{
  type: FeeType;
  ratePercent: string;
}> = [
  { type: 'brokerage', ratePercent: '0.64000' },
  { type: 'cse', ratePercent: '0.08400' },
  { type: 'cds', ratePercent: '0.02400' },
  { type: 'sec_cess', ratePercent: '0.07200' },
  { type: 'stl', ratePercent: '0.30000' },
];

// §3.2 — v1 rejects any single order whose gross consideration exceeds this,
// so the negotiable higher fee band above LKR 100 million is never applied.
export const MAX_GROSS_CONSIDERATION = money('100000000');

// §3.2: gross_consideration = R4(quantity × fill_price)
export function grossConsideration(quantity: number, price: Decimal): Decimal {
  return R4(price.times(quantity));
}

// §3.2: component_fee = R4(gross × rate / 100), then fee_total = R4(sum(...)).
// Each component is rounded *before* it is summed. Summing unrounded
// components and rounding once at the end gives a different total, and the
// per-component amounts are persisted to auth.fill_fees, so the stored rows
// would then not add up to the stored total.
export function computeFees(gross: Decimal): FeeBreakdown {
  const components = FEE_SCHEDULE.map(({ type, ratePercent }) => ({
    type,
    rate_percent: Number(ratePercent),
    amount: R4(gross.times(ratePercent).div(100)),
  }));

  const total = R4(
    components.reduce((sum, component) => sum.plus(component.amount), ZERO),
  );

  return { components, total };
}

// §3.2: buy_cash_debit = R4(gross + fee_total). This is also the buy lot's
// original cost (§3.3) — a filled buy's lot cost is the gross plus all fees.
export function buyCashDebit(gross: Decimal, feeTotal: Decimal): Decimal {
  return R4(gross.plus(feeTotal));
}

// §3.2: sell_cash_credit = R4(gross - fee_total)
export function sellCashCredit(gross: Decimal, feeTotal: Decimal): Decimal {
  return R4(gross.minus(feeTotal));
}

export function exceedsTransactionLimit(gross: Decimal): boolean {
  return gross.greaterThan(MAX_GROSS_CONSIDERATION);
}

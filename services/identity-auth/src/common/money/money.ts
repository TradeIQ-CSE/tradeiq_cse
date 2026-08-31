import Decimal from 'decimal.js';

// docs/api/paper-trading-v1.md §3.1 — "Application and database calculations
// use decimal arithmetic. JavaScript binary floating-point is not used for
// monetary calculations."
//
// "Positive half values round up; negative half values round away from zero"
// is exactly decimal.js ROUND_HALF_UP: nearest neighbour, ties away from zero.
// Cloning the constructor keeps this configuration local to money maths rather
// than mutating Decimal's global state for the whole process.
const Money = Decimal.clone({
  rounding: Decimal.ROUND_HALF_UP,
  // Division is the only operation that can expand without bound (the FIFO
  // proportional allocation in fifo.ts). 40 significant digits is far past the
  // 12 a numeric(18,4) can hold, so intermediate operands stay effectively
  // exact until the named result is rounded — §3.1 requires that
  // "multiplication and division use unrounded operands".
  precision: 40,
  // Never fall back to exponential notation: these values are formatted
  // straight into SQL parameters and JSON.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

export function money(value: Decimal.Value): Decimal {
  return new Money(value);
}

export const ZERO = money(0);

// §3.1: "Rounding occurs only at the named result in the formulas below."
// Prices and LKR amounts round to 4 places.
export function R4(value: Decimal.Value): Decimal {
  return new Money(value).toDecimalPlaces(4);
}

// Percentage returns round to 2 places for API output.
export function R2(value: Decimal.Value): Decimal {
  return new Money(value).toDecimalPlaces(2);
}

// Safe only for values whose scaled integer stays inside float64's exact
// range (2^53), i.e. magnitudes below ~9e11 at 4 decimal places. That covers
// every figure v1 can produce: starting capital and gross consideration are
// both capped at LKR 100,000,000 (create-portfolio.dto.ts,
// MAX_GROSS_CONSIDERATION), and equity and P/L are sums of those.
//
// It is NOT safe for the full numeric(18,4) domain, which reaches
// 99999999999999.9999 — 18 significant digits, past what float64 represents
// exactly. If a future aggregate can exceed ~9e11, serialise it as a string
// instead of widening this.
//
// Round before calling this, never after.
export function toJsonNumber(value: Decimal): number {
  return value.toNumber();
}

// pg binds numeric columns from a plain decimal string. Passing a JS number
// here would reintroduce the binary float this module exists to avoid.
export function toNumericString(value: Decimal): string {
  return value.toFixed(4);
}

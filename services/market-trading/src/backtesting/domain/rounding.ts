/**
 * Rounds a number to exactly 4 decimal places.
 * Used for all prices, cash flows, assets and fees calculations.
 */
export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

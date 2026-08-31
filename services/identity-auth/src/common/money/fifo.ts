import Decimal from 'decimal.js';
import { R4, ZERO } from './money';

export interface OpenLot {
  lotId: string;
  quantityOriginal: number;
  quantityRemaining: number;
  costOriginal: Decimal;
  costRemaining: Decimal;
}

export interface LotAllocation {
  lotId: string;
  quantity: number;
  allocatedCost: Decimal;
  // True when this allocation consumes the lot's last remaining share, which
  // is what entitles it to the exact-remainder rule below.
  closesLot: boolean;
}

// docs/api/paper-trading-v1.md §3.3 — consume open lots first-in-first-out.
//
// `lots` must already be ordered by acquired_date, then created_at, then
// lot_id. The caller does that in SQL so the same ordering drives the
// FOR UPDATE lock, and the lock order matches the consumption order.
//
// Throws if the lots cannot cover the quantity: the caller must have already
// checked available holdings to raise INSUFFICIENT_HOLDINGS as a persisted
// order rejection, so reaching here short is a programming error, not a
// domain outcome.
export function allocateFifo(
  lots: readonly OpenLot[],
  quantity: number,
): LotAllocation[] {
  const allocations: LotAllocation[] = [];
  let outstanding = quantity;

  for (const lot of lots) {
    if (outstanding === 0) break;
    if (lot.quantityRemaining === 0) continue;

    const take = Math.min(lot.quantityRemaining, outstanding);
    const closesLot = take === lot.quantityRemaining;

    // §3.3: "The final allocation that closes a lot receives its exact
    // remaining cost. This remainder rule prevents repeated rounding from
    // losing or creating cost basis."
    //
    // The proportional branch deliberately divides the lot's ORIGINAL cost by
    // its ORIGINAL quantity, not the remaining figures, so every partial sale
    // of the same lot is priced identically regardless of what came before.
    const allocatedCost = closesLot
      ? lot.costRemaining
      : R4(lot.costOriginal.times(take).div(lot.quantityOriginal));

    allocations.push({
      lotId: lot.lotId,
      quantity: take,
      allocatedCost,
      closesLot,
    });
    outstanding -= take;
  }

  if (outstanding > 0) {
    throw new Error(
      `FIFO allocation short by ${outstanding} of ${quantity}: holdings must be checked before allocating`,
    );
  }

  return allocations;
}

export function totalAllocatedCost(
  allocations: readonly LotAllocation[],
): Decimal {
  return allocations.reduce(
    (sum, allocation) => sum.plus(allocation.allocatedCost),
    ZERO,
  );
}

// §3.3: realized_pnl = R4(sell_net_proceeds - sum(allocated_cost)).
// Sell fees are already deducted from the net proceeds, and buy fees are
// already inside each lot's cost, so neither is applied twice here.
export function realizedPnl(
  sellNetProceeds: Decimal,
  allocations: readonly LotAllocation[],
): Decimal {
  return R4(sellNetProceeds.minus(totalAllocatedCost(allocations)));
}

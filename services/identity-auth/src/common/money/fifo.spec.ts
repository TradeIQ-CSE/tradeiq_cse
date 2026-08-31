import { OpenLot, allocateFifo, realizedPnl, totalAllocatedCost } from './fifo';
import { money } from './money';

function lot(
  lotId: string,
  quantityOriginal: number,
  costOriginal: string,
  quantityRemaining = quantityOriginal,
  costRemaining = costOriginal,
): OpenLot {
  return {
    lotId,
    quantityOriginal,
    quantityRemaining,
    costOriginal: money(costOriginal),
    costRemaining: money(costRemaining),
  };
}

describe('allocateFifo', () => {
  // docs/api/paper-trading-v1.md §8.2 — sell 400 from a 1,000 lot costing
  // 101,120.0000, then check the reported realized P/L.
  describe('worked example §8.2: partial sale of one lot', () => {
    const allocations = allocateFifo([lot('a', 1000, '101120.0000')], 400);

    it('allocates cost proportionally', () => {
      expect(allocations).toHaveLength(1);
      expect(allocations[0].quantity).toBe(400);
      expect(allocations[0].allocatedCost.toFixed(4)).toBe('40448.0000');
      expect(allocations[0].closesLot).toBe(false);
    });

    it('realizes 7,014.40 against 47,462.40 of net proceeds', () => {
      expect(realizedPnl(money('47462.4000'), allocations).toFixed(4)).toBe(
        '7014.4000',
      );
    });

    it('leaves 600 shares costing 60,672.00', () => {
      const remainingCost = money('101120.0000').minus(
        allocations[0].allocatedCost,
      );
      expect(remainingCost.toFixed(4)).toBe('60672.0000');
    });
  });

  // §8.3 — lot A (100 @ 50, cost 5,056.00) and lot B (150 @ 60, cost
  // 9,100.80); sell 180 consumes all of A and 80 of B.
  describe('worked example §8.3: sale spanning two lots', () => {
    const allocations = allocateFifo(
      [lot('a', 100, '5056.0000'), lot('b', 150, '9100.8000')],
      180,
    );

    it('consumes lot A entirely, then part of lot B', () => {
      expect(
        allocations.map((a) => [
          a.lotId,
          a.quantity,
          a.allocatedCost.toFixed(4),
          a.closesLot,
        ]),
      ).toEqual([
        ['a', 100, '5056.0000', true],
        ['b', 80, '4853.7600', false],
      ]);
    });

    it('totals 9,909.76 of allocated cost and realizes 2,549.12', () => {
      expect(totalAllocatedCost(allocations).toFixed(4)).toBe('9909.7600');
      expect(realizedPnl(money('12458.8800'), allocations).toFixed(4)).toBe(
        '2549.1200',
      );
    });

    it('leaves lot B with 70 shares costing 4,247.04', () => {
      const remaining = money('9100.8000').minus(allocations[1].allocatedCost);
      expect(remaining.toFixed(4)).toBe('4247.0400');
    });
  });

  describe('the exact-remainder rule (§3.3)', () => {
    // The rule exists so repeated rounding cannot lose or create cost basis.
    // A lot whose cost does not divide evenly is where that shows up.
    it('gives back exactly the original cost when a lot is fully consumed in pieces', () => {
      const original = money('1000.0000');
      let current = lot('a', 3, '1000.0000');
      const collected = [];

      for (let i = 0; i < 3; i += 1) {
        const [allocation] = allocateFifo([current], 1);
        collected.push(allocation.allocatedCost);
        current = {
          ...current,
          quantityRemaining: current.quantityRemaining - 1,
          costRemaining: current.costRemaining.minus(allocation.allocatedCost),
        };
      }

      // 1000/3 is 333.3333 twice, so the closing allocation must take 333.3334
      // rather than another proportional 333.3333.
      expect(collected.map((c) => c.toFixed(4))).toEqual([
        '333.3333',
        '333.3333',
        '333.3334',
      ]);
      expect(
        collected.reduce((sum, c) => sum.plus(c), money(0)).toFixed(4),
      ).toBe(original.toFixed(4));
      expect(current.costRemaining.toFixed(4)).toBe('0.0000');
    });

    it('prices each partial sale off the original quantity, not the remaining one', () => {
      // §3.3 divides ORIGINAL cost by ORIGINAL quantity. Dividing the
      // remaining figures instead usually agrees, so the fixture has to be one
      // where rounding has already left the lot slightly out of proportion:
      // a 3-share lot costing 1,000.00 with one share sold is carrying
      // 666.6667 against 2 shares.
      //
      //   original  : R4(1000.0000 x 1 / 3) = 333.3333
      //   remaining : R4( 666.6667 x 1 / 2) = 333.3334
      const outOfProportion = lot('a', 3, '1000.0000', 2, '666.6667');
      const [allocation] = allocateFifo([outOfProportion], 1);

      expect(allocation.allocatedCost.toFixed(4)).toBe('333.3333');
      expect(allocation.closesLot).toBe(false);
    });

    it('keeps repeat sales of the same size identically priced', () => {
      // A second sale of 400 from a part-consumed 1,000-share lot allocates
      // the same 40,448.00 as the first. Both formulas agree here, so this
      // documents the behaviour rather than discriminating between them.
      const partlyUsed = lot('a', 1000, '101120.0000', 600, '60672.0000');
      const [allocation] = allocateFifo([partlyUsed], 400);

      expect(allocation.allocatedCost.toFixed(4)).toBe('40448.0000');
    });
  });

  describe('ordering and edges', () => {
    it('consumes lots in the order given', () => {
      const allocations = allocateFifo(
        [lot('first', 10, '100'), lot('second', 10, '200')],
        15,
      );

      expect(allocations.map((a) => a.lotId)).toEqual(['first', 'second']);
    });

    it('skips lots that are already exhausted', () => {
      const allocations = allocateFifo(
        [lot('spent', 10, '100', 0, '0'), lot('open', 10, '200')],
        5,
      );

      expect(allocations.map((a) => a.lotId)).toEqual(['open']);
    });

    it('stops once the quantity is satisfied', () => {
      const allocations = allocateFifo(
        [lot('a', 10, '100'), lot('b', 10, '200')],
        10,
      );

      expect(allocations).toHaveLength(1);
      expect(allocations[0].closesLot).toBe(true);
    });

    // The caller raises INSUFFICIENT_HOLDINGS before allocating, so arriving
    // here short means the check was skipped.
    it('throws when the lots cannot cover the quantity', () => {
      expect(() => allocateFifo([lot('a', 50, '500')], 75)).toThrow(
        /short by 25 of 75/,
      );
    });
  });
});

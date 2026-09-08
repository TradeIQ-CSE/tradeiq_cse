import {
  FEE_SCHEDULE,
  buyCashDebit,
  computeFees,
  exceedsTransactionLimit,
  grossConsideration,
  sellCashCredit,
} from './fees';
import { money } from './money';

const amounts = (gross: string) =>
  computeFees(money(gross)).components.map((c) => [
    c.type,
    c.amount.toFixed(4),
  ]);

describe('fees', () => {
  // docs/api/paper-trading-v1.md §3.2
  it('pins the CSE equity schedule to 1.12000% in total', () => {
    expect(FEE_SCHEDULE.map((f) => [f.type, f.ratePercent])).toEqual([
      ['brokerage', '0.64000'],
      ['cse', '0.08400'],
      ['cds', '0.02400'],
      ['sec_cess', '0.07200'],
      ['stl', '0.30000'],
    ]);

    const total = FEE_SCHEDULE.reduce(
      (sum, f) => sum.plus(f.ratePercent),
      money(0),
    );
    expect(total.toFixed(5)).toBe('1.12000');
  });

  // §8.1 — buy 1,000 @ 100
  describe('worked example §8.1: buy 1,000 @ 100', () => {
    const gross = grossConsideration(1000, money('100'));
    const fees = computeFees(gross);

    it('produces the contract gross, components and total', () => {
      expect(gross.toFixed(4)).toBe('100000.0000');
      expect(amounts('100000')).toEqual([
        ['brokerage', '640.0000'],
        ['cse', '84.0000'],
        ['cds', '24.0000'],
        ['sec_cess', '72.0000'],
        ['stl', '300.0000'],
      ]);
      expect(fees.total.toFixed(4)).toBe('1120.0000');
    });

    it('debits 101,120 in cash, which is also the lot cost', () => {
      expect(buyCashDebit(gross, fees.total).toFixed(4)).toBe('101120.0000');
    });
  });

  // §8.2 — sell 400 @ 120
  it('worked example §8.2: sell 400 @ 120 credits 47,462.40', () => {
    const gross = grossConsideration(400, money('120'));
    const fees = computeFees(gross);

    expect(gross.toFixed(4)).toBe('48000.0000');
    expect(fees.total.toFixed(4)).toBe('537.6000');
    expect(sellCashCredit(gross, fees.total).toFixed(4)).toBe('47462.4000');
  });

  // §8.3 — the three fills in the multi-lot example
  it.each([
    [100, '50', '5000.0000', '56.0000', '5056.0000'],
    [150, '60', '9000.0000', '100.8000', '9100.8000'],
  ])(
    'worked example §8.3: buy %i @ %s costs the lot %s',
    (quantity, price, expectedGross, expectedFees, expectedCost) => {
      const gross = grossConsideration(quantity, money(price));
      const fees = computeFees(gross);

      expect(gross.toFixed(4)).toBe(expectedGross);
      expect(fees.total.toFixed(4)).toBe(expectedFees);
      expect(buyCashDebit(gross, fees.total).toFixed(4)).toBe(expectedCost);
    },
  );

  it('worked example §8.3: sell 180 @ 70 nets 12,458.88', () => {
    const gross = grossConsideration(180, money('70'));
    const fees = computeFees(gross);

    expect(gross.toFixed(4)).toBe('12600.0000');
    expect(fees.total.toFixed(4)).toBe('141.1200');
    expect(sellCashCredit(gross, fees.total).toFixed(4)).toBe('12458.8800');
  });

  // §3.2: "Each component is rounded before it is summed."
  //
  // 100 shares at 10.01 is an ordinary trade where the two orderings actually
  // disagree: rounding each component first totals 11.2111, rounding the
  // unrounded sum gives 11.2112. Picking a case that diverges is the point —
  // most round numbers give the same answer either way and would let a wrong
  // implementation pass.
  it('rounds each component before summing, not the sum of raw components', () => {
    const gross = grossConsideration(100, money('10.01'));
    const fees = computeFees(gross);

    expect(gross.toFixed(4)).toBe('1001.0000');
    expect(fees.components.map((c) => c.amount.toFixed(4))).toEqual([
      '6.4064',
      '0.8408',
      '0.2402',
      '0.7207',
      '3.0030',
    ]);
    expect(fees.total.toFixed(4)).toBe('11.2111');

    const summedThenRounded = FEE_SCHEDULE.reduce(
      (sum, f) => sum.plus(gross.times(f.ratePercent).div(100)),
      money(0),
    ).toDecimalPlaces(4);
    expect(summedThenRounded.toFixed(4)).toBe('11.2112');

    // The persisted fill_fees rows must add up to the persisted fee_total, so
    // the component-first ordering is the one that has to win.
    const componentSum = fees.components.reduce(
      (sum, c) => sum.plus(c.amount),
      money(0),
    );
    expect(componentSum.toFixed(4)).toBe(fees.total.toFixed(4));
  });

  it('reports rate_percent in the trimmed form the API returns', () => {
    // §6.1 shows 0.64, 0.084, 0.024, 0.072, 0.3 — not the stored 5dp strings.
    expect(
      computeFees(money('100000')).components.map((c) => c.rate_percent),
    ).toEqual([0.64, 0.084, 0.024, 0.072, 0.3]);
  });

  describe('transaction limit', () => {
    it('allows exactly LKR 100 million', () => {
      expect(exceedsTransactionLimit(money('100000000'))).toBe(false);
    });

    it('rejects anything above it', () => {
      expect(exceedsTransactionLimit(money('100000000.0001'))).toBe(true);
    });
  });
});

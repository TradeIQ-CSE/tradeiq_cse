import { R2, R4, money, toJsonNumber, toNumericString } from './money';

describe('money', () => {
  // docs/api/paper-trading-v1.md §3.1 — "Positive half values round up;
  // negative half values round away from zero."
  describe('rounding half away from zero', () => {
    it.each([
      ['0.00005', '0.0001'],
      ['0.00015', '0.0002'],
      ['1.00005', '1.0001'],
      ['-0.00005', '-0.0001'],
      ['-0.00015', '-0.0002'],
      ['-1.00005', '-1.0001'],
    ])('R4(%s) = %s', (input, expected) => {
      expect(R4(input).toFixed(4)).toBe(money(expected).toFixed(4));
    });

    // Banker's rounding would give 0.0002 for both of these, tying to even.
    // The contract does not use banker's rounding.
    it('does not round ties to even', () => {
      expect(R4('0.00015').toFixed(4)).toBe('0.0002');
      expect(R4('0.00025').toFixed(4)).toBe('0.0003');
    });

    it('rounds percentages to two places', () => {
      expect(R2('1.325').toFixed(2)).toBe('1.33');
      expect(R2('-1.325').toFixed(2)).toBe('-1.33');
    });
  });

  // §3.1 — "JavaScript binary floating-point is not used for monetary
  // calculations." These are the classic cases where it visibly fails.
  describe('decimal arithmetic', () => {
    it('adds without binary floating-point error', () => {
      expect(money('0.1').plus('0.2').toFixed(4)).toBe('0.3000');
      // For contrast: 0.1 + 0.2 === 0.30000000000000004 in float64.
      expect(0.1 + 0.2).not.toBe(0.3);
    });

    it('multiplies a large quantity by a fractional price exactly', () => {
      // 1000 x 142.72 is 142719.99999999997 in float64.
      expect(money('142.72').times(1000).toFixed(4)).toBe('142720.0000');
    });
  });

  describe('boundary conversions', () => {
    it('formats numeric column values to four places', () => {
      expect(toNumericString(money('100000'))).toBe('100000.0000');
      expect(toNumericString(money('7014.4'))).toBe('7014.4000');
    });

    it('never uses exponential notation', () => {
      // Exponential output would be rejected by pg as a numeric literal and
      // would serialise oddly into JSON.
      expect(toNumericString(money('0.0001'))).toBe('0.0001');
      expect(money('100000000').toString()).toBe('100000000');
    });

    it('round-trips a rounded value through JSON exactly', () => {
      // Lossless for the magnitudes v1 produces (capped at LKR 100,000,000),
      // not for the whole numeric(18,4) domain — see toJsonNumber.
      for (const value of ['142.72', '101120', '99999999.9999', '7014.4']) {
        const asNumber = toJsonNumber(R4(value));
        expect(money(JSON.parse(JSON.stringify(asNumber))).toFixed(4)).toBe(
          money(value).toFixed(4),
        );
      }
    });
  });
});

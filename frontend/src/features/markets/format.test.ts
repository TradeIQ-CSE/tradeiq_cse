import { describe, expect, it } from 'vitest';
import { formatSigned, marketCapBand } from './format';

// A fixed locale throughout: these helpers are locale-parameterised, and a
// locale-dependent assertion (e.g. relying on the machine's default locale)
// would break on another machine or CI image.
const LOCALE = 'en-US';

describe('marketCapBand', () => {
  // sharesOutstanding is held at 1 so `cap` equals `price` exactly, making
  // the threshold boundaries easy to hit precisely.
  it('is "large" at exactly the 20B threshold', () => {
    expect(marketCapBand(1, 20_000_000_000)).toBe('large');
  });

  it('is "mid" just below the 20B threshold', () => {
    expect(marketCapBand(1, 19_999_999_999)).toBe('mid');
  });

  it('is "mid" at exactly the 5B threshold', () => {
    expect(marketCapBand(1, 5_000_000_000)).toBe('mid');
  });

  it('is "small" just below the 5B threshold', () => {
    expect(marketCapBand(1, 4_999_999_999)).toBe('small');
  });

  it('is null when sharesOutstanding is null', () => {
    expect(marketCapBand(null, 100)).toBeNull();
  });

  it('is null when price is null', () => {
    expect(marketCapBand(1_000_000, null)).toBeNull();
  });
});

describe('formatSigned', () => {
  it('renders a gain with an explicit plus sign', () => {
    expect(formatSigned(1.223, 2, LOCALE)).toBe('+1.22');
  });

  it('renders a loss with a minus sign', () => {
    expect(formatSigned(-1.223, 2, LOCALE)).toBe('-1.22');
  });

  it('renders zero without a sign', () => {
    expect(formatSigned(0, 2, LOCALE)).toBe('0.00');
  });
});

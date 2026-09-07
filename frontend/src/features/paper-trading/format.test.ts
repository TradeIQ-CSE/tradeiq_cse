import { describe, expect, it } from 'vitest';
import { changeDirection, formatMoney, formatPercent, formatQuantity, formatSignedMoney } from './format';

// A fixed locale throughout: these helpers are locale-parameterised, and a
// locale-dependent assertion (e.g. relying on the machine's default locale)
// would break on another machine or CI image.
const LOCALE = 'en-US';

describe('formatMoney', () => {
  it('formats with an LKR prefix and 2 decimal places', () => {
    expect(formatMoney(1000000, LOCALE)).toBe('LKR 1,000,000.00');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatMoney(898880.4321, LOCALE)).toBe('LKR 898,880.43');
  });

  it('renders zero without a sign', () => {
    expect(formatMoney(0, LOCALE)).toBe('LKR 0.00');
  });
});

describe('formatSignedMoney', () => {
  it('renders a gain with an explicit plus sign', () => {
    expect(formatSignedMoney(11328, LOCALE)).toBe('LKR +11,328.00');
  });

  it('renders a loss with a minus sign', () => {
    expect(formatSignedMoney(-101120, LOCALE)).toBe('LKR -101,120.00');
  });

  it('renders zero without a sign', () => {
    expect(formatSignedMoney(0, LOCALE)).toBe('LKR 0.00');
  });
});

describe('formatPercent', () => {
  it('renders a gain with an explicit plus sign and % suffix', () => {
    expect(formatPercent(18.67, LOCALE)).toBe('+18.67%');
  });

  it('renders a loss with a minus sign', () => {
    expect(formatPercent(-1.83, LOCALE)).toBe('-1.83%');
  });

  it('renders zero without a sign', () => {
    expect(formatPercent(0, LOCALE)).toBe('0.00%');
  });
});

describe('formatQuantity', () => {
  it('groups thousands', () => {
    expect(formatQuantity(1000, LOCALE)).toBe('1,000');
  });

  it('renders zero', () => {
    expect(formatQuantity(0, LOCALE)).toBe('0');
  });
});

describe('changeDirection', () => {
  it('is "up" for a positive value', () => {
    expect(changeDirection(11328)).toBe('up');
  });

  it('is "down" for a negative value', () => {
    expect(changeDirection(-7014.4)).toBe('down');
  });

  it('is "flat" for exactly zero', () => {
    expect(changeDirection(0)).toBe('flat');
  });
});

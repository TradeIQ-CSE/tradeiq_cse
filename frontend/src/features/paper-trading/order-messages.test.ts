import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { mapOrderCode } from './order-messages';

const t = i18n.t.bind(i18n);

// The estimate path (§6.1, a 4xx/422 ApiError) and the submit path (§6.2, a
// 201 rejected order) can both surface the same domain code. This is the one
// place either is allowed to word it, so every documented code must map to a
// real, distinct translation key, and an unrecognised code must not throw.
describe('mapOrderCode', () => {
  const documentedCodes: [string, string][] = [
    ['INSUFFICIENT_CASH', 'orders.codes.insufficientCash'],
    ['INSUFFICIENT_HOLDINGS', 'orders.codes.insufficientHoldings'],
    ['TRANSACTION_LIMIT_EXCEEDED', 'orders.codes.transactionLimitExceeded'],
    ['SECURITY_NOT_FOUND', 'orders.codes.securityNotFound'],
    ['SECURITY_NOT_TRADABLE', 'orders.codes.securityNotTradable'],
    ['PRICE_UNAVAILABLE', 'orders.codes.priceUnavailable'],
    ['STALE_PRICE', 'orders.codes.stalePrice'],
    ['VALIDATION_FAILED', 'orders.codes.validationFailed'],
    ['PORTFOLIO_NOT_FOUND', 'orders.codes.portfolioNotFound'],
    ['ORDER_NOT_FOUND', 'orders.codes.orderNotFound'],
    ['IDEMPOTENCY_KEY_REUSED', 'orders.codes.idempotencyKeyReused'],
    ['DEPENDENCY_UNAVAILABLE', 'orders.codes.dependencyUnavailable'],
    ['INTERNAL', 'orders.codes.internal'],
  ];

  it.each(documentedCodes)('maps %s to %s', (code, key) => {
    expect(mapOrderCode(code)).toBe(key);
  });

  it('falls back to a generic key for a code it does not recognise', () => {
    expect(mapOrderCode('SOME_FUTURE_CODE')).toBe('orders.codes.unknown');
  });

  it('resolves every mapped key to real, non-empty copy', () => {
    for (const [code] of documentedCodes) {
      const text = t(mapOrderCode(code));
      expect(text).not.toBe(mapOrderCode(code)); // i18next echoes the key back when it's missing
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

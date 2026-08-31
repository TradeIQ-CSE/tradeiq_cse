import { HttpStatus } from '@nestjs/common';
import { OrderRejectedException, OrderRejectionCode } from './api-exception';

describe('OrderRejectedException', () => {
  // docs/api/paper-trading-v1.md §9.1 — how the estimate endpoint renders each
  // rejection. Submission never throws these; it persists them on a 201 order
  // (§6.2). The status split is contractual, so it is asserted rather than
  // assumed.
  it.each([
    ['SECURITY_NOT_FOUND', HttpStatus.NOT_FOUND],
    ['INSUFFICIENT_CASH', HttpStatus.UNPROCESSABLE_ENTITY],
    ['INSUFFICIENT_HOLDINGS', HttpStatus.UNPROCESSABLE_ENTITY],
    ['TRANSACTION_LIMIT_EXCEEDED', HttpStatus.UNPROCESSABLE_ENTITY],
    ['SECURITY_NOT_TRADABLE', HttpStatus.UNPROCESSABLE_ENTITY],
    ['PRICE_UNAVAILABLE', HttpStatus.UNPROCESSABLE_ENTITY],
    ['STALE_PRICE', HttpStatus.UNPROCESSABLE_ENTITY],
  ] as [OrderRejectionCode, HttpStatus][])(
    '%s maps to HTTP %i',
    (code, status) => {
      const exception = new OrderRejectedException(code);

      expect(exception.getStatus()).toBe(status);
      expect(exception.code).toBe(code);
    },
  );

  it('carries a message for every rejection code', () => {
    const codes: OrderRejectionCode[] = [
      'INSUFFICIENT_CASH',
      'INSUFFICIENT_HOLDINGS',
      'TRANSACTION_LIMIT_EXCEEDED',
      'SECURITY_NOT_FOUND',
      'SECURITY_NOT_TRADABLE',
      'PRICE_UNAVAILABLE',
      'STALE_PRICE',
    ];

    for (const code of codes) {
      const message = new OrderRejectedException(code).message;
      expect(message).toEqual(expect.any(String));
      expect(message.length).toBeGreaterThan(0);
      // error-envelope.md §3 — no internals in a client-visible message.
      expect(message).not.toMatch(/auth\.|select |uuid|migration/i);
    }
  });
});

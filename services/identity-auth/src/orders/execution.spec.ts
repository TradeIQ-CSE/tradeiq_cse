import {
  ExecutionQuote,
  QuoteResult,
} from '../market-trading/market-trading.client';
import { money } from '../common/money/money';
import { ExecutionInputs, priceOrder } from './execution';

const LISTED: ExecutionQuote = {
  symbol: 'COMB.N0000',
  listing_status: 'listed',
  market_as_of: '2025-01-10',
  price_as_of: '2025-01-10',
  close: 100,
  settlement_date: '2025-01-14',
};

const found = (over: Partial<ExecutionQuote> = {}): QuoteResult => ({
  found: true,
  quote: { ...LISTED, ...over },
});

function inputs(over: Partial<ExecutionInputs> = {}): ExecutionInputs {
  return {
    side: 'buy',
    quantity: 1000,
    quote: found(),
    cashBalance: money('1000000'),
    openQuantity: 0,
    ...over,
  };
}

// Narrows the union so the tests read cleanly.
function priced(over: Partial<ExecutionInputs> = {}) {
  const outcome = priceOrder(inputs(over));
  if (outcome.rejected)
    throw new Error(`unexpectedly rejected: ${outcome.code}`);
  return outcome.priced;
}

function rejection(over: Partial<ExecutionInputs> = {}) {
  const outcome = priceOrder(inputs(over));
  if (!outcome.rejected) throw new Error('unexpectedly filled');
  return outcome.code;
}

describe('priceOrder', () => {
  // docs/api/paper-trading-v1.md §8.1 — buy 1,000 @ 100
  it('prices the §8.1 buy: debit 101,120 against a 100,000 gross', () => {
    const p = priced();

    expect(p.gross.toFixed(4)).toBe('100000.0000');
    expect(p.fees.total.toFixed(4)).toBe('1120.0000');
    expect(p.cashEffect.toFixed(4)).toBe('-101120.0000');
    expect(p.price.toFixed(4)).toBe('100.0000');
  });

  // §8.2 — sell 400 @ 120 credits 47,462.40
  it('prices the §8.2 sell: credit 47,462.40', () => {
    const p = priced({
      side: 'sell',
      quantity: 400,
      quote: found({ close: 120 }),
      openQuantity: 1000,
    });

    expect(p.gross.toFixed(4)).toBe('48000.0000');
    expect(p.fees.total.toFixed(4)).toBe('537.6000');
    expect(p.cashEffect.toFixed(4)).toBe('47462.4000');
  });

  // §2.2 — the fill date is the market session, not today.
  it('fills at the market session and its settlement date', () => {
    const p = priced();

    expect(p.fillDate).toBe('2025-01-10');
    expect(p.settlementDate).toBe('2025-01-14');
  });

  describe('rejections', () => {
    // §8.4 — 10,000 cash cannot cover a 10,112 debit for 100 @ 100.
    it('rejects a buy whose fees push it past the cash balance', () => {
      // The gross alone (10,000) fits exactly; only the 112 of fees breaks it,
      // so this fails iff fees are included in the affordability check.
      expect(rejection({ quantity: 100, cashBalance: money('10000') })).toBe(
        'INSUFFICIENT_CASH',
      );
    });

    it('allows a buy that exactly exhausts the cash balance', () => {
      const p = priced({ quantity: 100, cashBalance: money('10112') });
      expect(p.cashEffect.toFixed(4)).toBe('-10112.0000');
    });

    // §8.6 — owns 50, sells 75.
    it('rejects a sell beyond the open quantity', () => {
      expect(rejection({ side: 'sell', quantity: 75, openQuantity: 50 })).toBe(
        'INSUFFICIENT_HOLDINGS',
      );
    });

    it('allows a sell of exactly the open quantity', () => {
      const p = priced({ side: 'sell', quantity: 50, openQuantity: 50 });
      expect(p.cashEffect.isPositive()).toBe(true);
    });

    it('rejects an unknown symbol', () => {
      expect(rejection({ quote: { found: false } })).toBe('SECURITY_NOT_FOUND');
    });

    it.each(['suspended', 'delisted'] as const)(
      'rejects a %s security',
      (status) => {
        expect(rejection({ quote: found({ listing_status: status }) })).toBe(
          'SECURITY_NOT_TRADABLE',
        );
      },
    );

    // §8.5 — a null close.
    it('rejects a missing close', () => {
      expect(
        rejection({
          quote: found({
            close: null,
            price_as_of: null,
            settlement_date: null,
          }),
        }),
      ).toBe('PRICE_UNAVAILABLE');
    });

    // §2.2 — "a missing or zero close".
    it('rejects a zero close', () => {
      expect(rejection({ quote: found({ close: 0 }) })).toBe(
        'PRICE_UNAVAILABLE',
      );
    });

    // Nothing upstream forbids a negative close, and pricing one would credit
    // cash on a buy.
    it('rejects a negative close', () => {
      expect(rejection({ quote: found({ close: -5 }) })).toBe(
        'PRICE_UNAVAILABLE',
      );
    });

    it('rejects when the price database is empty', () => {
      expect(
        rejection({
          quote: found({
            market_as_of: null,
            price_as_of: null,
            close: null,
            settlement_date: null,
          }),
        }),
      ).toBe('PRICE_UNAVAILABLE');
    });

    // §2.2 — price_as_of must equal market_as_of.
    it('rejects a price older than the market session', () => {
      expect(rejection({ quote: found({ price_as_of: '2025-01-09' }) })).toBe(
        'STALE_PRICE',
      );
    });

    it('rejects a gross above the LKR 100 million band', () => {
      // 1,000,001 x 100 = 100,000,100
      expect(
        rejection({ quantity: 1000001, cashBalance: money('999999999999') }),
      ).toBe('TRANSACTION_LIMIT_EXCEEDED');
    });

    it('allows a gross of exactly LKR 100 million', () => {
      const p = priced({
        quantity: 1000000,
        cashBalance: money('999999999999'),
      });
      expect(p.gross.toFixed(4)).toBe('100000000.0000');
    });
  });

  // The order of checks is contractual, not incidental: a delisted security
  // with no price must report SECURITY_NOT_TRADABLE, and an unaffordable order
  // for a stale security must report STALE_PRICE. Reordering the checks
  // silently changes which code a user sees.
  describe('precedence between simultaneous failures', () => {
    it('reports not-tradable ahead of an unusable price', () => {
      expect(
        rejection({
          quote: found({ listing_status: 'delisted', close: null }),
        }),
      ).toBe('SECURITY_NOT_TRADABLE');
    });

    it('reports an unusable price ahead of staleness', () => {
      expect(
        rejection({ quote: found({ close: 0, price_as_of: '2025-01-09' }) }),
      ).toBe('PRICE_UNAVAILABLE');
    });

    it('reports staleness ahead of insufficient cash', () => {
      expect(
        rejection({
          quote: found({ price_as_of: '2025-01-09' }),
          cashBalance: money('0'),
        }),
      ).toBe('STALE_PRICE');
    });

    it('reports the transaction limit ahead of insufficient cash', () => {
      expect(rejection({ quantity: 1000001, cashBalance: money('0') })).toBe(
        'TRANSACTION_LIMIT_EXCEEDED',
      );
    });
  });
});

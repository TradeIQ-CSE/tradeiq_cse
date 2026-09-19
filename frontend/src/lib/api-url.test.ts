import { describe, expect, it } from 'vitest';
import { apiUrl } from './api-url';

describe('apiUrl', () => {
  it('keeps a base path, which new URL() would discard', () => {
    // The regression this exists for: `new URL('/securities', base)` returns
    // https://tradeiqcse.tech/securities, so the deployed app asked the
    // frontend for its market data and tried to parse index.html as JSON.
    expect(
      apiUrl('https://tradeiqcse.tech/api/market', '/securities').href,
    ).toBe('https://tradeiqcse.tech/api/market/securities');
  });

  it('still works for a bare origin, which is what local development uses', () => {
    expect(apiUrl('http://localhost:3001', '/securities').href).toBe(
      'http://localhost:3001/securities',
    );
  });

  it('does not double the slash when both sides carry one', () => {
    expect(apiUrl('https://tradeiqcse.tech/api/market/', '/indices').href).toBe(
      'https://tradeiqcse.tech/api/market/indices',
    );
  });

  it('joins when neither side carries one', () => {
    expect(apiUrl('https://tradeiqcse.tech/api/market', 'indices').href).toBe(
      'https://tradeiqcse.tech/api/market/indices',
    );
  });

  it('keeps a nested path intact', () => {
    expect(
      apiUrl('https://tradeiqcse.tech/api/market', '/securities/JKH.N0000/ohlcv')
        .href,
    ).toBe('https://tradeiqcse.tech/api/market/securities/JKH.N0000/ohlcv');
  });
});

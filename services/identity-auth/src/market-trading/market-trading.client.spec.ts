import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DependencyUnavailableException } from '../common/errors/api-exception';
import { ExecutionQuote, MarketTradingClient } from './market-trading.client';

const QUOTE: ExecutionQuote = {
  symbol: 'COMB.N0000',
  listing_status: 'listed',
  market_as_of: '2025-01-10',
  price_as_of: '2025-01-10',
  close: 142.72,
  settlement_date: '2025-01-14',
};

function configWith(baseUrl = 'http://market-trading:3001', timeoutMs = 3000) {
  return {
    getOrThrow: (key: string) =>
      key === 'marketTrading.baseUrl' ? baseUrl : timeoutMs,
  } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe('MarketTradingClient', () => {
  let fetchMock: jest.Mock;
  let client: MarketTradingClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // The client logs every dependency failure; keep the suite output clean.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    client = new MarketTradingClient(configWith());
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the quote on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await expect(client.getQuote('COMB.N0000')).resolves.toEqual({
      found: true,
      quote: QUOTE,
    });
  });

  it('calls the contract path with the symbol percent-encoded', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await client.getQuote('COMB.N0000');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://market-trading:3001/internal/paper-trading/quotes/COMB.N0000',
    );
  });

  it('does not double up the slash when the base URL has a trailing one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));
    client = new MarketTradingClient(configWith('http://market-trading:3001/'));

    await client.getQuote('COMB.N0000');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://market-trading:3001/internal/paper-trading/quotes/COMB.N0000',
    );
  });

  // §6.2 — an unknown symbol is an auditable rejected order, not an error, so
  // the client reports it as a result the caller can persist.
  it('reports a SECURITY_NOT_FOUND 404 as not found rather than throwing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, {
        error: { code: 'SECURITY_NOT_FOUND', message: 'Security not found.' },
      }),
    );

    await expect(client.getQuote('NOPE.X0000')).resolves.toEqual({
      found: false,
    });
  });

  // A bare 404 means the URL is wrong, not that the symbol is unknown.
  // Persisting it as a rejection would hide a configuration fault behind an
  // auditable but incorrect order.
  it.each([
    ['an empty envelope', { error: {} }],
    ['a different code', { error: { code: 'NOT_FOUND' } }],
    ['no envelope at all', { message: 'Cannot GET /wrong/path' }],
  ])('throws on a 404 with %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(404, body));

    await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
      DependencyUnavailableException,
    );
  });

  it('throws on a 404 whose body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      status: 404,
      ok: false,
      json: async () => {
        throw new Error('Unexpected token');
      },
    } as unknown as Response);

    await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
      DependencyUnavailableException,
    );
  });

  // §4 — transient dependency failures are not stored, so the caller's
  // idempotency key stays reusable. Each of these must surface as 503.
  describe('dependency failures', () => {
    it('throws when the request rejects (timeout, refused, DNS)', async () => {
      fetchMock.mockRejectedValue(new Error('The operation was aborted'));

      await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it.each([500, 502, 503, 400])('throws on HTTP %i', async (status) => {
      fetchMock.mockResolvedValue(jsonResponse(status, {}));

      await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('throws when the body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => {
          throw new Error('Unexpected token');
        },
      } as unknown as Response);

      await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    // A malformed payload must not be mistaken for a domain rejection: pricing
    // an order on a garbage quote would persist a wrong fill.
    it.each([
      ['no data envelope', { symbol: 'COMB.N0000' }],
      ['null data', { data: null }],
      ['close as a string', { data: { ...QUOTE, close: '142.72' } }],
      [
        'unknown listing_status',
        { data: { ...QUOTE, listing_status: 'halted' } },
      ],
      ['missing symbol', { data: { ...QUOTE, symbol: undefined } }],
    ])('throws when the payload has %s', async (_label, body) => {
      fetchMock.mockResolvedValue(jsonResponse(200, body));

      await expect(client.getQuote('COMB.N0000')).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });
  });

  // §2.3 returns nulls for a known security with no usable price; that is a
  // valid quote, not a malformed one.
  it('accepts a quote with null price fields', async () => {
    const unpriced: ExecutionQuote = {
      ...QUOTE,
      price_as_of: null,
      close: null,
      settlement_date: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: unpriced }));

    await expect(client.getQuote('COMB.N0000')).resolves.toEqual({
      found: true,
      quote: unpriced,
    });
  });

  it('passes an abort signal so a stalled dependency cannot hang the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await client.getQuote('COMB.N0000');

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

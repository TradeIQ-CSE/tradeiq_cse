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

  it('accepts a canonical symbol that differs only in case from the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await expect(client.getQuote('comb.n0000')).resolves.toEqual({
      found: true,
      quote: QUOTE,
    });
  });

  // Pricing an order against another security would move cash and lots with
  // nothing to flag it afterwards, so this must fail loudly.
  it('throws when the quote is for a different symbol than requested', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await expect(client.getQuote('HNB.N0000')).rejects.toBeInstanceOf(
      DependencyUnavailableException,
    );
  });

  it('passes an abort signal so a stalled dependency cannot hang the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: QUOTE }));

    await client.getQuote('COMB.N0000');

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  // docs/api/paper-trading-v1.md §2.4.
  describe('getValuations', () => {
    const PRICES = {
      as_of: '2025-01-10',
      prices: [
        { symbol: 'COMB.N0000', close: 120 },
        { symbol: 'JKH.N0000', close: null },
      ],
    };

    it('returns the valuations on 200', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: PRICES }));

      await expect(
        client.getValuations(['COMB.N0000', 'JKH.N0000']),
      ).resolves.toEqual(PRICES);
    });

    it('sends the symbols and as_of as query params', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: PRICES }));

      await client.getValuations(['COMB.N0000', 'JKH.N0000'], '2025-01-12');

      const url = fetchMock.mock.calls[0][0] as URL;
      expect(url.pathname).toBe('/internal/paper-trading/valuations');
      expect(url.searchParams.get('symbols')).toBe('COMB.N0000,JKH.N0000');
      expect(url.searchParams.get('as_of')).toBe('2025-01-12');
    });

    it('omits both params when nothing is held and no date was asked for', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { data: { as_of: '2025-01-10', prices: [] } }),
      );

      await client.getValuations([]);

      const url = fetchMock.mock.calls[0][0] as URL;
      expect(url.searchParams.has('symbols')).toBe(false);
      expect(url.searchParams.has('as_of')).toBe(false);
    });

    // An out-of-range as_of is the user's mistake, not a broken dependency, so
    // it must reach them as a 400 naming the field rather than a 503 they would
    // retry forever.
    it('translates a VALIDATION_FAILED envelope into a 400 with its fields', async () => {
      const fields = [
        {
          field: 'as_of',
          reason: 'must fall between 2017-01-02 and 2025-01-10',
        },
      ];
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: { code: 'VALIDATION_FAILED', message: '…', fields },
        }),
      );

      await expect(
        client.getValuations(['COMB.N0000'], '2030-01-01'),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields });
    });

    // §2.4 caps symbols at 200. A portfolio past that is our problem, not the
    // user's: `symbols` is not a §7 parameter, so telling them to fix it would
    // name a field they never sent and cannot change.
    it('does not forward a validation failure about a field the user never sent', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            fields: [{ field: 'symbols', reason: 'must contain at most 200' }],
          },
        }),
      );

      await expect(client.getValuations(['COMB.N0000'])).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('does not forward a VALIDATION_FAILED envelope carrying no fields', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { code: 'VALIDATION_FAILED' } }),
      );

      await expect(
        client.getValuations(['COMB.N0000'], '2030-01-01'),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
    });

    // A bare 400 from a misrouted proxy is not the user's fault; blaming their
    // input would hide a configuration fault.
    it('treats a 400 without a VALIDATION_FAILED envelope as a dependency failure', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { code: 'NOPE' } }),
      );

      await expect(client.getValuations(['COMB.N0000'])).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it.each([
      ['a non-2xx status', jsonResponse(500, {})],
      ['a payload that is not §2.4', jsonResponse(200, { data: { as_of: 1 } })],
      [
        'a price entry with a non-numeric close',
        jsonResponse(200, {
          data: {
            as_of: '2025-01-10',
            prices: [{ symbol: 'X', close: '120' }],
          },
        }),
      ],
    ])('reports %s as a dependency failure', async (_label, response) => {
      fetchMock.mockResolvedValue(response);

      await expect(client.getValuations(['X'])).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('reports a timeout as a dependency failure', async () => {
      fetchMock.mockRejectedValue(new Error('The operation timed out.'));

      await expect(client.getValuations(['COMB.N0000'])).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    // Valuing a portfolio on another security's closes would be silent and
    // wrong, so a mismatched symbol set is a broken dependency, not data.
    it.each([
      ['a symbol that was never requested', ['COMB.N0000', 'HNB.N0000']],
      ['a missing symbol', ['COMB.N0000']],
    ])('rejects a response carrying %s', async (_label, symbols) => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: {
            as_of: '2025-01-10',
            prices: symbols.map((symbol) => ({ symbol, close: 1 })),
          },
        }),
      );

      await expect(
        client.getValuations(['COMB.N0000', 'JKH.N0000']),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
    });

    it('accepts a canonical symbol echoed back in a different case', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: {
            as_of: '2025-01-10',
            prices: [{ symbol: 'COMB.N0000', close: 120 }],
          },
        }),
      );

      await expect(client.getValuations(['comb.n0000'])).resolves.toMatchObject(
        { as_of: '2025-01-10' },
      );
    });
  });
});

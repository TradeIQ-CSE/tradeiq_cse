import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import {
  SecurityNotFoundException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { PaperTradingQuotesService } from './paper-trading-quotes.service';

interface QuoteRowOverrides {
  symbol?: string;
  listing_event?: string | null;
  price_as_of?: string | null;
  close?: string | null;
}

describe('PaperTradingQuotesService', () => {
  let service: PaperTradingQuotesService;
  let managerQuery: jest.Mock;

  beforeEach(async () => {
    managerQuery = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaperTradingQuotesService,
        {
          provide: getRepositoryToken(Security),
          useValue: { manager: { query: managerQuery } },
        },
      ],
    }).compile();

    service = module.get(PaperTradingQuotesService);
  });

  // The service issues up to three queries in order: the market-date bounds,
  // the quote row, then the settlement calendar lookup.
  const mockQueries = (row: QuoteRowOverrides | null, to = '2025-01-10') => {
    managerQuery.mockResolvedValueOnce([{ from: '2017-01-02', to }]);
    managerQuery.mockResolvedValueOnce(
      row === null
        ? []
        : [
            {
              symbol: row.symbol ?? 'COMB.N0000',
              listing_event:
                row.listing_event === undefined ? null : row.listing_event,
              price_as_of:
                row.price_as_of === undefined ? '2025-01-10' : row.price_as_of,
              close: row.close === undefined ? '142.7200' : row.close,
            },
          ],
    );
    managerQuery.mockResolvedValueOnce([]); // no closed calendar days
  };

  it('returns the contract quote shape for a listed, freshly priced security', async () => {
    mockQueries({});

    // Mirrors the worked response in docs/api/paper-trading-v1.md §2.3.
    await expect(service.getQuote('COMB.N0000')).resolves.toEqual({
      symbol: 'COMB.N0000',
      listing_status: 'listed',
      market_as_of: '2025-01-10',
      price_as_of: '2025-01-10',
      close: 142.72,
      settlement_date: '2025-01-14',
    });
  });

  it('matches the symbol case-insensitively and echoes the canonical form', async () => {
    mockQueries({});

    const quote = await service.getQuote('comb.n0000');

    expect(quote.symbol).toBe('COMB.N0000');
    // The raw symbol is passed through as a parameter; the query upper()s both
    // sides rather than the caller pre-folding the case.
    expect(managerQuery.mock.calls[1][1]).toEqual(['comb.n0000', '2025-01-10']);
  });

  it('throws SECURITY_NOT_FOUND for an unknown symbol', async () => {
    mockQueries(null);

    await expect(service.getQuote('NOPE.X0000')).rejects.toBeInstanceOf(
      SecurityNotFoundException,
    );
  });

  it('derives suspended and delisted status from the latest listing event', async () => {
    mockQueries({ listing_event: 'suspended' });
    await expect(service.getQuote('COMB.N0000')).resolves.toMatchObject({
      listing_status: 'suspended',
    });

    mockQueries({ listing_event: 'delisted' });
    await expect(service.getQuote('COMB.N0000')).resolves.toMatchObject({
      listing_status: 'delisted',
    });
  });

  it('treats a resumed security as listed', async () => {
    mockQueries({ listing_event: 'resumed' });

    await expect(service.getQuote('COMB.N0000')).resolves.toMatchObject({
      listing_status: 'listed',
    });
  });

  // §2.3: a known security with no usable price is a 200 with nulls, so
  // identity-auth can persist an auditable PRICE_UNAVAILABLE rejection.
  it('returns nulls rather than an error when the security has no price', async () => {
    mockQueries({ price_as_of: null, close: null });

    await expect(service.getQuote('COMB.N0000')).resolves.toEqual({
      symbol: 'COMB.N0000',
      listing_status: 'listed',
      market_as_of: '2025-01-10',
      price_as_of: null,
      close: null,
      settlement_date: null,
    });
  });

  // A stale security still gets a quote; identity-auth compares price_as_of
  // against market_as_of and rejects it as STALE_PRICE.
  it('reports a stale price without judging it', async () => {
    mockQueries({ price_as_of: '2024-12-20' });

    const quote = await service.getQuote('COMB.N0000');

    expect(quote.price_as_of).toBe('2024-12-20');
    expect(quote.market_as_of).toBe('2025-01-10');
    // Settlement follows the fill date, which is market_as_of, not the stale
    // price date.
    expect(quote.settlement_date).toBe('2025-01-14');
  });

  // "Missing or zero close" is identity-auth's rejection rule (§2.2), so a zero
  // is reported as a fact rather than nulled out here.
  it('passes a zero close through untouched', async () => {
    mockQueries({ close: '0.0000' });

    await expect(service.getQuote('COMB.N0000')).resolves.toMatchObject({
      close: 0,
    });
  });

  it('returns nulls when the price database is empty', async () => {
    managerQuery.mockResolvedValueOnce([{ from: null, to: null }]);
    managerQuery.mockResolvedValueOnce([
      {
        symbol: 'COMB.N0000',
        listing_event: null,
        price_as_of: null,
        close: null,
      },
    ]);

    await expect(service.getQuote('COMB.N0000')).resolves.toEqual({
      symbol: 'COMB.N0000',
      listing_status: 'listed',
      market_as_of: null,
      price_as_of: null,
      close: null,
      settlement_date: null,
    });
  });
  // docs/api/paper-trading-v1.md §2.4.
  //
  // resolveMarketDate issues the bounds query, then a settled-session query
  // only when an explicit as_of was supplied. The valuation lookup follows.
  describe('getValuations', () => {
    const bounds = (to = '2025-01-10') =>
      managerQuery.mockResolvedValueOnce([{ from: '2017-01-02', to }]);
    const settlesTo = (date: string | null) =>
      managerQuery.mockResolvedValueOnce([{ trade_date: date }]);
    const priced = (rows: { symbol: string; close: string | null }[]) =>
      managerQuery.mockResolvedValueOnce(rows);

    it('prices every requested symbol at one shared session', async () => {
      bounds();
      priced([
        { symbol: 'COMB.N0000', close: '120.0000' },
        { symbol: 'JKH.N0000', close: '95.5000' },
      ]);

      await expect(
        service.getValuations(['JKH.N0000', 'COMB.N0000']),
      ).resolves.toEqual({
        as_of: '2025-01-10',
        prices: [
          { symbol: 'COMB.N0000', close: 120 },
          { symbol: 'JKH.N0000', close: 95.5 },
        ],
      });
    });

    // The rule that separates this from §2.3. The quote endpoint would carry
    // an earlier close forward; §3.4 forbids that here, because a response
    // must not mix dates across positions.
    it('returns null for a symbol that did not trade on the session', async () => {
      bounds();
      // The LEFT JOIN is pinned to trade_date = as_of, so a security with only
      // older prices comes back with a null close rather than a stale one.
      priced([{ symbol: 'THIN.N0000', close: null }]);

      await expect(service.getValuations(['THIN.N0000'])).resolves.toEqual({
        as_of: '2025-01-10',
        prices: [{ symbol: 'THIN.N0000', close: null }],
      });

      expect(managerQuery.mock.calls[1][0]).toContain(
        'p.trade_date = $2::date',
      );
      expect(managerQuery.mock.calls[1][1]).toEqual([
        ['THIN.N0000'],
        '2025-01-10',
      ]);
    });

    // §2.4: unknown and unpriced are the same outcome, because §7 has no
    // SECURITY_NOT_FOUND. Unlike getQuote, this must not throw.
    it('returns null for an unknown symbol instead of throwing', async () => {
      bounds();
      priced([]);

      await expect(service.getValuations(['NOPE.X0000'])).resolves.toEqual({
        as_of: '2025-01-10',
        prices: [{ symbol: 'NOPE.X0000', close: null }],
      });
    });

    it('matches case-insensitively and echoes the canonical stored symbol', async () => {
      bounds();
      priced([{ symbol: 'COMB.N0000', close: '120.0000' }]);

      const result = await service.getValuations(['comb.n0000']);

      expect(result.prices).toEqual([{ symbol: 'COMB.N0000', close: 120 }]);
      expect(managerQuery.mock.calls[1][1][0]).toEqual(['COMB.N0000']);
    });

    it('collapses a repeated symbol to one entry', async () => {
      bounds();
      priced([{ symbol: 'COMB.N0000', close: '120.0000' }]);

      await expect(
        service.getValuations(['COMB.N0000', 'comb.n0000']),
      ).resolves.toMatchObject({
        prices: [{ symbol: 'COMB.N0000', close: 120 }],
      });
    });

    it('settles a weekend as_of back to the preceding session', async () => {
      // Bounds must reach past the requested Saturday, otherwise the range
      // check rejects it before settling is ever reached.
      bounds('2025-01-13');
      settlesTo('2025-01-10'); // 2025-01-11 is a Saturday
      priced([{ symbol: 'COMB.N0000', close: '120.0000' }]);

      const result = await service.getValuations(['COMB.N0000'], '2025-01-11');

      expect(result.as_of).toBe('2025-01-10');
      // The settled session, not the requested date, prices the row.
      expect(managerQuery.mock.calls[2][1][1]).toBe('2025-01-10');
    });

    it('rejects an as_of outside the available range', async () => {
      bounds();

      await expect(
        service.getValuations(['COMB.N0000'], '2030-01-01'),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    });

    // An empty portfolio still needs a session to report as meta.as_of.
    it('returns the session with no prices when no symbols are requested', async () => {
      bounds();

      await expect(service.getValuations([])).resolves.toEqual({
        as_of: '2025-01-10',
        prices: [],
      });
      // Nothing to look up, so no second query is issued.
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    // Still validates as_of before short-circuiting, so an empty portfolio and
    // a held one answer a bad date the same way.
    it('still rejects a bad as_of when no symbols are requested', async () => {
      bounds();

      await expect(
        service.getValuations([], '2030-01-01'),
      ).rejects.toBeInstanceOf(ValidationFailedException);
    });

    it('reports a null session and null closes when no price data exists', async () => {
      managerQuery.mockResolvedValueOnce([{ from: null, to: null }]);

      await expect(service.getValuations(['COMB.N0000'])).resolves.toEqual({
        as_of: null,
        prices: [{ symbol: 'COMB.N0000', close: null }],
      });
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    // §2.2 keeps "missing or zero" on identity-auth's side, so a zero close is
    // a fact this endpoint reports rather than folds into null.
    it('passes a zero close through untouched', async () => {
      bounds();
      priced([{ symbol: 'COMB.N0000', close: '0.0000' }]);

      await expect(
        service.getValuations(['COMB.N0000']),
      ).resolves.toMatchObject({
        prices: [{ symbol: 'COMB.N0000', close: 0 }],
      });
    });
  });
});

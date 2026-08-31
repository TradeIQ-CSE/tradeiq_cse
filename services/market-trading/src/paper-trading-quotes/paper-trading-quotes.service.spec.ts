import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Security } from '../entities/security.entity';
import { SecurityNotFoundException } from '../common/errors/api-exception';
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
});

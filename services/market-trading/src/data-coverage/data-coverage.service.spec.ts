import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DataCoverageService } from './data-coverage.service';

describe('DataCoverageService', () => {
  let service: DataCoverageService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataCoverageService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = module.get(DataCoverageService);
  });

  const priceDateRows = (dates: string[]) =>
    dates.map((trade_date) => ({ trade_date }));

  it('detects gaps separately for prices and indices', async () => {
    query
      // prices: crosses the 2026-style gap
      .mockResolvedValueOnce(priceDateRows(['2025-12-31', '2026-06-15']))
      // indices: no gap, two adjacent days
      .mockResolvedValueOnce(priceDateRows(['2025-12-30', '2025-12-31']));

    const result = await service.get();

    expect(result).toEqual({
      data: {
        prices: {
          from: '2025-12-31',
          to: '2026-06-15',
          gaps: [
            {
              from: '2026-01-01',
              to: '2026-06-12',
              sessions: 117,
              kind: 'missing_data',
            },
          ],
        },
        indices: {
          from: '2025-12-30',
          to: '2025-12-31',
          gaps: [],
        },
      },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('market_data.daily_prices');
    expect(query.mock.calls[1][0]).toContain('market_data.index_values');
  });

  it('returns null bounds and no gaps for an empty table', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(service.get()).resolves.toEqual({
      data: {
        prices: { from: null, to: null, gaps: [] },
        indices: { from: null, to: null, gaps: [] },
      },
    });
  });

  it('classifies the curated 2020 closure as market_closed', async () => {
    query
      .mockResolvedValueOnce(priceDateRows(['2020-03-20', '2020-05-11']))
      .mockResolvedValueOnce([]);

    const result = await service.get();

    expect(result.data.prices.gaps).toEqual([
      expect.objectContaining({
        from: '2020-03-23',
        to: '2020-05-08',
        kind: 'market_closed',
        label: 'CSE closed (COVID-19)',
      }),
    ]);
  });

  it('memoises the result and skips re-querying within the TTL', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const first = await service.get();
    const second = await service.get();

    expect(second).toBe(first);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('re-queries after invalidate() is called', async () => {
    query
      .mockResolvedValueOnce(priceDateRows(['2025-01-02']))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(priceDateRows(['2025-01-02', '2025-01-03']))
      .mockResolvedValueOnce([]);

    const first = await service.get();
    expect(first.data.prices.to).toBe('2025-01-02');

    service.invalidate();

    const second = await service.get();
    expect(second.data.prices.to).toBe('2025-01-03');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('does not cache a load that was running when invalidate() was called', async () => {
    let releaseStale!: (rows: unknown[]) => void;
    query
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseStale = resolve;
        }),
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(priceDateRows(['2025-01-02', '2025-01-03']))
      .mockResolvedValueOnce([]);

    const stale = service.get();
    service.invalidate();
    const fresh = await service.get();
    releaseStale(priceDateRows(['2025-01-02']));
    await stale;

    expect(fresh.data.prices.to).toBe('2025-01-03');
    const cached = await service.get();
    expect(cached.data.prices.to).toBe('2025-01-03');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('shares one pair of queries across concurrent calls that miss the cache', async () => {
    query
      .mockResolvedValueOnce(priceDateRows(['2025-01-02']))
      .mockResolvedValueOnce([]);

    const [first, second, third] = await Promise.all([
      service.get(),
      service.get(),
      service.get(),
    ]);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load, and retries on the next call', async () => {
    const failure = new Error('connection refused');
    query.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);

    await expect(service.get()).rejects.toBe(failure);

    query
      .mockReset()
      .mockResolvedValueOnce(priceDateRows(['2025-01-02']))
      .mockResolvedValueOnce([]);

    const second = await service.get();
    expect(second.data.prices.to).toBe('2025-01-02');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not let a failed load block a concurrent caller forever', async () => {
    const failure = new Error('connection refused');
    query.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);

    const [firstOutcome, secondOutcome] = await Promise.allSettled([
      service.get(),
      service.get(),
    ]);

    expect(firstOutcome.status).toBe('rejected');
    expect(secondOutcome.status).toBe('rejected');
    // Both concurrent calls shared the one failing pair of queries.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('re-queries once the TTL has elapsed without an explicit invalidate', async () => {
    jest.useFakeTimers();
    try {
      query
        .mockResolvedValueOnce(priceDateRows(['2025-01-02']))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(priceDateRows(['2025-01-02', '2025-01-03']))
        .mockResolvedValueOnce([]);

      await service.get();
      jest.advanceTimersByTime(10 * 60 * 1000 + 1);
      const second = await service.get();

      expect(second.data.prices.to).toBe('2025-01-03');
      expect(query).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });
});

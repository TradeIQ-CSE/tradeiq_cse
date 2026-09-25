import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  SecurityNotFoundException,
  WatchlistFullException,
} from '../common/errors/api-exception';
import { WATCHLIST_LIMIT, WatchlistService } from './watchlist.service';

describe('WatchlistService', () => {
  let service: WatchlistService;
  let txQuery: jest.Mock;
  let rootQuery: jest.Mock;

  const userId = 'a1a1a1a1-1111-4111-8111-111111111111';

  beforeEach(async () => {
    txQuery = jest.fn();
    rootQuery = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WatchlistService,
        {
          provide: DataSource,
          useValue: {
            query: rootQuery,
            manager: { query: rootQuery },
            transaction: jest.fn((cb: (manager: unknown) => unknown) =>
              cb({ query: txQuery }),
            ),
          },
        },
      ],
    }).compile();
    service = module.get(WatchlistService);
  });

  // Routes each transactional query to a canned answer by its leading SQL.
  function answer(existing: string[], symbol: string | null = 'JKH.N0000') {
    txQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM market_data.securities WHERE')) {
        return symbol === null ? [] : [{ symbol }];
      }
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT symbol FROM market_data.watchlist_items')) {
        return existing.map((s) => ({ symbol: s }));
      }
      if (sql.includes('INSERT INTO')) return [];
      return [];
    });
  }

  it('maps numeric strings and dates in the list', async () => {
    rootQuery.mockResolvedValue([
      {
        symbol: 'JKH.N0000',
        company_name: 'John Keells Holdings PLC',
        added_at: new Date('2026-09-01T04:00:00Z'),
        trade_date: '2026-09-24',
        close: '21.5000',
        change: '-0.5000',
        change_pct: '-2.27',
      },
      {
        symbol: 'NEW.N0000',
        company_name: 'New listing PLC',
        added_at: '2026-09-02T04:00:00.000Z',
        trade_date: null,
        close: null,
        change: null,
        change_pct: null,
      },
    ]);

    await expect(service.get(userId)).resolves.toEqual({
      limit: WATCHLIST_LIMIT,
      items: [
        {
          symbol: 'JKH.N0000',
          company_name: 'John Keells Holdings PLC',
          added_at: '2026-09-01T04:00:00.000Z',
          trade_date: '2026-09-24',
          close: 21.5,
          change: -0.5,
          change_pct: -2.27,
        },
        {
          symbol: 'NEW.N0000',
          company_name: 'New listing PLC',
          added_at: '2026-09-02T04:00:00.000Z',
          trade_date: null,
          close: null,
          change: null,
          change_pct: null,
        },
      ],
    });
    expect(rootQuery.mock.calls[0][1]).toEqual([userId]);
  });

  it('adds under the canonical symbol', async () => {
    answer([]);
    await service.add(userId, 'jkh.n0000');
    const insert = txQuery.mock.calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO'),
    );
    expect(insert?.[1]).toEqual([userId, 'JKH.N0000']);
  });

  it('rejects an unknown symbol before locking or writing', async () => {
    answer([], null);
    await expect(service.add(userId, 'NOPE')).rejects.toBeInstanceOf(
      SecurityNotFoundException,
    );
    expect(txQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects an eleventh security', async () => {
    const full = Array.from({ length: WATCHLIST_LIMIT }, (_, i) => `S${i}`);
    answer(full);
    await expect(service.add(userId, 'JKH.N0000')).rejects.toBeInstanceOf(
      WatchlistFullException,
    );
    expect(
      txQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT')),
    ).toBe(false);
  });

  it('treats re-adding a followed security as a no-op, even when full', async () => {
    const full = [
      'JKH.N0000',
      ...Array.from({ length: WATCHLIST_LIMIT - 1 }, (_, i) => `S${i}`),
    ];
    answer(full);
    await expect(service.add(userId, 'JKH.N0000')).resolves.toBeDefined();
    expect(
      txQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT')),
    ).toBe(false);
  });

  it('locks the user before counting', async () => {
    answer([]);
    await service.add(userId, 'JKH.N0000');
    const order = txQuery.mock.calls.map(([sql]) => sql as string);
    const lock = order.findIndex((sql) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const count = order.findIndex((sql) =>
      sql.includes('SELECT symbol FROM market_data.watchlist_items'),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(count);
  });

  it('removes case-insensitively for the user only', async () => {
    rootQuery.mockResolvedValue([]);
    await service.remove(userId, 'jkh.n0000');
    expect(rootQuery.mock.calls[0][1]).toEqual([userId, 'jkh.n0000']);
    expect(rootQuery.mock.calls[0][0]).toContain('user_id = $1');
  });
});

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ApiKeyCache } from '../api-key-cache/api-key-cache.service';
import { ApiKeyExistsException } from '../common/errors/api-exception';
import { RateLimitCounter } from '../redis/rate-limit-counter';
import { DeveloperKeysService } from './developer-keys.service';

interface ActiveKeyRow {
  api_key_id: string;
  key_prefix: string;
  label: string | null;
  created_at: Date;
  last_used_at: Date | null;
}

describe('DeveloperKeysService', () => {
  let service: DeveloperKeysService;
  let txQuery: jest.Mock;
  let rootQuery: jest.Mock;
  let counterPeek: jest.Mock;
  let cacheInvalidate: jest.Mock;

  const userId = 'a1a1a1a1-1111-4111-8111-111111111111';
  const CREATED_AT = new Date('2026-09-26T09:00:00.000Z');

  beforeEach(async () => {
    txQuery = jest.fn();
    rootQuery = jest.fn();
    counterPeek = jest.fn();
    cacheInvalidate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeveloperKeysService,
        {
          provide: DataSource,
          useValue: {
            manager: { query: rootQuery },
            transaction: jest.fn((cb: (manager: unknown) => unknown) =>
              cb({ query: txQuery }),
            ),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(100) },
        },
        {
          provide: RateLimitCounter,
          useValue: { peek: counterPeek, increment: jest.fn() },
        },
        {
          provide: ApiKeyCache,
          useValue: {
            invalidate: cacheInvalidate,
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(DeveloperKeysService);
  });

  // Routes each transactional query to a canned answer by its leading SQL,
  // the same pattern watchlist.service.spec.ts uses.
  function answerTx(existing: ActiveKeyRow[] = []) {
    txQuery.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT api_key_id')) return existing;
      if (sql.includes('UPDATE market_data.api_keys')) {
        // Matches TypeORM's real UPDATE...RETURNING shape: a
        // [rows, affectedCount] tuple, not the rows array on its own.
        return existing.length > 0
          ? [[{ key_hash: 'old-key-hash' }], 1]
          : [[], 0];
      }
      if (sql.includes('INSERT INTO market_data.api_keys')) {
        return [{ created_at: CREATED_AT }];
      }
      return [];
    });
  }

  function activeRow(overrides: Partial<ActiveKeyRow> = {}): ActiveKeyRow {
    return {
      api_key_id: 'old-key-id',
      key_prefix: 'tiq_oldp',
      label: 'Old label',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      last_used_at: null,
      ...overrides,
    };
  }

  describe('get', () => {
    it('returns null when there is no active key', async () => {
      rootQuery.mockResolvedValue([]);
      await expect(service.get(userId)).resolves.toBeNull();
    });

    it('returns the active key metadata', async () => {
      rootQuery.mockResolvedValue([activeRow()]);
      await expect(service.get(userId)).resolves.toEqual({
        prefix: 'tiq_oldp',
        label: 'Old label',
        created_at: '2026-01-01T00:00:00.000Z',
        last_used_at: null,
      });
    });
  });

  describe('create', () => {
    it('creates a new well-formed key when none is active', async () => {
      answerTx([]);
      const result = await service.create(userId, 'My script');

      expect(result.key).toMatch(/^tiq_[A-Za-z0-9]{40}$/);
      expect(result.prefix).toBe(result.key.slice(0, 8));
      expect(result.label).toBe('My script');
      expect(result.created_at).toBe('2026-09-26T09:00:00.000Z');

      const insert = txQuery.mock.calls.find(([sql]) =>
        (sql as string).includes('INSERT INTO'),
      );
      expect(insert?.[1]).toEqual([
        expect.any(String),
        userId,
        'My script',
        expect.stringMatching(/^[0-9a-f]{64}$/),
        result.prefix,
      ]);
    });

    it('stores a blank label as null', async () => {
      answerTx([]);
      const result = await service.create(userId, '');
      expect(result.label).toBeNull();
    });

    it('stores an omitted label as null', async () => {
      answerTx([]);
      const result = await service.create(userId, undefined);
      expect(result.label).toBeNull();
    });

    it('rejects a second create with API_KEY_EXISTS and never inserts', async () => {
      answerTx([activeRow()]);
      await expect(service.create(userId, undefined)).rejects.toBeInstanceOf(
        ApiKeyExistsException,
      );
      expect(
        txQuery.mock.calls.some(([sql]) => (sql as string).includes('INSERT')),
      ).toBe(false);
    });

    it('locks before checking for an existing key', async () => {
      answerTx([]);
      await service.create(userId, undefined);
      const order = txQuery.mock.calls.map(([sql]) => sql as string);
      const lock = order.findIndex((sql) =>
        sql.includes('pg_advisory_xact_lock'),
      );
      const check = order.findIndex((sql) => sql.includes('SELECT api_key_id'));
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(lock).toBeLessThan(check);
    });

    // Backstop for the partial unique index (docs/plans/developer-api.md):
    // a race that slips past the advisory lock still answers 409, not 500.
    it('maps a unique-constraint violation on the active-user index to API_KEY_EXISTS', async () => {
      txQuery.mockImplementation((sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT api_key_id')) return [];
        if (sql.includes('INSERT INTO')) {
          const err = Object.assign(new Error('duplicate key value'), {
            code: '23505',
            constraint: 'api_keys_active_user_uq',
          });
          throw err;
        }
        return [];
      });

      await expect(service.create(userId, undefined)).rejects.toBeInstanceOf(
        ApiKeyExistsException,
      );
    });

    // Same lookup, but on driverError (where TypeORM's QueryFailedError can
    // leave the driver fields instead of copying them onto itself).
    it('maps an active-user violation on driverError to API_KEY_EXISTS too', async () => {
      txQuery.mockImplementation((sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT api_key_id')) return [];
        if (sql.includes('INSERT INTO')) {
          const err = Object.assign(new Error('duplicate key value'), {
            driverError: {
              code: '23505',
              constraint: 'api_keys_active_user_uq',
            },
          });
          throw err;
        }
        return [];
      });

      await expect(service.create(userId, undefined)).rejects.toBeInstanceOf(
        ApiKeyExistsException,
      );
    });

    // A key_hash collision is a different bug (an astronomically unlikely
    // random collision, or a broken RNG) and must surface as one, not get
    // swallowed into a 409 that tells the caller they already have a key.
    it('rethrows a unique violation on a different constraint (key_hash)', async () => {
      const err = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'api_keys_key_hash_key',
      });
      txQuery.mockImplementation((sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT api_key_id')) return [];
        if (sql.includes('INSERT INTO')) throw err;
        return [];
      });

      await expect(service.create(userId, undefined)).rejects.toBe(err);
    });
  });

  describe('regenerate', () => {
    it('keeps the existing label when none is given', async () => {
      answerTx([activeRow({ label: 'Old label' })]);
      const result = await service.regenerate(userId, undefined);

      expect(result.label).toBe('Old label');
      const revoke = txQuery.mock.calls.find(
        ([sql]) =>
          (sql as string).includes('UPDATE') &&
          (sql as string).includes('WHERE api_key_id'),
      );
      expect(revoke?.[1]).toEqual(['old-key-id']);
    });

    it('replaces the label when one is given', async () => {
      answerTx([activeRow({ label: 'Old label' })]);
      const result = await service.regenerate(userId, 'New label');
      expect(result.label).toBe('New label');
    });

    // The DTO trims before this ever runs (see upsert-api-key.dto.ts), so
    // the service only ever sees an already-trimmed '' for a blank label.
    it('stores a blank replacement label as null, not the old label', async () => {
      answerTx([activeRow({ label: 'Old label' })]);
      const result = await service.regenerate(userId, '');
      expect(result.label).toBeNull();
    });

    it('behaves like create when there is no active key', async () => {
      answerTx([]);
      const result = await service.regenerate(userId, 'fresh');

      expect(result.label).toBe('fresh');
      expect(
        txQuery.mock.calls.some(
          ([sql]) =>
            (sql as string).includes('UPDATE') &&
            (sql as string).includes('WHERE api_key_id'),
        ),
      ).toBe(false);
    });

    it('invalidates the old key’s cache entry after commit', async () => {
      answerTx([activeRow()]);
      await service.regenerate(userId, undefined);
      expect(cacheInvalidate).toHaveBeenCalledWith('old-key-hash');
    });

    it('does not invalidate anything when there was no active key', async () => {
      answerTx([]);
      await service.regenerate(userId, 'fresh');
      expect(cacheInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revokes only the caller’s active key', async () => {
      txQuery.mockResolvedValue([[{ key_hash: 'old-key-hash' }], 1]);
      await service.revoke(userId);

      const update = txQuery.mock.calls.find(([sql]) =>
        (sql as string).includes('revoked_at IS NULL'),
      );
      expect(update?.[1]).toEqual([userId]);
    });

    it('invalidates the revoked key’s cache entry', async () => {
      txQuery.mockResolvedValue([[{ key_hash: 'old-key-hash' }], 1]);
      await service.revoke(userId);
      expect(cacheInvalidate).toHaveBeenCalledWith('old-key-hash');
    });

    it('invalidates nothing when there was no active key', async () => {
      txQuery.mockResolvedValue([[], 0]);
      await service.revoke(userId);
      expect(cacheInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('usage', () => {
    function answerUsage(options: {
      active?: ActiveKeyRow | null;
      dailyRows?: { usage_date: string; request_count: string }[];
    }) {
      rootQuery.mockImplementation((sql: string) => {
        if (sql.includes('SELECT api_key_id')) {
          return options.active ? [options.active] : [];
        }
        if (sql.includes('to_char')) return options.dailyRows ?? [];
        return [];
      });
    }

    it('is null when the user has no active key', async () => {
      answerUsage({ active: null });
      await expect(
        service.usage(userId, new Date('2026-09-26T10:00:00.000Z')),
      ).resolves.toBeNull();
    });

    it('zero-fills the 30-day range, oldest first', async () => {
      answerUsage({
        active: activeRow(),
        dailyRows: [
          { usage_date: '2026-09-26', request_count: '5' },
          { usage_date: '2026-08-30', request_count: '3' },
        ],
      });
      counterPeek.mockResolvedValue(0);

      const result = await service.usage(
        userId,
        new Date('2026-09-26T10:00:00.000Z'),
      );

      expect(result?.daily).toHaveLength(30);
      expect(result?.daily[0].date).toBe('2026-08-28');
      expect(result?.daily[29].date).toBe('2026-09-26');
      expect(result?.daily[29].request_count).toBe(5);
      expect(
        result?.daily.find((d) => d.date === '2026-08-30')?.request_count,
      ).toBe(3);
      expect(result?.daily.filter((d) => d.request_count === 0)).toHaveLength(
        28,
      );
    });

    it('reports used: null when the counter throws (fail-open)', async () => {
      answerUsage({ active: activeRow(), dailyRows: [] });
      counterPeek.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.usage(
        userId,
        new Date('2026-09-26T10:30:00.000Z'),
      );

      expect(result?.used).toBeNull();
      expect(result?.limit).toBe(100);
    });

    it('reports used from the counter and reset_at at the next UTC hour', async () => {
      answerUsage({
        active: activeRow({ api_key_id: 'k1' }),
        dailyRows: [],
      });
      counterPeek.mockResolvedValue(37);

      const result = await service.usage(
        userId,
        new Date('2026-09-26T09:15:00.000Z'),
      );

      expect(result?.used).toBe(37);
      expect(result?.reset_at).toBe('2026-09-26T10:00:00Z');
      expect(counterPeek).toHaveBeenCalledWith('ratelimit:k1:2026092609');
    });
  });
});

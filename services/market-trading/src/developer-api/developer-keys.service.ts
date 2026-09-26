import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ApiKeyExistsException } from '../common/errors/api-exception';
import { RateLimitCounter } from '../redis/rate-limit-counter';
import { generateApiKey, hashApiKey, keyPrefix } from './api-key';
import { currentWindow } from './rate-limit-window';

// docs/api/public-api-v1.md §7 — one active key per signed-in user.
// Postgres error code for a unique-constraint violation (backstop for the
// partial unique index — see `insert`, below).
const UNIQUE_VIOLATION = '23505';
// The partial unique index this backstop is for (see the migration). A
// 23505 on any other constraint — notably a `key_hash` collision — is a
// different bug and must not be swallowed into a 409.
const ACTIVE_USER_INDEX = 'api_keys_active_user_uq';

const DAILY_WINDOW_DAYS = 30;

export interface ApiKeyMetadata {
  prefix: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedApiKey {
  key: string;
  prefix: string;
  label: string | null;
  created_at: string;
}

export interface DailyUsage {
  date: string;
  request_count: number;
}

export interface UsageSummary {
  limit: number;
  // null when the hourly counter could not be read (Redis unavailable) —
  // the usage view must not fail because of it (ADR 0010 fail-open).
  used: number | null;
  reset_at: string;
  daily: DailyUsage[];
}

interface ActiveKeyRow {
  api_key_id: string;
  key_prefix: string;
  label: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
}

// A present label is trimmed by UpsertApiKeyDto before it ever reaches here;
// what is left is only "was a label given at all" (undefined) vs. "given and
// blank" ('') vs. "given and meaningful" (a non-empty string). This turns the
// latter two into the stored form: blank becomes null (§7 "an empty label is
// stored as null").
function normalizeLabel(label: string | null | undefined): string | null {
  return label ? label : null;
}

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

// RFC 3339 UTC with no fractional seconds, matching public-api-v1.md's own
// examples for `reset_at` (e.g. "2026-09-26T10:00:00Z") — resetAt is always
// on a whole-second (in practice whole-hour) boundary, so nothing is lost by
// dropping the ".000".
function toRfc3339Seconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// TypeORM's QueryFailedError copies the driver error's fields onto itself,
// but some drivers/versions only leave them on `driverError` — so both are
// checked before deciding this isn't the active-user race.
function isActiveUserViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as {
    code?: unknown;
    constraint?: unknown;
    driverError?: { code?: unknown; constraint?: unknown };
  };
  const code = candidate.code ?? candidate.driverError?.code;
  const constraint = candidate.constraint ?? candidate.driverError?.constraint;
  return code === UNIQUE_VIOLATION && constraint === ACTIVE_USER_INDEX;
}

@Injectable()
export class DeveloperKeysService {
  private readonly logger = new Logger(DeveloperKeysService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly rateLimitCounter: RateLimitCounter,
  ) {}

  // §7.1 — null when the user has none.
  async get(userId: string): Promise<ApiKeyMetadata | null> {
    const row = await this.findActive(userId, this.dataSource.manager);
    return row ? this.toMetadata(row) : null;
  }

  // §7.2 — 409 API_KEY_EXISTS if one is already active.
  async create(
    userId: string,
    label: string | undefined,
  ): Promise<CreatedApiKey> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);

      const existing = await this.findActive(userId, manager);
      if (existing) {
        throw new ApiKeyExistsException();
      }

      return this.insert(manager, userId, normalizeLabel(label));
    });
  }

  // §7.3 — revokes the active key and issues a new one in the same
  // transaction; behaves exactly like create() when there is no active key.
  // Keeps the existing label unless the request body sets one (§7.3).
  async regenerate(
    userId: string,
    label: string | undefined,
  ): Promise<CreatedApiKey> {
    return this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);

      const existing = await this.findActive(userId, manager);
      const effectiveLabel =
        label === undefined ? (existing?.label ?? null) : normalizeLabel(label);

      if (existing) {
        await manager.query(
          `UPDATE market_data.api_keys SET revoked_at = now()
           WHERE api_key_id = $1`,
          [existing.api_key_id],
        );
      }

      return this.insert(manager, userId, effectiveLabel);
    });
  }

  // §7.4 — idempotent: revoking with no active key still answers success.
  async revoke(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);
      await manager.query(
        `UPDATE market_data.api_keys SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    });
  }

  // §7.5 — null when the user has no active key. `now` is a parameter, not
  // `Date.now()` read internally, so a test can pin both the hourly window
  // and the 30-day range it drives.
  async usage(
    userId: string,
    now: Date = new Date(),
  ): Promise<UsageSummary | null> {
    const active = await this.findActive(userId, this.dataSource.manager);
    if (!active) return null;

    const window = currentWindow(now);

    let used: number | null;
    try {
      used = await this.rateLimitCounter.peek(
        window.counterKey(active.api_key_id),
      );
    } catch (err) {
      // ADR 0010 fail-open: a Redis outage must not fail the usage view.
      this.logger.warn(
        `Could not read the hourly usage counter (user ${userId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      used = null;
    }

    return {
      limit: this.config.getOrThrow<number>('publicApi.hourlyLimit'),
      used,
      reset_at: toRfc3339Seconds(window.resetAt),
      daily: await this.dailyUsage(userId, now),
    };
  }

  // Sums every one of the user's keys, revoked ones included, so
  // regenerating a key never wipes its history out of the chart (§7.5).
  private async dailyUsage(userId: string, now: Date): Promise<DailyUsage[]> {
    const today = isoDateUtc(now);
    const from = isoDateUtc(addUtcDays(now, -(DAILY_WINDOW_DAYS - 1)));

    // to_char rather than letting node-postgres decode the `date` column:
    // the decoded value's calendar day depends on the process's local time
    // zone, but "one row per UTC calendar day" must not.
    const rows: { usage_date: string; request_count: string }[] =
      await this.dataSource.manager.query(
        `SELECT to_char(u.usage_date, 'YYYY-MM-DD') AS usage_date,
                SUM(u.request_count) AS request_count
         FROM market_data.api_key_usage u
         JOIN market_data.api_keys k ON k.api_key_id = u.api_key_id
         WHERE k.user_id = $1 AND u.usage_date BETWEEN $2::date AND $3::date
         GROUP BY u.usage_date`,
        [userId, from, today],
      );

    const byDate = new Map(
      rows.map((row) => [row.usage_date, Number(row.request_count)]),
    );

    return Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => {
      const date = isoDateUtc(addUtcDays(now, -(DAILY_WINDOW_DAYS - 1) + i));
      return { date, request_count: byDate.get(date) ?? 0 };
    });
  }

  // Serialises every create, regenerate and revoke per user, so two
  // concurrent requests can never both see "no active key" and both insert
  // one, or both act on the same active key at once.
  private async lock(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [`developer-api-key:${userId}`],
    );
  }

  private async findActive(
    userId: string,
    manager: EntityManager,
  ): Promise<ActiveKeyRow | null> {
    const rows: ActiveKeyRow[] = await manager.query(
      `SELECT api_key_id, key_prefix, label, created_at, last_used_at
       FROM market_data.api_keys
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return rows[0] ?? null;
  }

  private async insert(
    manager: EntityManager,
    userId: string,
    label: string | null,
  ): Promise<CreatedApiKey> {
    const secret = generateApiKey();
    const hash = hashApiKey(secret);
    const prefix = keyPrefix(secret);
    const apiKeyId = randomUUID();

    try {
      const rows: { created_at: Date | string }[] = await manager.query(
        `INSERT INTO market_data.api_keys
           (api_key_id, user_id, label, key_hash, key_prefix)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING created_at`,
        [apiKeyId, userId, label, hash, prefix],
      );

      return {
        key: secret,
        prefix,
        label,
        created_at: toTimestamp(rows[0].created_at),
      };
    } catch (err) {
      // Backstop for the partial unique index (docs/plans/developer-api.md
      // "Build" step 5): a race that slips past the advisory lock — a lock
      // acquired against a stale connection, a bug in the lock key — must
      // still answer 409, not a raw 500. Any other unique violation (a
      // `key_hash` collision, say) is a different bug and must surface as one.
      if (isActiveUserViolation(err)) {
        throw new ApiKeyExistsException();
      }
      throw err;
    }
  }

  private toMetadata(row: ActiveKeyRow): ApiKeyMetadata {
    return {
      prefix: row.key_prefix,
      label: row.label,
      created_at: toTimestamp(row.created_at),
      last_used_at: row.last_used_at ? toTimestamp(row.last_used_at) : null,
    };
  }
}

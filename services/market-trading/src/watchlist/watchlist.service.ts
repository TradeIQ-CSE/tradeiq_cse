import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  SecurityNotFoundException,
  WatchlistFullException,
} from '../common/errors/api-exception';
import { toIsoDate } from '../common/market-date';

// SRS: an investor follows at most ten securities.
export const WATCHLIST_LIMIT = 10;

export interface WatchlistItemResponse {
  symbol: string;
  company_name: string;
  added_at: string;
  // The security's own latest session, which may be older than the market's
  // for a thinly traded or suspended security. All four are null when the
  // security has no prices at all.
  trade_date: string | null;
  close: number | null;
  // Against the security's previous session; null when there is none.
  change: number | null;
  change_pct: number | null;
}

export interface WatchlistResponse {
  limit: number;
  items: WatchlistItemResponse[];
}

interface RawWatchlistRow {
  symbol: string;
  company_name: string;
  added_at: Date | string;
  trade_date: Date | string | null;
  close: string | null;
  change: string | null;
  change_pct: string | null;
}

const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);

@Injectable()
export class WatchlistService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // docs/api/watchlist-v1.md §3.1 — oldest first, the order they were added.
  async get(
    userId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<WatchlistResponse> {
    const rows: RawWatchlistRow[] = await manager.query(
      `
      SELECT
        w.symbol,
        s.company_name,
        w.added_at,
        latest.trade_date,
        latest.close,
        CASE
          WHEN previous.close IS NULL THEN NULL
          ELSE ROUND(latest.close - previous.close, 4)
        END AS change,
        CASE
          WHEN previous.close IS NULL OR previous.close = 0 THEN NULL
          ELSE ROUND(((latest.close - previous.close) / previous.close) * 100, 2)
        END AS change_pct
      FROM market_data.watchlist_items w
      JOIN market_data.securities s ON s.symbol = w.symbol
      LEFT JOIN LATERAL (
        SELECT p.trade_date, p.close
        FROM market_data.daily_prices p
        WHERE p.security_id = s.security_id
        ORDER BY p.trade_date DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT p.close
        FROM market_data.daily_prices p
        WHERE p.security_id = s.security_id
          AND p.trade_date < latest.trade_date
        ORDER BY p.trade_date DESC
        LIMIT 1
      ) previous ON true
      WHERE w.user_id = $1
      ORDER BY w.added_at ASC, w.symbol ASC
      `,
      [userId],
    );

    return {
      limit: WATCHLIST_LIMIT,
      items: rows.map((row) => ({
        symbol: row.symbol,
        company_name: row.company_name,
        added_at:
          row.added_at instanceof Date
            ? row.added_at.toISOString()
            : row.added_at,
        trade_date: toIsoDate(row.trade_date),
        close: toNumber(row.close),
        change: toNumber(row.change),
        change_pct: toNumber(row.change_pct),
      })),
    };
  }

  // §3.2 — idempotent: following a security already on the list changes
  // nothing and is not an error, even when the list is full.
  async add(userId: string, symbol: string): Promise<WatchlistResponse> {
    return this.dataSource.transaction(async (manager) => {
      const securities: { symbol: string }[] = await manager.query(
        `SELECT symbol FROM market_data.securities WHERE lower(symbol) = lower($1)`,
        [symbol],
      );
      const canonical = securities[0]?.symbol;
      if (canonical === undefined) throw new SecurityNotFoundException();

      // Serialise one user's adds so two concurrent requests cannot both see
      // nine items and push the list to eleven.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [`watchlist:${userId}`],
      );

      const existing: { symbol: string }[] = await manager.query(
        `SELECT symbol FROM market_data.watchlist_items WHERE user_id = $1`,
        [userId],
      );
      if (!existing.some((item) => item.symbol === canonical)) {
        if (existing.length >= WATCHLIST_LIMIT) {
          throw new WatchlistFullException(WATCHLIST_LIMIT);
        }
        await manager.query(
          `INSERT INTO market_data.watchlist_items (user_id, symbol)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, canonical],
        );
      }

      return this.get(userId, manager);
    });
  }

  // §3.3 — idempotent: removing a security that is not on the list, or that
  // does not exist, succeeds with nothing to do.
  async remove(userId: string, symbol: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM market_data.watchlist_items
       WHERE user_id = $1 AND lower(symbol) = lower($2)`,
      [userId, symbol],
    );
  }
}

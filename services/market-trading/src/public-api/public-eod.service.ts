import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveMarketDate, toIsoDate } from '../common/market-date';
import { PublicEodQueryDto } from './dto/public-eod-query.dto';

export interface PublicEodRow {
  symbol: string;
  date: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number | null;
  change_pct: number | null;
}

export interface PublicEodResult {
  data: PublicEodRow[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    as_of: string | null;
  };
}

export interface RawEodRow {
  symbol: string;
  open: string | null;
  high: string;
  low: string;
  close: string;
  volume: string;
  prev_close: string | null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toEodRow(row: RawEodRow, date: string): PublicEodRow {
  const close = Number(row.close);
  const prevClose = row.prev_close === null ? null : Number(row.prev_close);
  const change = prevClose === null ? null : round(close - prevClose, 4);
  const changePct =
    change !== null && prevClose !== null && prevClose !== 0
      ? round((change / prevClose) * 100, 2)
      : null;

  return {
    symbol: row.symbol,
    date,
    open: row.open === null ? null : Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close,
    volume: Number(row.volume),
    change,
    change_pct: changePct,
  };
}

@Injectable()
export class PublicEodService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(query: PublicEodQueryDto): Promise<PublicEodResult> {
    const asOf = await this.resolveAsOf(query.date);

    if (asOf === null) {
      // docs/api/public-api-v1.md §6.6 — either an explicit date with no
      // session (a weekend, a holiday, a day with no prices at all), or an
      // empty database. Either way: 200, an empty page, as_of null — not an
      // error, and never a silent substitution of an earlier session.
      return {
        data: [],
        meta: {
          page: query.page,
          page_size: query.page_size,
          total: 0,
          as_of: null,
        },
      };
    }

    const countRows: { total: string }[] = await this.dataSource.query(
      `SELECT COUNT(*)::text AS total
       FROM market_data.daily_prices
       WHERE trade_date = $1::date`,
      [asOf],
    );
    const total = Number(countRows[0].total);

    const offset = (query.page - 1) * query.page_size;
    const rows: RawEodRow[] = await this.dataSource.query(
      `SELECT
         s.symbol, cur.open, cur.high, cur.low, cur.close, cur.volume,
         prev.close AS prev_close
       FROM market_data.daily_prices cur
       JOIN market_data.securities s ON s.security_id = cur.security_id
       LEFT JOIN LATERAL (
         SELECT p.close
         FROM market_data.daily_prices p
         WHERE p.security_id = cur.security_id
           AND p.trade_date < cur.trade_date
         ORDER BY p.trade_date DESC
         LIMIT 1
       ) prev ON true
       WHERE cur.trade_date = $1::date
       ORDER BY s.symbol ASC
       LIMIT $2 OFFSET $3`,
      [asOf, query.page_size, offset],
    );

    return {
      data: rows.map((row) => toEodRow(row, asOf)),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total,
        as_of: asOf,
      },
    };
  }

  // The default follows catalogue §2.4 / market-overview's definition of the
  // latest completed session (resolveMarketDate with no requested date). An
  // explicit `date`, though, must answer null rather than settle backward to
  // an earlier session the caller did not ask for — resolveMarketDate's
  // "requested" path does the opposite (clamps to the nearest prior session),
  // which is right for the internal /securities and /market/overview reads
  // but wrong for this contract's "no session on this exact date" rule.
  private async resolveAsOf(requested?: string): Promise<string | null> {
    if (requested === undefined) {
      const marketDate = await resolveMarketDate(this.dataSource.manager);
      return marketDate.asOf;
    }

    const rows: { trade_date: Date | string }[] = await this.dataSource.query(
      `SELECT trade_date FROM market_data.daily_prices
       WHERE trade_date = $1::date
       LIMIT 1`,
      [requested],
    );
    return rows.length > 0 ? (toIsoDate(rows[0].trade_date) as string) : null;
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  IndexNotFoundException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { oneCalendarYearBefore, toIsoDate } from '../common/market-date';
import { IndexValuesQueryDto } from './dto/index-values-query.dto';
import { ListIndicesQueryDto } from './dto/list-indices-query.dto';

export interface IndexListItem {
  code: string;
  name: string;
  latest: {
    date: string;
    close: number;
    // The value `change` is measured from. Normally the previous session, but
    // after a gap in the series it can be months earlier, so the client is
    // told rather than left to assume.
    previous_date: string | null;
    change: number | null;
    change_pct: number | null;
  } | null;
}

export interface IndexListResult {
  data: IndexListItem[];
}

export interface IndexValuesResult {
  data: {
    code: string;
    name: string;
    from: string | null;
    to: string | null;
    values: { date: string; close: number }[];
  };
}

// numeric columns come back from the pg driver as strings, date columns as
// Date objects (see toIsoDate).
interface RawIndexListRow {
  index_code: string;
  index_name: string;
  trade_date: Date | string | null;
  close: string | null;
  previous_date: Date | string | null;
  previous_close: string | null;
}

interface RawIndexValueRow {
  date: Date | string;
  close: string;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toListItem(row: RawIndexListRow): IndexListItem {
  if (row.close === null) {
    return { code: row.index_code, name: row.index_name, latest: null };
  }
  const close = Number(row.close);
  const previous =
    row.previous_close === null ? null : Number(row.previous_close);
  const change = previous === null ? null : round(close - previous, 4);
  const changePct =
    change !== null && previous !== null && previous !== 0
      ? round((change / previous) * 100, 2)
      : null;
  return {
    code: row.index_code,
    name: row.index_name,
    latest: {
      date: toIsoDate(row.trade_date) as string,
      close,
      previous_date: toIsoDate(row.previous_date),
      change,
      change_pct: changePct,
    },
  };
}

@Injectable()
export class IndicesService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: ListIndicesQueryDto): Promise<IndexListResult> {
    // Each index is valued at its own latest date on or before as_of rather
    // than one shared session: a series the exchange did not publish on a day
    // simply has no row for it, and must not borrow another series' date.
    const rows: RawIndexListRow[] = await this.dataSource.query(
      `SELECT
         i.index_code, i.index_name,
         latest.trade_date, latest.index_value AS close,
         previous.trade_date AS previous_date,
         previous.index_value AS previous_close
       FROM market_data.indices i
       LEFT JOIN LATERAL (
         SELECT v.trade_date, v.index_value
         FROM market_data.index_values v
         WHERE v.index_code = i.index_code
           AND ($1::date IS NULL OR v.trade_date <= $1::date)
         ORDER BY v.trade_date DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT v.trade_date, v.index_value
         FROM market_data.index_values v
         WHERE v.index_code = i.index_code
           AND v.trade_date < latest.trade_date
         ORDER BY v.trade_date DESC
         LIMIT 1
       ) previous ON true
       ORDER BY i.index_code`,
      [query.as_of ?? null],
    );
    return { data: rows.map(toListItem) };
  }

  async values(
    code: string,
    query: IndexValuesQueryDto,
  ): Promise<IndexValuesResult> {
    const indices: { index_code: string; index_name: string }[] =
      await this.dataSource.query(
        `SELECT index_code, index_name
         FROM market_data.indices
         WHERE upper(index_code) = upper($1)`,
        [code],
      );
    if (indices.length === 0) {
      throw new IndexNotFoundException();
    }
    const index = indices[0];

    // Same defaults as OHLCV (§5): the range ends at the latest date any
    // series has and starts a calendar year before it.
    let to = query.to;
    if (to === undefined) {
      const latestRows: { to: Date | string | null }[] =
        await this.dataSource.query(
          `SELECT max(trade_date) AS "to" FROM market_data.index_values`,
        );
      to = toIsoDate(latestRows[0]?.to ?? null) ?? undefined;
    }

    if (to === undefined) {
      if (query.from !== undefined) {
        throw new ValidationFailedException([
          {
            field: 'to',
            reason: 'cannot be defaulted because no index data is available',
          },
        ]);
      }
      return {
        data: {
          code: index.index_code,
          name: index.index_name,
          from: null,
          to: null,
          values: [],
        },
      };
    }

    const from = query.from ?? oneCalendarYearBefore(to);
    if (from > to) {
      throw new ValidationFailedException([
        { field: 'from', reason: 'must be before or equal to to' },
      ]);
    }

    const rows: RawIndexValueRow[] = await this.dataSource.query(
      `SELECT trade_date AS date, index_value AS close
       FROM market_data.index_values
       WHERE index_code = $1
         AND trade_date BETWEEN $2::date AND $3::date
       ORDER BY trade_date ASC`,
      [index.index_code, from, to],
    );
    return {
      data: {
        code: index.index_code,
        name: index.index_name,
        from,
        to,
        values: rows.map((row) => ({
          date: toIsoDate(row.date) as string,
          close: Number(row.close),
        })),
      },
    };
  }
}

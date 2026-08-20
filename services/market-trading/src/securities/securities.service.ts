import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security } from '../entities/security.entity';
import { Sector } from '../entities/sector.entity';
import { ValidationFailedException } from '../common/errors/api-exception';
import { ListSecuritiesQueryDto } from './dto/list-securities-query.dto';

export interface SecurityListItem {
  symbol: string;
  company_name: string;
  sector: { gics_code: string; name: string } | null;
  shares_outstanding: number | null;
  data_from: string | null;
  data_to: string | null;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  pe_ratio: number | null;
}

export interface SecurityListResult {
  data: SecurityListItem[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    // The trading date every row is priced at, plus the bounds a client may
    // ask for, so a date picker can be populated from one response.
    as_of: string | null;
    available_from: string | null;
    available_to: string | null;
  };
}

// Raw row shape from the hand-written query in list() below. Numeric/bigint
// columns come back as strings from the pg driver; `date` columns come back as
// JS Date objects, which serialise to full RFC 3339 timestamps unless
// reformatted (see toIsoDate).
interface RawSecurityRow {
  symbol: string;
  company_name: string;
  gics_code: string | null;
  sector_name: string | null;
  shares_outstanding: string | null;
  data_from: Date | string | null;
  data_to: Date | string | null;
  price: string | null;
  volume: string | null;
  prev_close: string | null;
  pe_ratio: string | null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// The contract fixes dates at YYYY-MM-DD (endpoint-catalogue-v0.md §2.2).
// Uses local getters, not toISOString(), so a date west of UTC isn't shifted
// back a day.
function toIsoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

@Injectable()
export class SecuritiesService {
  constructor(
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(Sector)
    private readonly sectors: Repository<Sector>,
  ) {}

  // Bounds of the priced history, used both to default `as_of` and to reject
  // dates the dataset cannot answer.
  private async priceDateRange(): Promise<{
    from: string | null;
    to: string | null;
  }> {
    const rows: { from: Date | string | null; to: Date | string | null }[] =
      await this.securities.manager.query(
        `SELECT MIN(trade_date) AS from, MAX(trade_date) AS to
         FROM market_data.daily_prices`,
      );
    return { from: toIsoDate(rows[0].from), to: toIsoDate(rows[0].to) };
  }

  async list(query: ListSecuritiesQueryDto): Promise<SecurityListResult> {
    let sectorId: string | undefined;
    if (query.sector !== undefined) {
      const sector = await this.sectors.findOne({
        where: { gicsCode: query.sector },
      });
      if (!sector) {
        throw new ValidationFailedException([
          { field: 'sector', reason: 'must be a known GICS sector code' },
        ]);
      }
      sectorId = sector.sectorId;
    }

    const range = await this.priceDateRange();

    // Every row on a page is priced at this one date. Pricing each security at
    // its own last traded day instead would silently mix dates across the
    // table, making the change column incomparable between rows.
    let asOf = query.as_of ?? range.to;
    if (query.as_of !== undefined && range.from !== null && range.to !== null) {
      if (query.as_of < range.from || query.as_of > range.to) {
        throw new ValidationFailedException([
          {
            field: 'as_of',
            reason: `must fall between ${range.from} and ${range.to}`,
          },
        ]);
      }

      // Weekends and holidays hold no prices, and roughly 40% of calendar dates
      // in a year are non-trading. Rather than answering those with a page of
      // nulls, settle back to the most recent session on or before the request;
      // meta.as_of reports the date actually used so the client can show it.
      const settled: { trade_date: Date | string | null }[] =
        await this.securities.manager.query(
          `SELECT MAX(trade_date) AS trade_date
           FROM market_data.daily_prices
           WHERE trade_date <= $1::date`,
          [query.as_of],
        );
      asOf = toIsoDate(settled[0].trade_date) ?? asOf;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (sectorId !== undefined) {
      params.push(sectorId);
      conditions.push(`s.sector_id = $${params.length}`);
    }
    if (query.search !== undefined) {
      params.push(`${query.search}%`);
      const prefixParam = params.length;
      params.push(`%${query.search}%`);
      const substringParam = params.length;
      conditions.push(
        `(s.symbol ILIKE $${prefixParam} OR s.company_name ILIKE $${substringParam})`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn =
      query.sort === 'company_name' ? 's.company_name' : 's.symbol';

    const countRows: { total: string }[] = await this.securities.manager.query(
      `SELECT COUNT(*)::text AS total FROM market_data.securities s ${where}`,
      params,
    );

    params.push(asOf);
    const asOfParam = `$${params.length}`;

    const listParams = [
      ...params,
      query.page_size,
      (query.page - 1) * query.page_size,
    ];
    const rows: RawSecurityRow[] = await this.securities.manager.query(
      `
      WITH priced AS (
        SELECT security_id, close, volume
        FROM market_data.daily_prices
        WHERE trade_date = ${asOfParam}::date
      ),
      prior AS (
        SELECT DISTINCT ON (security_id) security_id, close AS prev_close
        FROM market_data.daily_prices
        WHERE trade_date < ${asOfParam}::date
        ORDER BY security_id, trade_date DESC
      )
      SELECT
        s.symbol, s.company_name,
        sec.gics_code, sec.sector_name,
        s.shares_outstanding, s.data_from, s.data_to,
        priced.close AS price, priced.volume AS volume,
        prior.prev_close AS prev_close,
        mr.pe_ratio AS pe_ratio
      FROM market_data.securities s
      LEFT JOIN market_data.sectors sec ON sec.sector_id = s.sector_id
      LEFT JOIN priced ON priced.security_id = s.security_id
      LEFT JOIN prior ON prior.security_id = s.security_id
      LEFT JOIN market_data.market_ratios mr
        ON mr.security_id = s.security_id AND mr.valid_to IS NULL
      ${where}
      ORDER BY ${sortColumn} ASC, s.symbol ASC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
      `,
      listParams,
    );

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
        as_of: asOf,
        available_from: range.from,
        available_to: range.to,
      },
    };
  }

  private toListItem(row: RawSecurityRow): SecurityListItem {
    const price = row.price !== null ? Number(row.price) : null;
    const prevClose = row.prev_close !== null ? Number(row.prev_close) : null;
    const change =
      price !== null && prevClose !== null ? round(price - prevClose, 4) : null;
    const changePct =
      change !== null && prevClose !== null && prevClose !== 0
        ? round((change / prevClose) * 100, 2)
        : null;

    return {
      symbol: row.symbol,
      company_name: row.company_name,
      sector: row.gics_code
        ? { gics_code: row.gics_code, name: row.sector_name as string }
        : null,
      shares_outstanding:
        row.shares_outstanding !== null ? Number(row.shares_outstanding) : null,
      data_from: toIsoDate(row.data_from),
      data_to: toIsoDate(row.data_to),
      price,
      change,
      change_pct: changePct,
      volume: row.volume !== null ? Number(row.volume) : null,
      pe_ratio: row.pe_ratio !== null ? Number(row.pe_ratio) : null,
    };
  }
}

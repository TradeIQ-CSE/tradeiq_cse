import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security } from '../entities/security.entity';
import { Sector } from '../entities/sector.entity';
import {
  SecurityNotFoundException,
  ValidationFailedException,
} from '../common/errors/api-exception';
import { resolveMarketDate, toIsoDate } from '../common/market-date';
import { ListSecuritiesQueryDto } from './dto/list-securities-query.dto';
import { OhlcvQueryDto, OhlcvTimeframe } from './dto/ohlcv-query.dto';

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

export interface SecurityDetailResult {
  data: {
    symbol: string;
    company_name: string;
    cse_code: string | null;
    sector: { gics_code: string; name: string } | null;
    shares_outstanding: number | null;
    data_from: string | null;
    data_to: string | null;
    listing_status: 'listed' | 'suspended' | 'delisted';
    latest: {
      trade_date: string;
      close: number;
      change: number | null;
      change_pct: number | null;
      volume: number;
    } | null;
    ratios: {
      valid_from: string;
      pe_ratio: number | null;
      pb_ratio: number | null;
    } | null;
  };
}

export interface DailyOhlcvBar {
  date: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  adjusted_close: number | null;
  volume: number;
}

export interface AggregateOhlcvBar {
  period_start: string;
  period_end: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResult {
  data: {
    symbol: string;
    timeframe: OhlcvTimeframe;
    from: string | null;
    to: string | null;
    bars: (DailyOhlcvBar | AggregateOhlcvBar)[];
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

interface RawSecurityDetailRow {
  symbol: string;
  company_name: string;
  cse_code: string | null;
  gics_code: string | null;
  sector_name: string | null;
  shares_outstanding: string | null;
  data_from: Date | string | null;
  data_to: Date | string | null;
  event_type: 'listed' | 'suspended' | 'resumed' | 'delisted' | null;
  trade_date: Date | string | null;
  close: string | null;
  volume: string | null;
  prev_close: string | null;
  valid_from: Date | string | null;
  pe_ratio: string | null;
  pb_ratio: string | null;
}

interface RawDailyOhlcvRow {
  date: Date | string;
  open: string | null;
  high: string;
  low: string;
  close: string;
  adjusted_close: string | null;
  volume: string;
}

interface RawAggregateOhlcvRow {
  period_start: Date | string;
  period_end: Date | string;
  open: string | null;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function oneCalendarYearBefore(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const targetYear = year - 1;
  const candidate = new Date(Date.UTC(targetYear, month - 1, date));

  // JavaScript rolls 2024-02-29 back to 2023-03-01. A calendar-year window
  // should clamp that one exceptional case to the last day of February.
  if (candidate.getUTCMonth() !== month - 1) {
    candidate.setUTCDate(0);
  }
  return candidate.toISOString().slice(0, 10);
}

@Injectable()
export class SecuritiesService {
  constructor(
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(Sector)
    private readonly sectors: Repository<Sector>,
  ) {}

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

    // Every row on a page is priced at this one date. Pricing each security at
    // its own last traded day instead would silently mix dates across the
    // table, making the change column incomparable between rows.
    const marketDate = await resolveMarketDate(
      this.securities.manager,
      query.as_of,
    );
    const asOf = marketDate.asOf;

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
        available_from: marketDate.availableFrom,
        available_to: marketDate.availableTo,
      },
    };
  }

  async detail(symbol: string): Promise<SecurityDetailResult> {
    const rows: RawSecurityDetailRow[] = await this.securities.manager.query(
      `SELECT
         s.symbol, s.company_name, s.cse_code,
         sec.gics_code, sec.sector_name,
         s.shares_outstanding, s.data_from, s.data_to,
         event.event_type,
         latest.trade_date, latest.close, latest.volume,
         previous.prev_close,
         ratio.valid_from, ratio.pe_ratio, ratio.pb_ratio
       FROM market_data.securities s
       LEFT JOIN market_data.sectors sec ON sec.sector_id = s.sector_id
       LEFT JOIN LATERAL (
         SELECT le.event_type
         FROM market_data.listing_events le
         WHERE le.security_id = s.security_id
         ORDER BY le.event_date DESC, le.event_id DESC
         LIMIT 1
       ) event ON true
       LEFT JOIN LATERAL (
         SELECT p.trade_date, p.close, p.volume
         FROM market_data.daily_prices p
         WHERE p.security_id = s.security_id
         ORDER BY p.trade_date DESC
         LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT p.close AS prev_close
         FROM market_data.daily_prices p
         WHERE p.security_id = s.security_id
           AND p.trade_date < latest.trade_date
         ORDER BY p.trade_date DESC
         LIMIT 1
       ) previous ON true
       LEFT JOIN LATERAL (
         SELECT mr.valid_from, mr.pe_ratio, mr.pb_ratio
         FROM market_data.market_ratios mr
         WHERE mr.security_id = s.security_id AND mr.valid_to IS NULL
         ORDER BY mr.valid_from DESC, mr.ratio_id DESC
         LIMIT 1
       ) ratio ON true
       WHERE lower(s.symbol) = lower($1)
       LIMIT 1`,
      [symbol],
    );

    if (rows.length === 0) {
      throw new SecurityNotFoundException();
    }

    const row = rows[0];
    const close = row.close === null ? null : Number(row.close);
    const previousClose =
      row.prev_close === null ? null : Number(row.prev_close);
    const change =
      close !== null && previousClose !== null
        ? round(close - previousClose, 4)
        : null;
    const changePct =
      change !== null && previousClose !== null && previousClose !== 0
        ? round((change / previousClose) * 100, 2)
        : null;
    const listingStatus =
      row.event_type === 'suspended' || row.event_type === 'delisted'
        ? row.event_type
        : 'listed';

    return {
      data: {
        symbol: row.symbol,
        company_name: row.company_name,
        cse_code: row.cse_code,
        sector: row.gics_code
          ? { gics_code: row.gics_code, name: row.sector_name as string }
          : null,
        shares_outstanding:
          row.shares_outstanding === null
            ? null
            : Number(row.shares_outstanding),
        data_from: toIsoDate(row.data_from),
        data_to: toIsoDate(row.data_to),
        listing_status: listingStatus,
        latest:
          close === null
            ? null
            : {
                trade_date: toIsoDate(row.trade_date) as string,
                close,
                change,
                change_pct: changePct,
                volume: Number(row.volume),
              },
        ratios:
          row.valid_from === null
            ? null
            : {
                valid_from: toIsoDate(row.valid_from) as string,
                pe_ratio: row.pe_ratio === null ? null : Number(row.pe_ratio),
                pb_ratio: row.pb_ratio === null ? null : Number(row.pb_ratio),
              },
      },
    };
  }

  async ohlcv(symbol: string, query: OhlcvQueryDto): Promise<OhlcvResult> {
    const securityRows: { security_id: string; symbol: string }[] =
      await this.securities.manager.query(
        `SELECT security_id, symbol
         FROM market_data.securities
         WHERE lower(symbol) = lower($1)
         LIMIT 1`,
        [symbol],
      );
    if (securityRows.length === 0) {
      throw new SecurityNotFoundException();
    }

    const security = securityRows[0];
    const timeframe = query.timeframe ?? 'daily';
    let to = query.to;
    if (to === undefined) {
      const latestRows: { to: Date | string | null }[] =
        await this.securities.manager.query(
          `SELECT max(trade_date) AS "to" FROM market_data.daily_prices`,
        );
      to = toIsoDate(latestRows[0]?.to ?? null) ?? undefined;
    }

    if (to === undefined) {
      if (query.from !== undefined) {
        throw new ValidationFailedException([
          {
            field: 'to',
            reason: 'cannot be defaulted because no market data is available',
          },
        ]);
      }
      return {
        data: {
          symbol: security.symbol,
          timeframe,
          from: null,
          to: null,
          bars: [],
        },
      };
    }

    const from = query.from ?? oneCalendarYearBefore(to);
    if (from > to) {
      throw new ValidationFailedException([
        { field: 'from', reason: 'must be before or equal to to' },
      ]);
    }

    if (timeframe === 'daily') {
      const rows: RawDailyOhlcvRow[] = await this.securities.manager.query(
        `SELECT
           trade_date AS date, open, high, low, close, adjusted_close, volume
         FROM market_data.daily_prices
         WHERE security_id = $1
           AND trade_date BETWEEN $2::date AND $3::date
         ORDER BY trade_date ASC`,
        [security.security_id, from, to],
      );
      return {
        data: {
          symbol: security.symbol,
          timeframe,
          from,
          to,
          bars: rows.map((row) => ({
            date: toIsoDate(row.date) as string,
            open: row.open === null ? null : Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            adjusted_close:
              row.adjusted_close === null ? null : Number(row.adjusted_close),
            volume: Number(row.volume),
          })),
        },
      };
    }

    const rows: RawAggregateOhlcvRow[] = await this.securities.manager.query(
      `SELECT period_start, period_end, open, high, low, close, volume
         FROM market_data.price_aggregates
         WHERE security_id = $1
           AND period_type = $2
           AND period_start >= $3::date
           AND period_end <= $4::date
         ORDER BY period_start ASC`,
      [security.security_id, timeframe, from, to],
    );
    return {
      data: {
        symbol: security.symbol,
        timeframe,
        from,
        to,
        bars: rows.map((row) => ({
          period_start: toIsoDate(row.period_start) as string,
          period_end: toIsoDate(row.period_end) as string,
          open: row.open === null ? null : Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume),
        })),
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

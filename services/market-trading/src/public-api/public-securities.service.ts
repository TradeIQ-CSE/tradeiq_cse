import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sector } from '../entities/sector.entity';
import { Security } from '../entities/security.entity';
import { ValidationFailedException } from '../common/errors/api-exception';
import { toIsoDate } from '../common/market-date';
import { SecuritiesService } from '../securities/securities.service';
import { PublicListSecuritiesQueryDto } from './dto/public-list-securities-query.dto';
import { PublicOhlcvQueryDto } from './dto/public-ohlcv-query.dto';

// docs/api/public-api-v1.md §6.1's `listing_status` values.
export type PublicListingStatus = 'listed' | 'suspended' | 'delisted';

export interface PublicSecurity {
  symbol: string;
  company_name: string;
  cse_code: string | null;
  sector: { gics_code: string; name: string } | null;
  listing_status: PublicListingStatus;
  shares_outstanding: number | null;
  data_from: string | null;
  data_to: string | null;
}

export interface PublicSecurityListResult {
  data: PublicSecurity[];
  meta: { page: number; page_size: number; total: number };
}

export interface PublicSecurityDetailResult {
  data: PublicSecurity;
}

export type PublicDailyBar = {
  date: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PublicAggregateBar = {
  period_start: string;
  period_end: string;
  open: number | null;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export interface PublicOhlcvResult {
  data: {
    symbol: string;
    timeframe: 'daily' | 'weekly' | 'monthly';
    from: string | null;
    to: string | null;
    bars: (PublicDailyBar | PublicAggregateBar)[];
  };
  meta: { page: number; page_size: number; total: number };
}

// Raw row from list()'s own query below — cse_code and listing_status are not
// part of the internal SecuritiesService.list() shape (endpoint-catalogue-v0
// §3 has no listing_status, and the internal list is priced), so this is a
// dedicated query rather than a reuse of that one.
export interface RawPublicSecurityRow {
  symbol: string;
  company_name: string;
  cse_code: string | null;
  gics_code: string | null;
  sector_name: string | null;
  shares_outstanding: string | null;
  data_from: Date | string | null;
  data_to: Date | string | null;
  event_type: 'listed' | 'suspended' | 'resumed' | 'delisted' | null;
}

// Escapes ILIKE's own special characters (\, %, _) in user-supplied search
// text so it is matched literally — paired with `ESCAPE '\'` on both ILIKE
// clauses below. Without this, `search=%` (or `_`) would match every row
// instead of a literal percent sign.
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toListingStatus(
  eventType: RawPublicSecurityRow['event_type'],
): PublicListingStatus {
  return eventType === 'suspended' || eventType === 'delisted'
    ? eventType
    : 'listed';
}

export function toPublicSecurity(row: RawPublicSecurityRow): PublicSecurity {
  return {
    symbol: row.symbol,
    company_name: row.company_name,
    cse_code: row.cse_code,
    sector: row.gics_code
      ? { gics_code: row.gics_code, name: row.sector_name as string }
      : null,
    listing_status: toListingStatus(row.event_type),
    shares_outstanding:
      row.shares_outstanding === null ? null : Number(row.shares_outstanding),
    data_from: toIsoDate(row.data_from),
    data_to: toIsoDate(row.data_to),
  };
}

@Injectable()
export class PublicSecuritiesService {
  constructor(
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(Sector)
    private readonly sectors: Repository<Sector>,
    // Reused for the OHLCV route (aggregation, clamping, defaulting, 404) and
    // the detail route (cse_code/listing_status, exactly the rule this
    // list() query below re-implements for a whole page at once), so an
    // internal change to either can never silently diverge from this copy.
    private readonly internalSecurities: SecuritiesService,
  ) {}

  async list(
    query: PublicListSecuritiesQueryDto,
  ): Promise<PublicSecurityListResult> {
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

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (sectorId !== undefined) {
      params.push(sectorId);
      conditions.push(`s.sector_id = $${params.length}`);
    }
    if (query.search !== undefined) {
      const escaped = escapeLikePattern(query.search);
      params.push(`${escaped}%`);
      const prefixParam = params.length;
      params.push(`%${escaped}%`);
      const substringParam = params.length;
      conditions.push(
        `(s.symbol ILIKE $${prefixParam} ESCAPE '\\' OR s.company_name ILIKE $${substringParam} ESCAPE '\\')`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows: { total: string }[] = await this.securities.manager.query(
      `SELECT COUNT(*)::text AS total FROM market_data.securities s ${where}`,
      params,
    );

    const listParams = [
      ...params,
      query.page_size,
      (query.page - 1) * query.page_size,
    ];
    // One LATERAL lookup of each security's most recent listing_events row —
    // the same rule SecuritiesService.detail() uses — so a page of N
    // securities costs one query, not N.
    const rows: RawPublicSecurityRow[] = await this.securities.manager.query(
      `
      SELECT
        s.symbol, s.company_name, s.cse_code,
        sec.gics_code, sec.sector_name,
        s.shares_outstanding, s.data_from, s.data_to,
        event.event_type
      FROM market_data.securities s
      LEFT JOIN market_data.sectors sec ON sec.sector_id = s.sector_id
      LEFT JOIN LATERAL (
        SELECT le.event_type
        FROM market_data.listing_events le
        WHERE le.security_id = s.security_id
        ORDER BY le.event_date DESC, le.event_id DESC
        LIMIT 1
      ) event ON true
      ${where}
      ORDER BY s.symbol ASC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
      `,
      listParams,
    );

    return {
      data: rows.map(toPublicSecurity),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(countRows[0].total),
      },
    };
  }

  async detail(symbol: string): Promise<PublicSecurityDetailResult> {
    // Reused rather than re-queried: this is exactly the computation
    // (cse_code, listing_status from the latest listing_events row,
    // SECURITY_NOT_FOUND on a miss) the brief requires, and duplicating it
    // here could silently drift from the internal detail endpoint's answer.
    const internal = await this.internalSecurities.detail(symbol);
    const row = internal.data;
    return {
      data: {
        symbol: row.symbol,
        company_name: row.company_name,
        cse_code: row.cse_code,
        sector: row.sector,
        listing_status: row.listing_status,
        shares_outstanding: row.shares_outstanding,
        data_from: row.data_from,
        data_to: row.data_to,
      },
    };
  }

  async ohlcv(
    symbol: string,
    query: PublicOhlcvQueryDto,
  ): Promise<PublicOhlcvResult> {
    // Reused for the symbol lookup/404, from/to defaulting and validation,
    // and the daily/weekly/monthly aggregation itself (§6.3's "clamps each
    // bar to the requested window" behaviour) — public-api-v1.md §6.3 asks
    // for the same aggregation the internal endpoint already implements.
    const internal = await this.internalSecurities.ohlcv(symbol, {
      timeframe: query.timeframe,
      from: query.from,
      to: query.to,
    });

    const allBars = internal.data.bars.map((bar) =>
      'date' in bar
        ? ({
            date: bar.date,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          } satisfies PublicDailyBar)
        : ({
            period_start: bar.period_start,
            period_end: bar.period_end,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          } satisfies PublicAggregateBar),
    );

    const start = (query.page - 1) * query.page_size;
    const bars = allBars.slice(start, start + query.page_size);

    return {
      data: {
        symbol: internal.data.symbol,
        timeframe: internal.data.timeframe,
        from: internal.data.from,
        to: internal.data.to,
        bars,
      },
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: allBars.length,
      },
    };
  }
}

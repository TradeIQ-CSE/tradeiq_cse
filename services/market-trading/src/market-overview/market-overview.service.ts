import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ValidationFailedException } from '../common/errors/api-exception';
import { resolveMarketDate } from '../common/market-date';
import { Sector } from '../entities/sector.entity';
import { Security } from '../entities/security.entity';
import { MarketOverviewQueryDto } from './dto/market-overview-query.dto';

const MARKET_CAP_LKR = {
  mid: '5000000000',
  large: '20000000000',
} as const;

interface RawOverviewRow {
  symbol: string;
  company_name: string;
  close: string;
  change: string | null;
  change_pct: string | null;
  change_pct_sort: string | null;
  volume: string | null;
}

export interface MarketOverviewItem {
  rank: number;
  symbol: string;
  company_name: string;
  close: number;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
}

export interface MarketOverviewResult {
  data: {
    as_of: string | null;
    gainers: MarketOverviewItem[];
    losers: MarketOverviewItem[];
    most_active: MarketOverviewItem[];
  };
}

type UnrankedOverviewItem = Omit<MarketOverviewItem, 'rank'>;
type OverviewCandidate = UnrankedOverviewItem & {
  change_pct_sort: number | null;
};

function compareSymbol(
  left: UnrankedOverviewItem,
  right: UnrankedOverviewItem,
): number {
  if (left.symbol < right.symbol) return -1;
  if (left.symbol > right.symbol) return 1;
  return 0;
}

function compareVolumeDesc(
  left: UnrankedOverviewItem,
  right: UnrankedOverviewItem,
): number {
  if (left.volume === null && right.volume === null) return 0;
  if (left.volume === null) return 1;
  if (right.volume === null) return -1;
  return right.volume - left.volume;
}

function tieBreak(
  left: UnrankedOverviewItem,
  right: UnrankedOverviewItem,
): number {
  return compareVolumeDesc(left, right) || compareSymbol(left, right);
}

function withRanks(
  rows: OverviewCandidate[],
  limit: number,
): MarketOverviewItem[] {
  return rows.slice(0, limit).map((candidate, index) => ({
    rank: index + 1,
    symbol: candidate.symbol,
    company_name: candidate.company_name,
    close: candidate.close,
    change: candidate.change,
    change_pct: candidate.change_pct,
    volume: candidate.volume,
  }));
}

@Injectable()
export class MarketOverviewService {
  constructor(
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(Sector)
    private readonly sectors: Repository<Sector>,
  ) {}

  async getOverview(
    query: MarketOverviewQueryDto,
  ): Promise<MarketOverviewResult> {
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

    const marketDate = await resolveMarketDate(
      this.securities.manager,
      query.as_of,
    );
    if (marketDate.asOf === null) {
      return {
        data: {
          as_of: null,
          gainers: [],
          losers: [],
          most_active: [],
        },
      };
    }

    const params: unknown[] = [marketDate.asOf];
    const conditions = ['current_price.trade_date = $1::date'];

    if (sectorId !== undefined) {
      params.push(sectorId);
      conditions.push(`s.sector_id = $${params.length}`);
    }

    if (query.market_cap !== undefined) {
      const marketCap = '(s.shares_outstanding::numeric * current_price.close)';
      conditions.push('s.shares_outstanding IS NOT NULL');
      if (query.market_cap === 'large') {
        conditions.push(`${marketCap} >= ${MARKET_CAP_LKR.large}`);
      } else if (query.market_cap === 'mid') {
        conditions.push(
          `${marketCap} >= ${MARKET_CAP_LKR.mid}`,
          `${marketCap} < ${MARKET_CAP_LKR.large}`,
        );
      } else {
        conditions.push(`${marketCap} < ${MARKET_CAP_LKR.mid}`);
      }
    }

    const rows: RawOverviewRow[] = await this.securities.manager.query(
      `
      WITH previous_session AS (
        SELECT MAX(trade_date) AS trade_date
        FROM market_data.daily_prices
        WHERE trade_date < $1::date
      )
      SELECT
        s.symbol,
        s.company_name,
        current_price.close,
        CASE
          WHEN previous_price.close IS NULL THEN NULL
          ELSE ROUND(current_price.close - previous_price.close, 4)
        END AS change,
        CASE
          WHEN previous_price.close IS NULL OR previous_price.close = 0 THEN NULL
          ELSE ROUND(
            ((current_price.close - previous_price.close)
              / previous_price.close) * 100,
            2
          )
        END AS change_pct,
        CASE
          WHEN previous_price.close IS NULL OR previous_price.close = 0 THEN NULL
          ELSE ((current_price.close - previous_price.close)
            / previous_price.close) * 100
        END AS change_pct_sort,
        current_price.volume
      FROM market_data.securities s
      JOIN market_data.daily_prices current_price
        ON current_price.security_id = s.security_id
      LEFT JOIN market_data.daily_prices previous_price
        ON previous_price.security_id = s.security_id
       AND previous_price.trade_date = (SELECT trade_date FROM previous_session)
      WHERE ${conditions.join(' AND ')}
      `,
      params,
    );

    const items = rows.map((row): OverviewCandidate => ({
      symbol: row.symbol,
      company_name: row.company_name,
      close: Number(row.close),
      change: row.change === null ? null : Number(row.change),
      change_pct: row.change_pct === null ? null : Number(row.change_pct),
      change_pct_sort:
        row.change_pct_sort === null ? null : Number(row.change_pct_sort),
      volume: row.volume === null ? null : Number(row.volume),
    }));
    const changeRankable = items.filter(
      (item): item is OverviewCandidate & { change_pct_sort: number } =>
        item.change_pct_sort !== null,
    );
    const volumeRankable = items.filter(
      (item): item is OverviewCandidate & { volume: number } =>
        item.volume !== null,
    );
    const limit = query.limit ?? 10;

    const gainers = [...changeRankable].sort(
      (left, right) =>
        right.change_pct_sort - left.change_pct_sort || tieBreak(left, right),
    );
    const losers = [...changeRankable].sort(
      (left, right) =>
        left.change_pct_sort - right.change_pct_sort || tieBreak(left, right),
    );
    const mostActive = [...volumeRankable].sort(
      (left, right) =>
        compareVolumeDesc(left, right) || compareSymbol(left, right),
    );

    return {
      data: {
        as_of: marketDate.asOf,
        gainers: withRanks(gainers, limit),
        losers: withRanks(losers, limit),
        most_active: withRanks(mostActive, limit),
      },
    };
  }
}

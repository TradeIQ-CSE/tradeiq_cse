import Decimal from 'decimal.js';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PortfolioNotFoundException } from '../common/errors/api-exception';
import { toIsoDate } from '../common/market-date';
import { ListBacktestsQueryDto } from './dto/list-backtests-query.dto';

// The market a portfolio or backtest is compared with. ASPI is the headline;
// S&P SL20 (the 20 largest companies) is the second, shown in the detailed view.
export const BENCHMARKS = ['ASPI', 'SL20'] as const;

// A benchmark level is only used for a day if it was set at most this many
// calendar days before it: enough to cross a weekend and a run of holidays,
// never a data gap. Past that, the comparison is null rather than measured
// against a level from months earlier.
export const MAX_LEVEL_AGE_DAYS = 10;
export type BenchmarkCode = (typeof BENCHMARKS)[number];

export interface BacktestListItem {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  symbol: string;
  company_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  starting_capital: number;
  // The remaining figures are null until a run completes.
  final_equity: number | null;
  total_return_pct: number | null;
  trade_count: number | null;
  // The largest fall from a previous high, as a negative percentage.
  max_drawdown_pct: number | null;
  // ASPI's change between the run's first and last dates.
  aspi_return_pct: number | null;
}

export interface PerformancePoint {
  date: string;
  value: number;
  return_pct: number;
  benchmarks: Record<BenchmarkCode, number | null>;
}

export interface PortfolioPerformance {
  portfolio_id: string;
  starting_capital: number;
  start_date: string | null;
  as_of: string | null;
  benchmarks: { code: BenchmarkCode; name: string }[];
  points: PerformancePoint[];
}

interface RawBacktestRow {
  id: string;
  status: BacktestListItem['status'];
  symbol: string;
  company_name: string | null;
  start_date: Date | string;
  end_date: Date | string;
  created_at: Date | string;
  starting_capital: string;
  final_equity: string | null;
  total_return_pct: string | null;
  trade_count: string | null;
  max_drawdown_pct: string | null;
  aspi_return_pct: string | null;
}

const num = (value: string | null): number | null =>
  value === null ? null : Number(value);

const pct = (value: Decimal): number =>
  value.times(100).toDecimalPlaces(2).toNumber();

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // §3.1 — the caller's saved runs, newest first.
  async listBacktests(
    userId: string,
    query: ListBacktestsQueryDto,
  ): Promise<{
    data: BacktestListItem[];
    meta: { page: number; page_size: number; total: number };
  }> {
    const totals: { total: string }[] = await this.dataSource.query(
      `SELECT COUNT(*)::text AS total FROM market_data.backtest_runs WHERE owner_id = $1`,
      [userId],
    );

    const rows: RawBacktestRow[] = await this.dataSource.query(
      `
      SELECT
        run.id, run.status, run.symbol, s.company_name,
        run.start_date, run.end_date, run.created_at, run.starting_capital,
        result.summary_metrics->>'finalEquity' AS final_equity,
        ROUND((result.summary_metrics->>'totalReturnPct')::numeric, 2)::text AS total_return_pct,
        CASE WHEN result.id IS NULL THEN NULL
             ELSE jsonb_array_length(result.trade_ledger)::text END AS trade_count,
        drawdown.max_drawdown_pct,
        CASE WHEN aspi_start.index_value IS NULL OR aspi_end.index_value IS NULL
               OR aspi_start.index_value = 0 THEN NULL
             ELSE ROUND((aspi_end.index_value / aspi_start.index_value - 1) * 100, 2)::text
        END AS aspi_return_pct
      FROM market_data.backtest_runs run
      LEFT JOIN market_data.securities s ON s.symbol = run.symbol
      LEFT JOIN market_data.backtest_results result ON result.backtest_run_id = run.id
      LEFT JOIN LATERAL (
        SELECT ROUND(MIN(equity / peak - 1) * 100, 2)::text AS max_drawdown_pct
        FROM (
          SELECT (point->>'totalEquity')::numeric AS equity,
                 MAX((point->>'totalEquity')::numeric) OVER (ORDER BY position) AS peak
          FROM jsonb_array_elements(result.equity_curve) WITH ORDINALITY AS curve(point, position)
        ) running
        WHERE peak > 0
      ) drawdown ON result.id IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT index_value FROM market_data.index_values
        WHERE index_code = 'ASPI' AND trade_date <= run.start_date
          AND trade_date >= run.start_date - $4::int
        ORDER BY trade_date DESC LIMIT 1
      ) aspi_start ON true
      LEFT JOIN LATERAL (
        SELECT index_value FROM market_data.index_values
        WHERE index_code = 'ASPI' AND trade_date <= run.end_date
          AND trade_date >= run.end_date - $4::int
        ORDER BY trade_date DESC LIMIT 1
      ) aspi_end ON true
      WHERE run.owner_id = $1
      ORDER BY run.created_at DESC, run.id
      LIMIT $2 OFFSET $3
      `,
      [
        userId,
        query.page_size,
        (query.page - 1) * query.page_size,
        MAX_LEVEL_AGE_DAYS,
      ],
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        symbol: row.symbol,
        company_name: row.company_name,
        start_date: toIsoDate(row.start_date),
        end_date: toIsoDate(row.end_date),
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at,
        starting_capital: Number(row.starting_capital),
        final_equity: num(row.final_equity),
        total_return_pct: num(row.total_return_pct),
        trade_count: num(row.trade_count),
        max_drawdown_pct: num(row.max_drawdown_pct),
        aspi_return_pct: num(row.aspi_return_pct),
      })),
      meta: {
        page: query.page,
        page_size: query.page_size,
        total: Number(totals[0]?.total ?? 0),
      },
    };
  }

  // §3.2 — the portfolio's value at every session's close since it began,
  // rebuilt from what it held that day, beside the market over the same days.
  async portfolioPerformance(
    userId: string,
    portfolioId: string,
  ): Promise<PortfolioPerformance> {
    const owned: { starting_capital: string }[] = await this.dataSource.query(
      `SELECT starting_capital FROM market_data.virtual_portfolios
       WHERE portfolio_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [portfolioId, userId],
    );
    if (owned.length === 0) throw new PortfolioNotFoundException();
    const startingCapital = new Decimal(owned[0].starting_capital);

    // Cash moves on the fill date (orders.service.ts), the same day the shares
    // do, so value = starting cash + every later cash movement up to the day
    // + each holding at its latest close on or before the day. The first point
    // is the session on or before the portfolio's first activity: an order
    // placed today fills at the previous close.
    const rows: { trade_date: Date | string; value: string }[] =
      await this.dataSource.query(
        `
        WITH activity AS (
          SELECT LEAST(
            (SELECT MIN(effective_date) FROM market_data.cash_transactions WHERE portfolio_id = $1),
            (SELECT MIN(fill_date) FROM market_data.fills WHERE portfolio_id = $1)
          ) AS started
        ),
        bounds AS (
          SELECT
            COALESCE(
              (SELECT MAX(trade_date) FROM market_data.daily_prices, activity
               WHERE trade_date <= activity.started),
              (SELECT MIN(trade_date) FROM market_data.daily_prices, activity
               WHERE trade_date >= activity.started)
            ) AS first_day,
            (SELECT MAX(trade_date) FROM market_data.daily_prices) AS last_day
        ),
        days AS (
          SELECT DISTINCT dp.trade_date
          FROM market_data.daily_prices dp, bounds
          WHERE dp.trade_date BETWEEN bounds.first_day AND bounds.last_day
        )
        SELECT
          days.trade_date,
          ($2::numeric
            + COALESCE((
                SELECT SUM(c.amount) FROM market_data.cash_transactions c
                WHERE c.portfolio_id = $1
                  AND c.transaction_type <> 'initial_capital'
                  AND c.effective_date <= days.trade_date
              ), 0)
            + COALESCE((
                SELECT SUM(held.quantity * price.close)
                FROM (
                  SELECT f.symbol,
                         SUM(CASE WHEN o.side = 'buy' THEN f.quantity ELSE -f.quantity END) AS quantity
                  FROM market_data.fills f
                  JOIN market_data.paper_orders o ON o.order_id = f.order_id
                  WHERE f.portfolio_id = $1 AND f.fill_date <= days.trade_date
                  GROUP BY f.symbol
                ) held
                JOIN market_data.securities s ON s.symbol = held.symbol
                CROSS JOIN LATERAL (
                  SELECT dp.close FROM market_data.daily_prices dp
                  WHERE dp.security_id = s.security_id AND dp.trade_date <= days.trade_date
                  ORDER BY dp.trade_date DESC LIMIT 1
                ) price
                WHERE held.quantity <> 0
              ), 0)
          )::text AS value
        FROM days
        ORDER BY days.trade_date
        `,
        [portfolioId, startingCapital.toString()],
      );

    const indices: { index_code: string; index_name: string }[] =
      await this.dataSource.query(
        `SELECT index_code, index_name FROM market_data.indices WHERE index_code = ANY($1)`,
        [BENCHMARKS],
      );
    const benchmarks = BENCHMARKS.filter((code) =>
      indices.some((index) => index.index_code === code),
    ).map((code) => ({
      code,
      name: indices.find((index) => index.index_code === code)!.index_name,
    }));

    if (rows.length === 0) {
      return {
        portfolio_id: portfolioId,
        starting_capital: startingCapital.toNumber(),
        start_date: null,
        as_of: null,
        benchmarks,
        points: [],
      };
    }

    const dates = rows.map((row) => toIsoDate(row.trade_date));
    const series = await this.benchmarkSeries(
      dates[0],
      dates[dates.length - 1],
    );

    // Each benchmark is measured from its level on the first day (or the
    // latest level before it) and carried forward over days it has no value.
    const points = rows.map((row, index): PerformancePoint => {
      const date = dates[index];
      const value = new Decimal(row.value);
      const compared = {} as Record<BenchmarkCode, number | null>;
      for (const code of BENCHMARKS) {
        const levels = series.get(code);
        const base = levels && levelOn(levels, dates[0]);
        const level = levels && levelOn(levels, date);
        compared[code] = base && level ? pct(level.div(base).minus(1)) : null;
      }
      return {
        date,
        value: value.toDecimalPlaces(2).toNumber(),
        return_pct: pct(value.div(startingCapital).minus(1)),
        benchmarks: compared,
      };
    });

    return {
      portfolio_id: portfolioId,
      starting_capital: startingCapital.toNumber(),
      start_date: dates[0],
      as_of: dates[dates.length - 1],
      benchmarks,
      points,
    };
  }

  // Levels from the last value on or before `from` through `to`, ascending.
  private async benchmarkSeries(
    from: string,
    to: string,
  ): Promise<Map<string, { date: string; level: Decimal }[]>> {
    const rows: {
      index_code: string;
      trade_date: Date | string;
      index_value: string;
    }[] = await this.dataSource.query(
      `
      SELECT v.index_code, v.trade_date, v.index_value
      FROM market_data.index_values v
      WHERE v.index_code = ANY($1)
        AND v.trade_date <= $3::date
        AND v.trade_date >= COALESCE((
          SELECT MAX(prior.trade_date) FROM market_data.index_values prior
          WHERE prior.index_code = v.index_code AND prior.trade_date <= $2::date
        ), $2::date)
      ORDER BY v.index_code, v.trade_date
      `,
      [BENCHMARKS, from, to],
    );
    const series = new Map<string, { date: string; level: Decimal }[]>();
    for (const row of rows) {
      const list = series.get(row.index_code) ?? [];
      list.push({
        date: toIsoDate(row.trade_date),
        level: new Decimal(row.index_value),
      });
      series.set(row.index_code, list);
    }
    return series;
  }
}

/**
 * The latest level on or before `date`, or undefined when there is none
 * within MAX_LEVEL_AGE_DAYS — a data gap is reported, not bridged.
 */
export function levelOn(
  levels: readonly { date: string; level: Decimal }[],
  date: string,
): Decimal | undefined {
  let found: { date: string; level: Decimal } | undefined;
  for (const entry of levels) {
    if (entry.date > date) break;
    found = entry;
  }
  if (!found || found.level.isZero()) return undefined;
  const ageDays =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${found.date}T00:00:00Z`)) /
    86_400_000;
  return ageDays <= MAX_LEVEL_AGE_DAYS ? found.level : undefined;
}

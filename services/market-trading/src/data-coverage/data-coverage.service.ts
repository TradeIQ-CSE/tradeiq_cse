import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toIsoDate } from '../common/market-date';
import { detectGaps, DataGap } from './detect-gaps';
import { KNOWN_MARKET_CLOSURES } from './known-market-closures';

export interface CoverageWindow {
  from: string | null;
  to: string | null;
  gaps: DataGap[];
}

export interface DataCoverageResult {
  data: {
    prices: CoverageWindow;
    indices: CoverageWindow;
  };
}

// docs/plans/data-gap-handling.md §1. Ten minutes is short enough that a
// backfill loaded outside the API (seed loader, direct import) shows up on
// its own without a restart, and long enough that the coverage endpoint and
// the per-request backtest check (§2) do not re-scan ~2,100 dates on every
// call.
const CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DataCoverageService {
  constructor(private readonly dataSource: DataSource) {}

  private cached: DataCoverageResult | null = null;
  private cachedAt = 0;
  // Shared by concurrent get() calls that miss the cache at the same time,
  // so a burst of requests (e.g. the coverage endpoint and a backtest
  // submission racing each other) issues one pair of queries rather than
  // one pair per caller.
  private inFlight: Promise<DataCoverageResult> | null = null;
  // Bumped by invalidate(), so a load that was already running when the data
  // changed cannot write its stale result into the cache when it finishes.
  private generation = 0;

  async get(): Promise<DataCoverageResult> {
    if (this.cached && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    const load = this.load().finally(() => {
      // An invalidate() during the load may already have started a newer one.
      if (this.inFlight === load) this.inFlight = null;
    });
    this.inFlight = load;
    return load;
  }

  // Cleared by the EOD and index ingestion services after a successful
  // write, so a newly-loaded day is reflected immediately rather than after
  // the TTL elapses. Also drops any in-flight load: a query already running
  // when invalidate() fires may still return stale rows, so the next get()
  // starts a fresh pair of queries instead of reusing it, and that load's
  // result is never cached.
  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.inFlight = null;
  }

  private async load(): Promise<DataCoverageResult> {
    const generation = this.generation;
    const [priceDates, indexDates] = await Promise.all([
      this.distinctPriceDates(),
      this.distinctIndexDates(),
    ]);

    const result: DataCoverageResult = {
      data: {
        prices: this.toWindow(priceDates),
        indices: this.toWindow(indexDates),
      },
    };
    if (generation === this.generation) {
      this.cached = result;
      this.cachedAt = Date.now();
    }
    return result;
  }

  private async distinctPriceDates(): Promise<string[]> {
    const rows: { trade_date: Date | string }[] = await this.dataSource.query(
      `SELECT DISTINCT trade_date FROM market_data.daily_prices ORDER BY trade_date ASC`,
    );
    return rows.map((row) => toIsoDate(row.trade_date));
  }

  private async distinctIndexDates(): Promise<string[]> {
    const rows: { trade_date: Date | string }[] = await this.dataSource.query(
      `SELECT DISTINCT trade_date FROM market_data.index_values ORDER BY trade_date ASC`,
    );
    return rows.map((row) => toIsoDate(row.trade_date));
  }

  private toWindow(dates: string[]): CoverageWindow {
    if (dates.length === 0) {
      return { from: null, to: null, gaps: [] };
    }
    return {
      from: dates[0],
      to: dates[dates.length - 1],
      gaps: detectGaps(dates, KNOWN_MARKET_CLOSURES),
    };
  }
}

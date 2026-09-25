// docs/api/analytics-v1.md, served by market-trading.

import { authedGet, EnvelopeResult, MARKET_TRADING_API_URL } from '../../lib/authed-api';

export type BenchmarkCode = 'ASPI' | 'SL20';

export interface BacktestSummary {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  symbol: string;
  company_name: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  starting_capital: number;
  final_equity: number | null;
  total_return_pct: number | null;
  trade_count: number | null;
  max_drawdown_pct: number | null;
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

// §3.1
export function listBacktests(page: number, pageSize = 20): Promise<EnvelopeResult<BacktestSummary[]>> {
  return authedGet<BacktestSummary[]>(
    '/analytics/backtests',
    { page, page_size: pageSize },
    MARKET_TRADING_API_URL,
  );
}

// §3.2
export async function getPortfolioPerformance(portfolioId: string): Promise<PortfolioPerformance> {
  return (
    await authedGet<PortfolioPerformance>(
      `/analytics/portfolios/${portfolioId}/performance`,
      undefined,
      MARKET_TRADING_API_URL,
    )
  ).data;
}

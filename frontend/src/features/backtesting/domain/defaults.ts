import { BacktestConfig, FeeConfig, PeriodConfig } from './types';
import { FALLBACK_BACKTEST_MAX_DATE, suggestedBacktestPeriod } from './bounds';
import { DataGap } from '../../../lib/data-gaps';

/** Suggested trailing year within the current backtesting policy. Empty dates signal unavailable history. */
export function defaultBacktestPeriod(dataFrom?: string | null, dataTo?: string | null, gaps: readonly DataGap[] = [], maxDate = FALLBACK_BACKTEST_MAX_DATE): PeriodConfig {
  return suggestedBacktestPeriod(dataFrom, dataTo, gaps, maxDate, 1) ?? { startDate: '', endDate: '' };
}

/**
 * Standard Sri Lanka Colombo Stock Exchange (CSE) statutory fees:
 * Brokerage: 0.640%
 * CSE:       0.084%
 * CDS:       0.024%
 * SEC Cess:  0.072%
 * STL:       0.300%
 * -----------------
 * Total:     1.120% (0.0112)
 */
export const DEFAULT_CSE_FEES: FeeConfig = {
  brokerageRate: 0.0064,
  cseRate: 0.00084,
  cdsRate: 0.00024,
  secCessRate: 0.00072,
  stlRate: 0.003,
};

/**
 * ADR 0007: the validated seed window is 2017–2025. Daily ingestion extends
 * coverage past it. The backtesting policy supplies a separate temporary ceiling.
 */
export const CSE_DATASET_MIN_DATE = '2017-01-01';


export const DEFAULT_STARTING_CAPITAL = 1_000_000; // Rs. 1,000,000 (1M LKR)

export const CAPITAL_PRESETS = [
  { label: 'LKR 100K', value: 100_000 },
  { label: 'LKR 500K', value: 500_000 },
  { label: 'LKR 1M', value: 1_000_000 },
  { label: 'LKR 5M', value: 5_000_000 },
  { label: 'LKR 10M', value: 10_000_000 },
];

export const AVAILABLE_METRICS = [
  { id: 'total_return', name: 'Total return', description: 'How much the portfolio gained or lost overall', default: true },
  { id: 'max_drawdown', name: 'Largest drop', description: 'The biggest fall from a high point along the way', default: true },
  { id: 'win_rate', name: 'Win rate', description: 'The share of trades that made money', default: true },
  { id: 'profit_factor', name: 'Profit factor', description: 'Money made on winning trades compared with money lost on losing ones', default: false },
  { id: 'final_equity', name: 'Final value', description: 'Cash plus the value of shares held at the end', default: true },
  { id: 'trade_count', name: 'Number of trades', description: 'How many buys and sells happened', default: true },
  { id: 'sharpe_ratio', name: 'Sharpe ratio', description: 'Return compared with how bumpy the ride was', default: false },
];

export function createDefaultBacktestConfig(maxDate = FALLBACK_BACKTEST_MAX_DATE): BacktestConfig {
  return {
    security: {
      symbol: '',
      companyName: '',
      sector: null,
      sectorGicsCode: null,
      dataFrom: null,
      dataTo: null,
      price: null,
    },
    period: defaultBacktestPeriod(undefined, undefined, [], maxDate),
    rules: {
      version: '2.0',
      reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
      buy: {
        type: 'period_start',
      },
      sells: [
        { type: 'take_profit_pct', value: 10 },
        { type: 'stop_loss_pct', value: 5 },
        { type: 'end_of_period' },
      ],
    },
    execution: {
      positionSizing: {
        type: 'full_capital',
      },
      fees: { ...DEFAULT_CSE_FEES },
      rounding: {
        shares: 'whole',
      },
      exitPrecedence: 'first_triggered',
      warmupPeriod: 0,
    },
    portfolio: {
      startingCapital: DEFAULT_STARTING_CAPITAL,
    },
    metrics: {
      selected: AVAILABLE_METRICS.filter((m) => m.default).map((m) => m.id),
    },
  };
}

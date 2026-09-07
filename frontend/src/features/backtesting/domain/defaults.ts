import { BacktestConfig, FeeConfig } from './types';

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
 * ADR 0007: Validated seed dataset window is 2017–2025.
 */
export const CSE_DATASET_MIN_DATE = '2017-01-01';
export const CSE_DATASET_MAX_DATE = '2025-12-31';

export const DEFAULT_STARTING_CAPITAL = 1_000_000; // Rs. 1,000,000 (1M LKR)

export const CAPITAL_PRESETS = [
  { label: 'Rs. 100K', value: 100_000 },
  { label: 'Rs. 500K', value: 500_000 },
  { label: 'Rs. 1M', value: 1_000_000 },
  { label: 'Rs. 5M', value: 5_000_000 },
  { label: 'Rs. 10M', value: 10_000_000 },
];

export const AVAILABLE_METRICS = [
  { id: 'total_return', name: 'Total Return (%)', description: 'Overall percentage gain or loss across the period', default: true },
  { id: 'max_drawdown', name: 'Maximum Drawdown (%)', description: 'Largest peak-to-trough decline in portfolio equity', default: true },
  { id: 'win_rate', name: 'Win Rate (%)', description: 'Percentage of completed trades closing in net profit', default: true },
  { id: 'profit_factor', name: 'Profit Factor', description: 'Ratio of gross trading profits to gross trading losses', default: false },
  { id: 'final_equity', name: 'Final Portfolio Equity', description: 'Ending cash plus market value of held shares in LKR', default: true },
  { id: 'trade_count', name: 'Total Trade Count', description: 'Total number of buy and sell transactions executed', default: true },
  { id: 'sharpe_ratio', name: 'Sharpe Ratio', description: 'Risk-adjusted return relative to Sri Lanka risk-free rate', default: false },
];

export function createDefaultBacktestConfig(): BacktestConfig {
  return {
    security: {
      symbol: 'JKH.N0000',
      companyName: 'John Keells Holdings PLC',
      sector: 'Industrial Conglomerates',
      dataFrom: '2017-01-02',
      dataTo: '2025-12-31',
      price: 198.50,
    },
    period: {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    },
    rules: {
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

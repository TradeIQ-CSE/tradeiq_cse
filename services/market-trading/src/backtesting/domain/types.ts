export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PositionSizingType = 'full_capital' | 'percentage' | 'absolute' | 'fixed_quantity';

export interface PositionSizingConfig {
  type: PositionSizingType;
  value?: number; // e.g., 50 for 50%, or amount in cash, or quantity of shares
}

export interface FeeConfig {
  brokerageRate: number; // e.g., 0.0064 (0.64%)
  cseRate: number;       // e.g., 0.00084 (0.084%)
  cdsRate: number;       // e.g., 0.00024 (0.024%)
  secCessRate: number;   // e.g., 0.00072 (0.072%)
  stlRate: number;       // e.g., 0.00300 (0.3%)
}

export type BuyConditionType =
  | 'period_start'
  | 'price_falls_to'
  | 'price_falls_pct_from_period_start';

export type SellConditionType =
  | 'target_price'
  | 'take_profit_pct'
  | 'stop_loss_pct'
  | 'end_of_period';

export interface BuyCondition {
  type: BuyConditionType;
  value?: number; // threshold price or percentage
}

export interface SellCondition {
  type: SellConditionType;
  value?: number; // threshold price or percentage
}

export interface RuleSet {
  version: string;
  buyCondition: BuyCondition;
  sellConditions: SellCondition[];
}

export interface BacktestInput {
  bars: DailyBar[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  initialCapital: number;
  positionSizing: PositionSizingConfig;
  feeConfig: FeeConfig;
  rules: RuleSet;
  warmupPeriod?: number; // Optional number of warmup bars required before startDate
}

export interface FeeBreakdown {
  brokerage: number;
  cse: number;
  cds: number;
  secCess: number;
  stl: number;
  total: number;
}

export interface TradeLedgerEntry {
  id: number; // 1-based sequential ID
  date: string;
  type: 'BUY' | 'SELL';
  executionPrice: number;
  quantity: number;
  grossValue: number;
  fees: FeeBreakdown;
  netCashFlow: number; // Negative for BUY (debit), positive for SELL (credit)
  reason: string;
}

export interface EquityCurvePoint {
  date: string;
  cash: number;
  positionQuantity: number;
  positionMarketValue: number;
  totalEquity: number;
}

export interface BacktestResult {
  initialCapital: number;
  finalCash: number;
  finalEquity: number;
  trades: TradeLedgerEntry[];
  equityCurve: EquityCurvePoint[];
}

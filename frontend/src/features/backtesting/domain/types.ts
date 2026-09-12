export interface SecuritySelection {
  symbol: string;
  companyName?: string;
  sector?: string | null;
  dataFrom?: string | null;
  dataTo?: string | null;
  price?: number | null;
}

export interface PeriodConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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
  value?: number;
}

export interface SellCondition {
  type: SellConditionType;
  value?: number;
}

export interface RulesConfig {
  buy: BuyCondition;
  sells: SellCondition[];
}

export type PositionSizingType =
  | 'full_capital'
  | 'percentage'
  | 'absolute'
  | 'fixed_quantity';

export interface PositionSizingConfig {
  type: PositionSizingType;
  value?: number;
}

export interface FeeConfig {
  brokerageRate: number; // e.g. 0.0064 (0.64%)
  cseRate: number; // e.g. 0.00084 (0.084%)
  cdsRate: number; // e.g. 0.00024 (0.024%)
  secCessRate: number; // e.g. 0.00072 (0.072%)
  stlRate: number; // e.g. 0.00300 (0.30%)
}

export interface RoundingConfig {
  shares: 'whole';
}

export interface ExecutionConfig {
  positionSizing: PositionSizingConfig;
  fees: FeeConfig;
  rounding: RoundingConfig;
  exitPrecedence: 'first_triggered';
  warmupPeriod?: number;
}

export interface PortfolioConfig {
  startingCapital: number;
}

export interface MetricsConfig {
  selected: string[];
}

export interface BacktestConfig {
  security: SecuritySelection;
  period: PeriodConfig;
  rules: RulesConfig;
  execution: ExecutionConfig;
  portfolio: PortfolioConfig;
  metrics: MetricsConfig;
}

export type StepKey =
  | 'security'
  | 'period'
  | 'rules'
  | 'execution'
  | 'portfolio'
  | 'metrics'
  | 'review';

export interface ValidationError {
  step: StepKey;
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface CreateBacktestRunRequest {
  symbol: string;
  startDate: string;
  endDate: string;
  startingCapital: number;
  rule: {
    buy: {
      type: string;
      value?: number;
    };
    sell: Array<{
      type: string;
      value?: number;
    }>;
  };
  feeConfig?: FeeConfig;
  positionSizing?: PositionSizingConfig;
  warmupPeriod?: number;
}

export interface CreateBacktestRunResponse {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface BacktestStatusResponse {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  symbol?: string;
  startDate?: string;
  endDate?: string;
  startingCapital?: number;
  ruleConfig?: unknown;
  executionAssumptions?: unknown;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface FeeBreakdown {
  brokerage?: number;
  cse?: number;
  cds?: number;
  secCess?: number;
  stl?: number;
  total: number;
}

export interface TradeLedgerEntry {
  id: number | string;
  date: string;
  type: 'BUY' | 'SELL';
  executionPrice: number;
  quantity: number;
  grossValue?: number;
  fees: number | FeeBreakdown;
  netCashFlow?: number;
  reason?: string;
  realizedPnl?: number;
}

export interface EquityCurvePoint {
  date: string;
  cash?: number;
  positionQuantity?: number;
  positionMarketValue?: number;
  totalEquity: number;
}

export interface BacktestResultResponse {
  initialCapital: number;
  finalCash: number;
  finalEquity: number;
  totalReturnPct?: number;
  maxDrawdownPct?: number;
  volatilityPct?: number;
  tradeCount?: number;
  winRatePct?: number;
  trades: TradeLedgerEntry[];
  equityCurve: EquityCurvePoint[];
}

export type BacktestRunDetails = BacktestStatusResponse;

export type BacktestSummaryMetrics = Pick<
  BacktestResultResponse,
  | 'initialCapital'
  | 'finalCash'
  | 'finalEquity'
  | 'totalReturnPct'
  | 'maxDrawdownPct'
  | 'volatilityPct'
  | 'tradeCount'
  | 'winRatePct'
>;



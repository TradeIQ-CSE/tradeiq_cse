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
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
}

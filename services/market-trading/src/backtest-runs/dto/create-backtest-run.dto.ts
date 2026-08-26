export interface RuleConditionDto {
  type: string;
  value?: number;
}

export interface RuleConfigDto {
  buy: RuleConditionDto;
  sell: RuleConditionDto[];
}

export interface FeeConfigDto {
  brokerageRate?: number;
  cseRate?: number;
  cdsRate?: number;
  secCessRate?: number;
  stlRate?: number;
}

export interface PositionSizingDto {
  type: string;
  value?: number;
}

export interface CreateBacktestRunDto {
  symbol: string;
  startDate: string;
  endDate: string;
  startingCapital: number;
  rule: RuleConfigDto;
  feeConfig?: FeeConfigDto;
  positionSizing?: PositionSizingDto;
  warmupPeriod?: number;
}

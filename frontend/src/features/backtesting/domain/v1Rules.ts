import { BuyConditionType, SellConditionType } from './types';

export interface BuyRuleMeta {
  type: BuyConditionType;
  label: string;
  description: string;
  glyph: string;
  requiresValue: boolean;
  valueLabel?: string;
  valueSuffix?: string;
  valuePlaceholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SellRuleMeta {
  type: SellConditionType;
  label: string;
  description: string;
  glyph: string;
  requiresValue: boolean;
  valueLabel?: string;
  valueSuffix?: string;
  valuePlaceholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * ADR 0002: Rule-set DSL v1 is strictly price-based.
 * Exactly 1 buy condition is allowed.
 */
export const V1_BUY_RULES: BuyRuleMeta[] = [
  {
    type: 'period_start',
    label: 'Period Start',
    description: 'Execute buy order on the first trading bar of the simulation period at the opening price.',
    glyph: '▶',
    requiresValue: false,
  },
  {
    type: 'price_falls_pct_from_period_start',
    label: 'Price Falls by %',
    description: 'Buy when price drops by a specified percentage from the period reference price.',
    glyph: '↓',
    requiresValue: true,
    valueLabel: 'Drop Percentage',
    valueSuffix: '%',
    valuePlaceholder: '5',
    min: 0.1,
    max: 99.9,
    step: 0.5,
  },
  {
    type: 'price_falls_to',
    label: 'Price Falls to Target (LKR)',
    description: 'Buy when price falls to or below a fixed target price in Sri Lankan Rupees.',
    glyph: '🎯',
    requiresValue: true,
    valueLabel: 'Target Entry Price',
    valueSuffix: 'LKR',
    valuePlaceholder: '120.00',
    min: 0.01,
    step: 0.25,
  },
];

/**
 * ADR 0002: Rule-set DSL v1 sell conditions.
 * At least 1 sell condition is required. First triggered sell rule wins.
 */
export const V1_SELL_RULES: SellRuleMeta[] = [
  {
    type: 'take_profit_pct',
    label: 'Take Profit (%)',
    description: 'Exit position when price gains reach the profit target percentage above buy price.',
    glyph: '◎',
    requiresValue: true,
    valueLabel: 'Take Profit Target',
    valueSuffix: '%',
    valuePlaceholder: '10',
    min: 0.1,
    max: 1000,
    step: 0.5,
  },
  {
    type: 'stop_loss_pct',
    label: 'Stop Loss (%)',
    description: 'Exit position when price drops to the maximum allowable loss percentage below buy price.',
    glyph: '⊘',
    requiresValue: true,
    valueLabel: 'Stop Loss Limit',
    valueSuffix: '%',
    valuePlaceholder: '5',
    min: 0.1,
    max: 99.9,
    step: 0.5,
  },
  {
    type: 'target_price',
    label: 'Target Exit Price (LKR)',
    description: 'Exit position when price hits or exceeds a fixed target price in Sri Lankan Rupees.',
    glyph: '🏁',
    requiresValue: true,
    valueLabel: 'Target Exit Price',
    valueSuffix: 'LKR',
    valuePlaceholder: '150.00',
    min: 0.01,
    step: 0.25,
  },
  {
    type: 'end_of_period',
    label: 'End of Period',
    description: 'Close position automatically on the final trading session of the simulation window.',
    glyph: '⇥',
    requiresValue: false,
  },
];

/**
 * Technical indicators strictly excluded from v1 executable rules (per ADR 0002 / SRS 3.1.1.7).
 * Exposed only as informational metadata to confirm they are not valid executable strategies.
 */
export const DISALLOWED_INDICATOR_STRATEGIES = [
  { name: 'Simple Moving Average (SMA)', code: 'SMA', reason: 'Chart overlay only in v1. DSL v2 candidate.' },
  { name: 'Exponential Moving Average (EMA)', code: 'EMA', reason: 'Chart overlay only in v1. DSL v2 candidate.' },
  { name: 'Relative Strength Index (RSI)', code: 'RSI', reason: 'Chart overlay only in v1. DSL v2 candidate.' },
  { name: 'Moving Average Convergence Divergence (MACD)', code: 'MACD', reason: 'Chart overlay only in v1. DSL v2 candidate.' },
  { name: 'Bollinger Bands (BB)', code: 'BB', reason: 'Chart overlay only in v1. DSL v2 candidate.' },
] as const;

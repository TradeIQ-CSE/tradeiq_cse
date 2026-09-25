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
    label: 'On the first day',
    description: 'Buy on the first trading day, at the opening price',
    glyph: '▶',
    requiresValue: false,
  },
  {
    type: 'price_falls_pct_from_period_start',
    label: 'After a price fall',
    description: 'Buy once the price falls by a set percentage from the first day',
    glyph: '↓',
    requiresValue: true,
    valueLabel: 'Fall (%)',
    valueSuffix: '%',
    valuePlaceholder: '5',
    min: 0.1,
    max: 99.9,
    step: 0.5,
  },
  {
    type: 'price_falls_to',
    label: 'At a target price',
    description: 'Buy once the price falls to a price you set',
    glyph: '🎯',
    requiresValue: true,
    valueLabel: 'Target buy price (LKR)',
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
    label: 'Take profit',
    description: 'Sell once the price rises by a set percentage above what you paid',
    glyph: '◎',
    requiresValue: true,
    valueLabel: 'Take profit at a rise of (%)',
    valueSuffix: '%',
    valuePlaceholder: '10',
    min: 0.1,
    max: 1000,
    step: 0.5,
  },
  {
    type: 'stop_loss_pct',
    label: 'Stop loss',
    description: 'Sell once the price falls by a set percentage below what you paid',
    glyph: '⊘',
    requiresValue: true,
    valueLabel: 'Stop loss at a fall of (%)',
    valueSuffix: '%',
    valuePlaceholder: '5',
    min: 0.1,
    max: 99.9,
    step: 0.5,
  },
  {
    type: 'target_price',
    label: 'Target price',
    description: 'Sell once the price reaches a price you set',
    glyph: '🏁',
    requiresValue: true,
    valueLabel: 'Target sell price (LKR)',
    valueSuffix: 'LKR',
    valuePlaceholder: '150.00',
    min: 0.01,
    step: 0.25,
  },
  {
    type: 'end_of_period',
    label: 'On the last day',
    description: 'Sell anything still held on the last trading day',
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

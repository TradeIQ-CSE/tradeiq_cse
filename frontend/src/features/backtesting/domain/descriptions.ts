import { V1_BUY_RULES, V1_SELL_RULES } from './v1Rules';

export function entryDescription(type: string, value?: number) {
  if (type === 'price_falls_pct_from_period_start') return `Buy after a ${value ?? 5}% fall from the period reference price`;
  if (type === 'price_falls_to') return `Buy at or below LKR ${(value ?? 0).toFixed(2)}`;
  if (type === 'period_start') return 'Buy on the first available trading day at the opening price';
  return V1_BUY_RULES.find((rule) => rule.type === type)?.label || type;
}

export function exitDescription(type: string, value?: number) {
  if (type === 'take_profit_pct') return `Take profit after a ${value ?? 10}% gain from entry`;
  if (type === 'stop_loss_pct') return `Stop loss after a ${value ?? 5}% fall from entry`;
  if (type === 'target_price') return `Sell at or above LKR ${(value ?? 0).toFixed(2)}`;
  if (type === 'end_of_period') return 'Close an open position on the final available trading day';
  return V1_SELL_RULES.find((rule) => rule.type === type)?.label || type;
}

export function sizingDescription(type: string, value?: number) {
  if (type === 'percentage') return `${value ?? 50}% of portfolio equity`;
  if (type === 'absolute') return `LKR ${(value ?? 0).toLocaleString('en-LK')} per entry`;
  if (type === 'fixed_quantity') return `${value ?? 0} whole shares per entry`;
  return 'All available simulated cash';
}

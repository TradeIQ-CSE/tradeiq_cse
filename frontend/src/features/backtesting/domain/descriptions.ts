import { formatGapBoundary } from '../../../lib/data-gaps';
import { V1_BUY_RULES, V1_SELL_RULES } from './v1Rules';

/** "24 Sept 2025" style date for an ISO day; the raw value if it won't parse. */
export function formatDay(day: string) {
  try {
    return formatGapBoundary(day, 'en-LK');
  } catch {
    return day;
  }
}

export function entryDescription(type: string, value?: number) {
  if (type === 'price_falls_pct_from_period_start') return `Buy after a ${value ?? 5}% fall from the first day`;
  if (type === 'price_falls_to') return `Buy at or below LKR ${(value ?? 0).toFixed(2)}`;
  if (type === 'period_start') return 'Buy on the first trading day';
  return V1_BUY_RULES.find((rule) => rule.type === type)?.label || type;
}

export function exitDescription(type: string, value?: number) {
  if (type === 'take_profit_pct') return `Take profit after a ${value ?? 10}% rise`;
  if (type === 'stop_loss_pct') return `Stop loss after a ${value ?? 5}% fall`;
  if (type === 'target_price') return `Sell at or above LKR ${(value ?? 0).toFixed(2)}`;
  if (type === 'end_of_period') return 'Sell anything still held on the last day';
  return V1_SELL_RULES.find((rule) => rule.type === type)?.label || type;
}

export function sizingDescription(type: string, value?: number) {
  if (type === 'percentage') return `${value ?? 50}% of your portfolio per trade`;
  if (type === 'absolute') return `LKR ${(value ?? 0).toLocaleString('en-LK')} per trade`;
  if (type === 'fixed_quantity') return `${value ?? 0} shares per trade`;
  return 'All available cash per trade';
}

/**
 * Plain words for the engine's trade reason code, e.g. `stop_loss_pct(5%)`
 * → "Fell 5%, stop loss". Unknown codes are de-underscored rather than shown
 * raw.
 */
export function tradeReason(code: string): { type: string; text: string } {
  const match = code.match(/^([a-z_]+)(?:\((.*)\))?$/);
  const type = match?.[1] ?? code;
  const arg = match?.[2];
  const lkr = (value?: string) => `LKR ${Number(value ?? 0).toFixed(2)}`;
  switch (type) {
    case 'period_start':
      return { type, text: 'First trading day' };
    case 'price_falls_pct_from_period_start':
      return { type, text: `Fell ${arg ?? ''} from the first day` };
    case 'price_falls_to':
      return { type, text: `Fell to ${lkr(arg)}` };
    case 'take_profit_pct':
      return { type, text: `Rose ${arg ?? ''}, take profit` };
    case 'stop_loss_pct':
      return { type, text: `Fell ${arg ?? ''}, stop loss` };
    case 'target_price':
      return { type, text: `Reached ${lkr(arg)}` };
    case 'end_of_period':
      return { type, text: 'Last day of the test' };
    default: {
      const words = code.replace(/_/g, ' ').trim();
      return { type, text: words.charAt(0).toUpperCase() + words.slice(1) };
    }
  }
}

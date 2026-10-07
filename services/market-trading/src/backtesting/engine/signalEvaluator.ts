import {
  DailyBar,
  BuyCondition,
  SellCondition,
  ReentryCondition,
} from '../domain/types';
import { round4 } from '../domain/rounding';

export interface TradeSignal {
  price: number;
  reason: string;
}

export interface EvaluateBuySignalParams {
  bar: DailyBar;
  barIndex: number;
  totalSimulationBars: number;
  buyCondition: BuyCondition;
  reentryCondition?: ReentryCondition;
  periodStartPrice: number;
  lastSellPrice: number | null;
  isVersion2: boolean;
}

export interface EvaluateSellSignalParams {
  bar: DailyBar;
  barIndex: number;
  totalSimulationBars: number;
  entryPrice: number;
  sellConditions: SellCondition[];
}

/**
 * Evaluates whether a buy signal is generated on the given bar.
 * Evaluates V2 re-entry condition (if position was previously sold),
 * or standard buy conditions (period_start, price_falls_to, price_falls_pct_from_period_start).
 */
export function evaluateBuySignal(
  params: EvaluateBuySignalParams,
): TradeSignal | null {
  const {
    bar,
    barIndex,
    totalSimulationBars,
    buyCondition,
    reentryCondition,
    periodStartPrice,
    lastSellPrice,
    isVersion2,
  } = params;

  // In Version 2, buy signals are not generated on the very last simulation bar
  if (isVersion2 && barIndex >= totalSimulationBars - 1) {
    return null;
  }

  const ruleValue = buyCondition.value ?? 0;

  if (isVersion2 && lastSellPrice !== null) {
    const fallPercentage = reentryCondition?.value ?? 0;
    const targetPrice = round4(lastSellPrice * (1 - fallPercentage / 100));
    if (bar.low <= targetPrice) {
      return {
        price: Math.min(bar.open, targetPrice),
        reason: `price_falls_pct_from_last_sell(${fallPercentage}%)`,
      };
    }
  } else if (buyCondition.type === 'period_start' && barIndex === 0) {
    return {
      price: bar.open,
      reason: 'period_start',
    };
  } else if (buyCondition.type === 'price_falls_to' && bar.low <= ruleValue) {
    return {
      price: Math.min(bar.open, ruleValue),
      reason: `price_falls_to(${ruleValue})`,
    };
  } else if (buyCondition.type === 'price_falls_pct_from_period_start') {
    const targetPrice = round4(periodStartPrice * (1 - ruleValue / 100));
    if (bar.low <= targetPrice) {
      return {
        price: Math.min(bar.open, targetPrice),
        reason: `price_falls_pct_from_period_start(${ruleValue}%)`,
      };
    }
  }

  return null;
}

/**
 * Evaluates whether a sell signal is triggered on the current bar for an active position.
 * Priority order: stop_loss_pct -> take_profit_pct -> target_price -> end_of_period.
 */
export function evaluateSellSignal(
  params: EvaluateSellSignalParams,
): TradeSignal | null {
  const { bar, barIndex, totalSimulationBars, entryPrice, sellConditions } =
    params;

  const stopLossRule = sellConditions.find((r) => r.type === 'stop_loss_pct');
  const takeProfitRule = sellConditions.find((r) => r.type === 'take_profit_pct');
  const targetPriceRule = sellConditions.find((r) => r.type === 'target_price');

  if (stopLossRule) {
    const stopLossValue = stopLossRule.value ?? 0;
    const stopLossPrice = round4(entryPrice * (1 - stopLossValue / 100));
    if (bar.low <= stopLossPrice) {
      return {
        price: Math.min(bar.open, stopLossPrice),
        reason: `stop_loss_pct(${stopLossValue}%)`,
      };
    }
  }

  if (takeProfitRule) {
    const takeProfitValue = takeProfitRule.value ?? 0;
    const takeProfitPrice = round4(entryPrice * (1 + takeProfitValue / 100));
    if (bar.high >= takeProfitPrice) {
      return {
        price: Math.max(bar.open, takeProfitPrice),
        reason: `take_profit_pct(${takeProfitValue}%)`,
      };
    }
  }

  if (
    targetPriceRule?.value !== undefined &&
    bar.high >= targetPriceRule.value
  ) {
    return {
      price: Math.max(bar.open, targetPriceRule.value),
      reason: `target_price(${targetPriceRule.value})`,
    };
  }

  const isLastSimulationBar = barIndex === totalSimulationBars - 1;
  if (isLastSimulationBar) {
    return {
      price: bar.close,
      reason: 'end_of_period',
    };
  }

  return null;
}

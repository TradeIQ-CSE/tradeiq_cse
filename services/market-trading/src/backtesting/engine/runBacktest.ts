import {
  BacktestInput,
  BacktestResult,
  EquityCurvePoint,
  TradeLedgerEntry,
} from '../domain/types';
import { round4 } from '../domain/rounding';
import { validateAndPrepareBars } from './barValidator';
import {
  calculateBuyPositionExecution,
  calculateTransactionDetails,
} from './feeAndPositionSizing';
import { evaluateBuySignal, evaluateSellSignal } from './signalEvaluator';

/**
 * Executes a backtest simulation over historical OHLCV price bars based on provided rules,
 * position sizing, and fee configurations.
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  const { simulationBars } = validateAndPrepareBars(input);

  const isVersion2 = input.rules.version === '2.0';
  const periodStartPrice = simulationBars[0].open;

  let availableCash = round4(input.initialCapital);
  let positionQuantity = 0;
  let positionEntryPrice = 0;
  let positionEntryDate = '';
  let isStrategyCompleted = false;
  let lastSellPrice: number | null = null;

  const trades: TradeLedgerEntry[] = [];
  const equityCurve: EquityCurvePoint[] = [];

  for (let barIndex = 0; barIndex < simulationBars.length; barIndex++) {
    const currentBar = simulationBars[barIndex];

    // Evaluate Buy Signal & Execute Buy Order
    if (
      positionQuantity === 0 &&
      !isStrategyCompleted &&
      (!isVersion2 || barIndex < simulationBars.length - 1)
    ) {
      const buySignal = evaluateBuySignal({
        bar: currentBar,
        barIndex,
        totalSimulationBars: simulationBars.length,
        buyCondition: input.rules.buyCondition,
        reentryCondition: input.rules.reentryCondition,
        periodStartPrice,
        lastSellPrice,
        isVersion2,
      });

      if (buySignal && buySignal.price > 0) {
        const { quantity, transaction } = calculateBuyPositionExecution({
          currentCash: availableCash,
          initialCapital: input.initialCapital,
          executionPrice: buySignal.price,
          positionSizing: input.positionSizing,
          feeConfig: input.feeConfig,
          isVersion2,
        });

        if (quantity > 0) {
          availableCash = round4(availableCash + transaction.cashFlow);
          positionQuantity = quantity;
          positionEntryPrice = buySignal.price;
          positionEntryDate = currentBar.date;

          trades.push({
            id: trades.length + 1,
            date: currentBar.date,
            type: 'BUY',
            executionPrice: buySignal.price,
            quantity,
            grossValue: transaction.grossValue,
            fees: transaction.fees,
            netCashFlow: transaction.cashFlow,
            reason: buySignal.reason,
          });
        }
      }
    }
    // Evaluate Sell Signal & Execute Sell Order
    else if (
      positionQuantity > 0 &&
      !isStrategyCompleted &&
      currentBar.date !== positionEntryDate
    ) {
      const sellSignal = evaluateSellSignal({
        bar: currentBar,
        barIndex,
        totalSimulationBars: simulationBars.length,
        entryPrice: positionEntryPrice,
        sellConditions: input.rules.sellConditions,
      });

      if (sellSignal) {
        const transaction = calculateTransactionDetails(
          positionQuantity,
          sellSignal.price,
          'SELL',
          input.feeConfig,
          isVersion2,
        );

        availableCash = round4(availableCash + transaction.cashFlow);

        trades.push({
          id: trades.length + 1,
          date: currentBar.date,
          type: 'SELL',
          executionPrice: sellSignal.price,
          quantity: positionQuantity,
          grossValue: transaction.grossValue,
          fees: transaction.fees,
          netCashFlow: transaction.cashFlow,
          reason: sellSignal.reason,
        });

        positionQuantity = 0;
        positionEntryPrice = 0;
        isStrategyCompleted = !isVersion2;
        lastSellPrice = sellSignal.price;
        positionEntryDate = '';
      }
    }

    const currentMarketValue = round4(positionQuantity * currentBar.close);
    equityCurve.push({
      date: currentBar.date,
      cash: availableCash,
      positionQuantity,
      positionMarketValue: currentMarketValue,
      totalEquity: round4(availableCash + currentMarketValue),
    });
  }

  // Force close any open position on final bar
  if (positionQuantity > 0) {
    const lastBar = simulationBars[simulationBars.length - 1];
    const transaction = calculateTransactionDetails(
      positionQuantity,
      lastBar.close,
      'SELL',
      input.feeConfig,
      isVersion2,
    );

    availableCash = round4(availableCash + transaction.cashFlow);

    trades.push({
      id: trades.length + 1,
      date: lastBar.date,
      type: 'SELL',
      executionPrice: lastBar.close,
      quantity: positionQuantity,
      grossValue: transaction.grossValue,
      fees: transaction.fees,
      netCashFlow: transaction.cashFlow,
      reason: 'end_of_period',
    });

    positionQuantity = 0;
    positionEntryPrice = 0;
    isStrategyCompleted = true;

    // Update last equity curve point after closing position
    const lastEquityPoint = equityCurve[equityCurve.length - 1];
    lastEquityPoint.cash = availableCash;
    lastEquityPoint.positionQuantity = 0;
    lastEquityPoint.positionMarketValue = 0;
    lastEquityPoint.totalEquity = availableCash;
  }

  return {
    initialCapital: input.initialCapital,
    finalCash: availableCash,
    finalEquity: equityCurve[equityCurve.length - 1].totalEquity,
    trades,
    equityCurve,
  };
}

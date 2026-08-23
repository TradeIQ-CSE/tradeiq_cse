import {
  BacktestInput,
  BacktestResult,
  DailyBar,
  EquityCurvePoint,
  TradeLedgerEntry,
  FeeBreakdown,
} from '../domain/types';
import {
  InvalidDateRangeError,
  MissingPriceHistoryError,
  InsufficientWarmupDataError,
  InvalidBarDataError,
} from '../domain/errors';
import { round4 } from '../domain/rounding';
import { validateRule } from '../rules/validateRule';

export function runBacktest(input: BacktestInput): BacktestResult {
  // 1. Validate the rule DSL
  validateRule(input.rules);

  // 2. Validate date range format and logic
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(input.startDate)) {
    throw new InvalidDateRangeError(`startDate '${input.startDate}' must be in YYYY-MM-DD format.`);
  }
  if (!dateRegex.test(input.endDate)) {
    throw new InvalidDateRangeError(`endDate '${input.endDate}' must be in YYYY-MM-DD format.`);
  }

  const startMs = Date.parse(input.startDate);
  const endMs = Date.parse(input.endDate);
  if (isNaN(startMs)) {
    throw new InvalidDateRangeError(`startDate '${input.startDate}' is an invalid calendar date.`);
  }
  if (isNaN(endMs)) {
    throw new InvalidDateRangeError(`endDate '${input.endDate}' is an invalid calendar date.`);
  }
  if (startMs > endMs) {
    throw new InvalidDateRangeError(`startDate '${input.startDate}' cannot be after endDate '${input.endDate}'.`);
  }

  if (input.initialCapital <= 0) {
    throw new InvalidDateRangeError('initialCapital must be greater than 0.');
  }

  // 3. Validate historical bars
  if (!input.bars || !Array.isArray(input.bars)) {
    throw new MissingPriceHistoryError('Historical bars are missing or not an array.');
  }

  const dateSeen = new Set<string>();
  for (const bar of input.bars) {
    if (!bar.date || !dateRegex.test(bar.date) || isNaN(Date.parse(bar.date))) {
      throw new InvalidBarDataError(`Bar contains invalid date: '${bar.date}'`);
    }

    if (dateSeen.has(bar.date)) {
      throw new InvalidBarDataError(`Duplicate daily bar data found for date: '${bar.date}'`);
    }
    dateSeen.add(bar.date);

    // Validate OHLC bounds
    if (
      bar.open < 0 ||
      bar.high < 0 ||
      bar.low < 0 ||
      bar.close < 0 ||
      bar.volume < 0
    ) {
      throw new InvalidBarDataError(`Bar on date ${bar.date} contains negative prices or volume.`);
    }
    if (bar.high < bar.low) {
      throw new InvalidBarDataError(`Bar on date ${bar.date} has high (${bar.high}) less than low (${bar.low}).`);
    }
    if (bar.high < bar.open || bar.high < bar.close) {
      throw new InvalidBarDataError(
        `Bar on date ${bar.date} has high (${bar.high}) less than open (${bar.open}) or close (${bar.close}).`
      );
    }
    if (bar.low > bar.open || bar.low > bar.close) {
      throw new InvalidBarDataError(
        `Bar on date ${bar.date} has low (${bar.low}) greater than open (${bar.open}) or close (${bar.close}).`
      );
    }
  }

  // Sort bars chronologically
  const sortedBars = [...input.bars].sort((a, b) => a.date.localeCompare(b.date));

  // Partition bars into warmup and simulation
  const warmupBars = sortedBars.filter((bar) => bar.date < input.startDate);
  const simulationBars = sortedBars.filter(
    (bar) => bar.date >= input.startDate && bar.date <= input.endDate
  );

  // Check warmup data sufficiency
  const requiredWarmup = input.warmupPeriod ?? 0;
  if (warmupBars.length < requiredWarmup) {
    throw new InsufficientWarmupDataError(
      `Insufficient warm-up data. Required: ${requiredWarmup}, Available: ${warmupBars.length}`
    );
  }

  // Check simulation bars presence
  if (simulationBars.length === 0) {
    throw new MissingPriceHistoryError(
      `No price history bars found within the simulation range: ${input.startDate} to ${input.endDate}`
    );
  }

  // 4. Initialize deterministic state
  let cash = round4(input.initialCapital);
  let positionQuantity = 0;
  let positionPrice = 0;
  let state: 'FLAT' | 'LONG' | 'COMPLETED' = 'FLAT';
  let entryDate: string | null = null;

  const trades: TradeLedgerEntry[] = [];
  const equityCurve: EquityCurvePoint[] = [];

  const buyRule = input.rules.buyCondition;
  const sellRules = input.rules.sellConditions;

  const feeConfig = input.feeConfig;
  const totalFeeRate =
    feeConfig.brokerageRate +
    feeConfig.cseRate +
    feeConfig.cdsRate +
    feeConfig.secCessRate +
    feeConfig.stlRate;

  // Track the period start price (Open of first simulation bar)
  const periodStartPrice = simulationBars[0].open;

  // 5. Process bars chronologically
  for (let t = 0; t < simulationBars.length; t++) {
    const bar = simulationBars[t];

    if (state === 'FLAT') {
      // Evaluate Buy Condition
      let triggered = false;
      let buyPrice = 0;
      let reason = '';

      if (buyRule.type === 'period_start') {
        if (t === 0) {
          triggered = true;
          buyPrice = bar.open;
          reason = 'period_start';
        }
      } else if (buyRule.type === 'price_falls_to') {
        const threshold = buyRule.value ?? 0;
        if (bar.low <= threshold) {
          triggered = true;
          buyPrice = bar.open <= threshold ? bar.open : threshold;
          reason = `price_falls_to(${threshold})`;
        }
      } else if (buyRule.type === 'price_falls_pct_from_period_start') {
        const pct = buyRule.value ?? 0;
        const targetPrice = round4(periodStartPrice * (1 - pct / 100));
        if (bar.low <= targetPrice) {
          triggered = true;
          buyPrice = bar.open <= targetPrice ? bar.open : targetPrice;
          reason = `price_falls_pct_from_period_start(${pct}%)`;
        }
      }

      if (triggered) {
        // Position sizing calculations
        let allocatedCash = cash;
        if (input.positionSizing.type === 'percentage') {
          const pct = input.positionSizing.value ?? 100;
          allocatedCash = Math.min(cash, round4(input.initialCapital * (pct / 100)));
        } else if (input.positionSizing.type === 'absolute') {
          const val = input.positionSizing.value ?? 0;
          allocatedCash = Math.min(cash, val);
        } else if (input.positionSizing.type === 'fixed_quantity') {
          const qty = input.positionSizing.value ?? 0;
          allocatedCash = Math.min(cash, round4(qty * buyPrice * (1 + totalFeeRate)));
        }

        // Divide allocated cash by buyPrice * (1 + totalFeeRate)
        let qty = Math.floor(allocatedCash / (buyPrice * (1 + totalFeeRate)));

        if (qty > 0) {
          let grossValue = round4(qty * buyPrice);
          let brokerage = round4(grossValue * feeConfig.brokerageRate);
          let cse = round4(grossValue * feeConfig.cseRate);
          let cds = round4(grossValue * feeConfig.cdsRate);
          let secCess = round4(grossValue * feeConfig.secCessRate);
          let stl = round4(grossValue * feeConfig.stlRate);
          let totalFee = round4(brokerage + cse + cds + secCess + stl);
          let debit = round4(grossValue + totalFee);

          // Rounding adjustments to ensure we never overrun cash
          while (debit > cash && qty > 0) {
            qty--;
            grossValue = round4(qty * buyPrice);
            brokerage = round4(grossValue * feeConfig.brokerageRate);
            cse = round4(grossValue * feeConfig.cseRate);
            cds = round4(grossValue * feeConfig.cdsRate);
            secCess = round4(grossValue * feeConfig.secCessRate);
            stl = round4(grossValue * feeConfig.stlRate);
            totalFee = round4(brokerage + cse + cds + secCess + stl);
            debit = round4(grossValue + totalFee);
          }

          if (qty > 0) {
            cash = round4(cash - debit);
            positionQuantity = qty;
            positionPrice = buyPrice;
            state = 'LONG';
            entryDate = bar.date;

            const fees: FeeBreakdown = {
              brokerage,
              cse,
              cds,
              secCess,
              stl,
              total: totalFee,
            };

            trades.push({
              id: trades.length + 1,
              date: bar.date,
              type: 'BUY',
              executionPrice: buyPrice,
              quantity: qty,
              grossValue,
              fees,
              netCashFlow: -debit,
              reason,
            });
          }
        }
      }
    } else if (state === 'LONG') {
      // Evaluate Sell Conditions starting on days AFTER entry to prevent look-ahead bias
      if (bar.date !== entryDate) {
        let stopLossFired = false;
        let stopLossPrice = 0;
        let stopLossReason = '';

        let takeProfitFired = false;
        let takeProfitPrice = 0;
        let takeProfitReason = '';

        let targetPriceFired = false;
        let targetPricePrice = 0;
        let targetPriceReason = '';

        let endOfPeriodFired = false;
        let endOfPeriodPrice = 0;
        let endOfPeriodReason = '';

        // Process active rules
        for (const rule of sellRules) {
          if (rule.type === 'stop_loss_pct') {
            const slPct = rule.value ?? 0;
            const slPrice = round4(positionPrice * (1 - slPct / 100));
            if (bar.low <= slPrice) {
              stopLossFired = true;
              stopLossPrice = bar.open <= slPrice ? bar.open : slPrice;
              stopLossReason = `stop_loss_pct(${slPct}%)`;
            }
          } else if (rule.type === 'take_profit_pct') {
            const tpPct = rule.value ?? 0;
            const tpPrice = round4(positionPrice * (1 + tpPct / 100));
            if (bar.high >= tpPrice) {
              takeProfitFired = true;
              takeProfitPrice = bar.open >= tpPrice ? bar.open : tpPrice;
              takeProfitReason = `take_profit_pct(${tpPct}%)`;
            }
          } else if (rule.type === 'target_price') {
            const threshold = rule.value ?? 0;
            if (bar.high >= threshold) {
              targetPriceFired = true;
              targetPricePrice = bar.open >= threshold ? bar.open : threshold;
              targetPriceReason = `target_price(${threshold})`;
            }
          }
        }

        // end_of_period is always-on fallback at the end of the simulation period
        if (t === simulationBars.length - 1) {
          endOfPeriodFired = true;
          endOfPeriodPrice = bar.close;
          endOfPeriodReason = 'end_of_period';
        }

        // Apply precedence: Stop-loss > Take-profit > Target price > End of period
        let exitPrice = 0;
        let exitReason = '';
        let exitTriggered = false;

        if (stopLossFired) {
          exitPrice = stopLossPrice;
          exitReason = stopLossReason;
          exitTriggered = true;
        } else if (takeProfitFired) {
          exitPrice = takeProfitPrice;
          exitReason = takeProfitReason;
          exitTriggered = true;
        } else if (targetPriceFired) {
          exitPrice = targetPricePrice;
          exitReason = targetPriceReason;
          exitTriggered = true;
        } else if (endOfPeriodFired) {
          exitPrice = endOfPeriodPrice;
          exitReason = endOfPeriodReason;
          exitTriggered = true;
        }

        if (exitTriggered) {
          const grossValue = round4(positionQuantity * exitPrice);
          const brokerage = round4(grossValue * feeConfig.brokerageRate);
          const cse = round4(grossValue * feeConfig.cseRate);
          const cds = round4(grossValue * feeConfig.cdsRate);
          const secCess = round4(grossValue * feeConfig.secCessRate);
          const stl = round4(grossValue * feeConfig.stlRate);
          const totalFee = round4(brokerage + cse + cds + secCess + stl);
          const credit = round4(grossValue - totalFee);

          cash = round4(cash + credit);

          const fees: FeeBreakdown = {
            brokerage,
            cse,
            cds,
            secCess,
            stl,
            total: totalFee,
          };

          trades.push({
            id: trades.length + 1,
            date: bar.date,
            type: 'SELL',
            executionPrice: exitPrice,
            quantity: positionQuantity,
            grossValue,
            fees,
            netCashFlow: credit,
            reason: exitReason,
          });

          positionQuantity = 0;
          positionPrice = 0;
          state = 'COMPLETED';
        }
      }
    }

    // Record daily equity point
    const positionMarketValue = round4(positionQuantity * bar.close);
    const totalEquity = round4(cash + positionMarketValue);

    equityCurve.push({
      date: bar.date,
      cash: round4(cash),
      positionQuantity,
      positionMarketValue,
      totalEquity,
    });
  }

  return {
    initialCapital: input.initialCapital,
    finalCash: cash,
    finalEquity: equityCurve[equityCurve.length - 1].totalEquity,
    trades,
    equityCurve,
  };
}

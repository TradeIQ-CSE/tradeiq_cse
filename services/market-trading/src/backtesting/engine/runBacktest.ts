import {
  BacktestInput,
  BacktestResult,
  EquityCurvePoint,
  TradeLedgerEntry,
  FeeBreakdown,
} from '../domain/types';
import {
  InvalidDateRangeError,
  MissingPriceHistoryError,
  InsufficientWarmupDataError,
  InvalidBarDataError,
  InvalidCapitalError,
  InvalidRuleError,
} from '../domain/errors';
import { round4 } from '../domain/rounding';
import { validateExecution } from '../rules/validateExecution';
import { validateRule } from '../rules/validateRule';

type Signal = { price: number; reason: string };
type Transaction = { grossValue: number; fees: FeeBreakdown; cashFlow: number };

// [Function: runBacktest] Main simulation
export function runBacktest(input: BacktestInput): BacktestResult {
  validateRule(input.rules);

  const validD = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

  // [Function: validate] All input + OHLCV + date + warmup validation
  if (
    !validD(input.startDate) ||
    !validD(input.endDate) ||
    input.startDate > input.endDate
  ) {
    throw new InvalidDateRangeError('Invalid date range.');
  }
  if (!Number.isFinite(input.initialCapital) || input.initialCapital <= 0) {
    // Its own code: a caller branching on INVALID_DATE_RANGE would otherwise
    // be told the dates are wrong when the capital is.
    throw new InvalidCapitalError('initialCapital must be greater than 0.');
  }
  if (!Array.isArray(input.bars)) {
    throw new MissingPriceHistoryError('Missing historical bars.');
  }

  const repeatedStrategy = input.rules.version === '2.0';
  if (repeatedStrategy)
    validateExecution(input.positionSizing, input.feeConfig);

  const dates = new Set<string>();
  // V2 treats a zero opening quote as unavailable and substitutes the
  // observed positive close before normalizing unavailable intraday bounds.
  // These execution-only assumptions never mutate input or v1 calculations.
  const bars = input.bars
    .map((bar) => {
      if (!repeatedStrategy) return bar;
      const open = bar.open === 0 && bar.close > 0 ? bar.close : bar.open;
      return {
        ...bar,
        open,
        low: bar.low === 0 ? Math.min(open, bar.close) : bar.low,
        high: bar.high === 0 ? Math.max(open, bar.close) : bar.high,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const b of bars) {
    if (!validD(b.date) || dates.has(b.date)) {
      throw new InvalidBarDataError(`Invalid/dup date: ${b.date}`);
    }
    dates.add(b.date);
    if (
      (repeatedStrategy &&
        ([b.open, b.high, b.low, b.close, b.volume].some(
          (value) => !Number.isFinite(value),
        ) ||
          Math.min(b.open, b.high, b.low, b.close) <= 0)) ||
      b.open < 0 ||
      b.high < 0 ||
      b.low < 0 ||
      b.close < 0 ||
      b.volume < 0 ||
      b.high < b.low ||
      b.high < b.open ||
      b.high < b.close ||
      b.low > b.open ||
      b.low > b.close
    ) {
      throw new InvalidBarDataError(`Invalid OHLCV: ${b.date}`);
    }
  }

  // [Function: prepareBars] Sort and split warmup/simulation data
  const warmup = bars.filter((b) => b.date < input.startDate);
  const sim = bars.filter(
    (b) => b.date >= input.startDate && b.date <= input.endDate,
  );
  const req = input.warmupPeriod ?? 0;

  if (warmup.length < req) {
    throw new InsufficientWarmupDataError(
      `Warmup required ${req}, got ${warmup.length}.`,
    );
  }
  if (sim.length === 0) {
    throw new MissingPriceHistoryError('No bars in simulation range.');
  }

  let cash = round4(input.initialCapital),
    qty = 0,
    entryPrice = 0,
    entryDate = '',
    completed = false,
    lastSellPrice: number | null = null;
  const repeated = input.rules.version === '2.0';
  const trades: TradeLedgerEntry[] = [],
    curve: EquityCurvePoint[] = [];
  const startP = sim[0].open;
  const f = input.feeConfig;
  const feeRate =
    f.brokerageRate + f.cseRate + f.cdsRate + f.secCessRate + f.stlRate;

  // [Function: transaction] Fees + trade creation
  const transaction = (
    q: number,
    p: number,
    type: 'BUY' | 'SELL',
  ): Transaction => {
    const gross = round4(q * p);
    const fees: FeeBreakdown = {
      brokerage: round4(gross * f.brokerageRate),
      cse: round4(gross * f.cseRate),
      cds: round4(gross * f.cdsRate),
      secCess: round4(gross * f.secCessRate),
      stl: round4(gross * f.stlRate),
      total: 0,
    };
    fees.total = round4(
      fees.brokerage + fees.cse + fees.cds + fees.secCess + fees.stl,
    );
    // Independently rounded components can exceed a tiny gross amount even
    // when the configured total rate is below 100%. V2 removes only excess
    // rounding units, in fixed reverse component order, rather than clamping
    // ending cash or leaving a ledger that fails to reconcile.
    if (repeated && fees.total > gross) {
      let residue = Math.round((fees.total - gross) * 10_000);
      const components = ['stl', 'secCess', 'cds', 'cse', 'brokerage'] as const;
      for (const component of components) {
        const units = Math.round(fees[component] * 10_000);
        const reduction = Math.min(units, residue);
        fees[component] = round4((units - reduction) / 10_000);
        residue -= reduction;
        if (residue === 0) break;
      }
      fees.total = round4(
        fees.brokerage + fees.cse + fees.cds + fees.secCess + fees.stl,
      );
    }
    return {
      grossValue: gross,
      fees,
      cashFlow:
        type === 'BUY'
          ? round4(-(gross + fees.total))
          : round4(gross - fees.total),
    };
  };

  for (let i = 0; i < sim.length; i++) {
    const bar = sim[i];

    // [Function: buySignal] Buy rule + position sizing
    if (qty === 0 && !completed && (!repeated || i < sim.length - 1)) {
      const rule = input.rules.buyCondition;
      const val = rule.value ?? 0;
      let sig: Signal | null = null;

      if (repeated && lastSellPrice !== null) {
        const fall = input.rules.reentryCondition!.value;
        const target = round4(lastSellPrice * (1 - fall / 100));
        if (bar.low <= target)
          sig = {
            price: Math.min(bar.open, target),
            reason: `price_falls_pct_from_last_sell(${fall}%)`,
          };
      } else if (rule.type === 'period_start' && i === 0) {
        sig = { price: bar.open, reason: 'period_start' };
      } else if (rule.type === 'price_falls_to' && bar.low <= val) {
        sig = {
          price: Math.min(bar.open, val),
          reason: `price_falls_to(${val})`,
        };
      } else if (rule.type === 'price_falls_pct_from_period_start') {
        const target = round4(startP * (1 - val / 100));
        if (bar.low <= target) {
          sig = {
            price: Math.min(bar.open, target),
            reason: `price_falls_pct_from_period_start(${val}%)`,
          };
        }
      }

      if (sig && sig.price > 0) {
        const sz = input.positionSizing;
        let alloc = cash;
        if (sz.type === 'percentage') {
          alloc = Math.min(
            cash,
            round4(
              (repeated ? cash : input.initialCapital) *
                ((sz.value ?? 100) / 100),
            ),
          );
        } else if (sz.type === 'absolute') {
          alloc = Math.min(cash, sz.value ?? 0);
        }

        let q =
          sz.type === 'fixed_quantity'
            ? // Ask for exactly what was requested. The affordability estimate
              // below divides by an unrounded fee rate, so floating-point can
              // land a hair under a whole share and buy one fewer than the
              // caller asked for even when the cash covers it. The loop that
              // follows already trims to what is affordable, using the same
              // rounded arithmetic the transaction itself uses.
              Math.floor(sz.value ?? 0)
            : Math.floor(alloc / (sig.price * (1 + feeRate)));

        // Cap fixed-quantity requests before the rounded affordability check,
        // avoiding a linear decrement for a very large requested quantity.
        if (repeated && sz.type === 'fixed_quantity')
          q = Math.min(q, Math.floor(alloc / (sig.price * (1 + feeRate))) + 1);
        if (repeated && !Number.isSafeInteger(q))
          throw new InvalidRuleError(
            'Position quantity exceeds the supported whole-share range.',
          );
        let tx = transaction(q, sig.price, 'BUY');
        while (q > 0 && -tx.cashFlow > (repeated ? alloc : cash)) {
          q--;
          tx = transaction(q, sig.price, 'BUY');
        }

        if (q > 0) {
          cash = round4(cash + tx.cashFlow);
          qty = q;
          entryPrice = sig.price;
          entryDate = bar.date;
          trades.push({
            id: trades.length + 1,
            date: bar.date,
            type: 'BUY',
            executionPrice: sig.price,
            quantity: q,
            grossValue: tx.grossValue,
            fees: tx.fees,
            netCashFlow: tx.cashFlow,
            reason: sig.reason,
          });
        }
      }
    }
    // [Function: sellSignal] All sell rules + precedence
    else if (qty > 0 && !completed && bar.date !== entryDate) {
      let sig: Signal | null = null;
      const stopLoss = input.rules.sellConditions.find(
        (r) => r.type === 'stop_loss_pct',
      );
      const takeProfit = input.rules.sellConditions.find(
        (r) => r.type === 'take_profit_pct',
      );
      const target = input.rules.sellConditions.find(
        (r) => r.type === 'target_price',
      );

      if (stopLoss) {
        const val = stopLoss.value ?? 0;
        const p = round4(entryPrice * (1 - val / 100));
        if (bar.low <= p)
          sig = {
            price: Math.min(bar.open, p),
            reason: `stop_loss_pct(${val}%)`,
          };
      }
      if (!sig && takeProfit) {
        const val = takeProfit.value ?? 0;
        const p = round4(entryPrice * (1 + val / 100));
        if (bar.high >= p)
          sig = {
            price: Math.max(bar.open, p),
            reason: `take_profit_pct(${val}%)`,
          };
      }
      if (!sig && target?.value !== undefined && bar.high >= target.value) {
        sig = {
          price: Math.max(bar.open, target.value),
          reason: `target_price(${target.value})`,
        };
      }
      if (!sig && i === sim.length - 1) {
        sig = { price: bar.close, reason: 'end_of_period' };
      }

      if (sig) {
        const tx = transaction(qty, sig.price, 'SELL');
        cash = round4(cash + tx.cashFlow);
        trades.push({
          id: trades.length + 1,
          date: bar.date,
          type: 'SELL',
          executionPrice: sig.price,
          quantity: qty,
          grossValue: tx.grossValue,
          fees: tx.fees,
          netCashFlow: tx.cashFlow,
          reason: sig.reason,
        });
        qty = 0;
        entryPrice = 0;
        completed = !repeated;
        lastSellPrice = sig.price;
        entryDate = '';
      }
    }

    const val = round4(qty * bar.close);
    curve.push({
      date: bar.date,
      cash,
      positionQuantity: qty,
      positionMarketValue: val,
      totalEquity: round4(cash + val),
    });
  }

  // A buy on the final bar leaves the position open: the sell branch is an
  // `else if`, so it cannot run on the bar that opened the position, and there
  // is no later bar to force the exit on. Close it here so every run ends flat
  // and finalCash agrees with finalEquity.
  if (qty > 0) {
    const last = sim[sim.length - 1];
    const tx = transaction(qty, last.close, 'SELL');
    cash = round4(cash + tx.cashFlow);
    trades.push({
      id: trades.length + 1,
      date: last.date,
      type: 'SELL',
      executionPrice: last.close,
      quantity: qty,
      grossValue: tx.grossValue,
      fees: tx.fees,
      netCashFlow: tx.cashFlow,
      reason: 'end_of_period',
    });
    qty = 0;
    entryPrice = 0;
    completed = true;

    // The last curve point was recorded while the position was still open.
    const point = curve[curve.length - 1];
    point.cash = cash;
    point.positionQuantity = 0;
    point.positionMarketValue = 0;
    point.totalEquity = cash;
  }

  return {
    initialCapital: input.initialCapital,
    finalCash: cash,
    finalEquity: curve[curve.length - 1].totalEquity,
    trades,
    equityCurve: curve,
  };
}

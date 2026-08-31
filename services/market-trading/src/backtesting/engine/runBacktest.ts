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
} from '../domain/errors';
import { round4 } from '../domain/rounding';
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
  if (input.initialCapital <= 0) {
    throw new InvalidDateRangeError('initialCapital must be greater than 0.');
  }
  if (!Array.isArray(input.bars)) {
    throw new MissingPriceHistoryError('Missing historical bars.');
  }

  const dates = new Set<string>();
  const bars = [...input.bars].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of bars) {
    if (!validD(b.date) || dates.has(b.date)) {
      throw new InvalidBarDataError(`Invalid/dup date: ${b.date}`);
    }
    dates.add(b.date);
    if (
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
    completed = false;
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
    if (qty === 0 && !completed) {
      const rule = input.rules.buyCondition;
      const val = rule.value ?? 0;
      let sig: Signal | null = null;

      if (rule.type === 'period_start' && i === 0) {
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

      if (sig) {
        const sz = input.positionSizing;
        let alloc = cash;
        if (sz.type === 'percentage') {
          alloc = Math.min(
            cash,
            round4(input.initialCapital * ((sz.value ?? 100) / 100)),
          );
        } else if (sz.type === 'absolute') {
          alloc = Math.min(cash, sz.value ?? 0);
        }

        let q =
          sz.type === 'fixed_quantity'
            ? Math.min(
                Math.floor(sz.value ?? 0),
                Math.floor(cash / (sig.price * (1 + feeRate))),
              )
            : Math.floor(alloc / (sig.price * (1 + feeRate)));

        let tx = transaction(q, sig.price, 'BUY');
        while (q > 0 && -tx.cashFlow > cash) {
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
        completed = true;
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

  return {
    initialCapital: input.initialCapital,
    finalCash: cash,
    finalEquity: curve[curve.length - 1].totalEquity,
    trades,
    equityCurve: curve,
  };
}

import { runBacktest } from '../engine/runBacktest';
import {
  BacktestInput,
  BuyCondition,
  DailyBar,
  PositionSizingConfig,
  SellCondition,
} from '../domain/types';
import { DEFAULT_TEST_FEES } from './fixtures';

const noFees = {
  brokerageRate: 0,
  cseRate: 0,
  cdsRate: 0,
  secCessRate: 0,
  stlRate: 0,
};
const bar = (
  day: number,
  open: number,
  low = open,
  high = open,
  close = open,
): DailyBar => ({
  date: `2025-01-${String(day).padStart(2, '0')}`,
  open,
  low,
  high,
  close,
  volume: 100,
});
const cycles = [
  bar(2, 100, 90, 100),
  bar(3, 100, 80, 120),
  bar(6, 70, 60, 75),
  bar(7, 100, 40, 150),
  bar(15, 30, 20, 40),
  bar(16, 40, 10, 160),
  bar(17, 20),
];
const input = (bars = cycles): BacktestInput => ({
  bars,
  startDate: bars[0].date,
  endDate: bars[bars.length - 1].date,
  initialCapital: 1000,
  feeConfig: noFees,
  positionSizing: { type: 'full_capital' },
  rules: {
    version: '2.0',
    buyCondition: { type: 'period_start' },
    sellConditions: [{ type: 'take_profit_pct', value: 10 }],
    reentryCondition: { type: 'price_falls_pct_from_last_sell', value: 5 },
  },
});
const buys: BuyCondition[] = [
  { type: 'period_start' },
  { type: 'price_falls_to', value: 95 },
  { type: 'price_falls_pct_from_period_start', value: 5 },
];
const sells: SellCondition[] = [
  { type: 'stop_loss_pct', value: 5 },
  { type: 'take_profit_pct', value: 10 },
  { type: 'target_price', value: 110 },
  { type: 'end_of_period' },
];

describe('Repeated trading strategy', () => {
  for (const buy of buys)
    for (const sell of sells) {
      it(`${buy.type} / ${sell.type} keeps evaluating and closes remaining holdings`, () => {
        const fixture = input();
        fixture.rules.buyCondition = buy;
        fixture.rules.sellConditions = [sell];
        const result = runBacktest(fixture);
        expect(result.trades).toHaveLength(
          sell.type === 'end_of_period' ? 2 : 6,
        );
        expect(result.trades.map((trade) => trade.id)).toEqual(
          result.trades.map((_, index) => index + 1),
        );
        expect(result.equityCurve).toHaveLength(cycles.length);
        expect(result.equityCurve.map((point) => point.date)).toEqual(
          cycles.map((point) => point.date),
        );
        expect(result.finalCash).toBe(result.finalEquity);
        expect(
          result.equityCurve.every(
            (point) =>
              point.cash >= 0 &&
              Number.isInteger(point.positionQuantity) &&
              point.positionQuantity >= 0,
          ),
        ).toBe(true);
        for (const point of result.equityCurve)
          expect(point.totalEquity).toBeCloseTo(
            point.cash + point.positionMarketValue,
            4,
          );
      });
    }

  it('resets anchors to actual sale execution and resets percentage exits after each purchase', () => {
    const result = runBacktest(
      input([
        bar(2, 100),
        bar(3, 120),
        bar(6, 115, 114, 115),
        bar(7, 110),
        bar(8, 130),
        bar(9, 100),
      ]),
    );
    expect(result.trades.map((trade) => trade.executionPrice)).toEqual([
      100, 120, 114, 130,
    ]);
    expect(result.trades[2].reason).toBe('price_falls_pct_from_last_sell(5%)');
    // The second sale gaps above 114*1.1; this is not anchored to the initial 100.
    expect(result.trades[3].date).toBe('2025-01-08');
  });

  it('does not manufacture another entry when no later dip occurs', () => {
    const result = runBacktest(
      input([bar(2, 100), bar(3, 110), bar(6, 120), bar(7, 130)]),
    );
    expect(result.trades).toHaveLength(2);
    expect(
      result.equityCurve
        .slice(1)
        .every(
          (point) =>
            point.positionQuantity === 0 && point.cash === result.finalCash,
        ),
    ).toBe(true);
  });

  it('retains entry-day exit restriction, conservative conflicts and final-session suppression', () => {
    const fixture = input([
      bar(2, 100, 80, 120),
      bar(3, 100, 80, 120),
      bar(6, 90, 1, 200),
    ]);
    fixture.rules.sellConditions.push({ type: 'stop_loss_pct', value: 5 });
    const result = runBacktest(fixture);
    expect(result.trades.map((trade) => trade.date)).toEqual([
      '2025-01-02',
      '2025-01-03',
    ]);
    expect(result.trades[1].executionPrice).toBe(95);
    expect(result.trades[1].reason).toBe('stop_loss_pct(5%)');
    const single = runBacktest(input([bar(2, 100)]));
    expect(single.trades).toEqual([]);
  });

  it('preserves version 1 single cycle and final-session buy/liquidation', () => {
    const fixture = input();
    fixture.rules = {
      ...fixture.rules,
      version: '1.0',
      reentryCondition: undefined,
    };
    expect(runBacktest(fixture).trades).toHaveLength(2);
    fixture.bars = [bar(2, 100)];
    fixture.endDate = fixture.startDate;
    expect(runBacktest(fixture).trades.map((trade) => trade.type)).toEqual([
      'BUY',
      'SELL',
    ]);
  });

  it.each<PositionSizingConfig>([
    { type: 'full_capital' },
    { type: 'percentage', value: 50 },
    { type: 'absolute', value: 300 },
    { type: 'fixed_quantity', value: 3 },
  ])(
    'accounts for whole shares, costs and remaining cash with $type sizing',
    (sizing) => {
      const fixture = input();
      fixture.feeConfig = DEFAULT_TEST_FEES;
      fixture.positionSizing = sizing;
      const result = runBacktest(fixture);
      expect(result.trades).toHaveLength(6);
      expect(result.trades.every((trade) => trade.fees.total > 0)).toBe(true);
      let cash = fixture.initialCapital;
      for (const trade of result.trades) {
        if (trade.type === 'BUY') {
          const limit =
            sizing.type === 'percentage'
              ? cash * 0.5
              : sizing.type === 'absolute'
                ? Math.min(cash, 300)
                : cash;
          expect(-trade.netCashFlow).toBeLessThanOrEqual(limit + 0.0001);
          if (sizing.type === 'fixed_quantity')
            expect(trade.quantity).toBeLessThanOrEqual(3);
        }
        cash = Math.round((cash + trade.netCashFlow) * 10000) / 10000;
        expect(cash).toBeGreaterThanOrEqual(0);
      }
      expect(result.finalCash).toBe(cash);
    },
  );

  it.each([10, -10])(
    'sizes later percentage purchases from current cash after a %s percent exit',
    (change) => {
      const fixture = input([
        bar(2, 100),
        bar(3, 100 + change),
        bar(6, 50),
        bar(7, 50),
      ]);
      fixture.positionSizing = { type: 'percentage', value: 50 };
      fixture.rules.sellConditions = [
        change > 0
          ? { type: 'take_profit_pct', value: 10 }
          : { type: 'stop_loss_pct', value: 10 },
      ];
      const result = runBacktest(fixture);
      expect(result.trades[0].quantity).toBe(5);
      expect(result.trades[2].quantity).toBe(change > 0 ? 10 : 9);
    },
  );

  it('waits through unaffordable signals, including charges, and never borrows', () => {
    const fixture = input([bar(2, 100), bar(3, 90), bar(6, 80)]);
    fixture.initialCapital = 100;
    fixture.feeConfig = DEFAULT_TEST_FEES;
    fixture.rules.buyCondition = { type: 'price_falls_to', value: 100 };
    const result = runBacktest(fixture);
    expect(result.trades[0].date).toBe('2025-01-03');
    expect(result.trades[0].quantity).toBe(1);
    expect(result.finalCash).toBeGreaterThanOrEqual(0);
    fixture.initialCapital = 1;
    expect(runBacktest(fixture).trades).toEqual([]);
  });

  it('treats unavailable zero intraday bounds as observed open/close only without inventing a dip', () => {
    const fixture = input([
      bar(2, 100),
      bar(3, 110),
      bar(6, 115, 0, 0, 115),
      bar(7, 116),
    ]);
    const result = runBacktest(fixture);
    expect(result.trades).toHaveLength(2);
    expect(fixture.bars[2].low).toBe(0);
    const held = input([bar(2, 100), bar(3, 100, 0, 100, 97), bar(6, 99)]);
    held.rules.sellConditions = [{ type: 'stop_loss_pct', value: 5 }];
    expect(runBacktest(held).trades[1].reason).toBe('end_of_period');
    held.bars[1].close = 94;
    expect(runBacktest(held).trades[1].executionPrice).toBe(95);
  });

  it('normalizes unavailable zero opens before bounds without mutating bars or legacy execution', () => {
    const fixture = input([bar(2, 0, 0, 100, 100), bar(3, 110), bar(6, 100)]);
    const original = JSON.parse(JSON.stringify(fixture.bars));
    const repeated = runBacktest(fixture);
    expect(repeated.trades.map((trade) => trade.executionPrice)).toEqual([
      100, 110,
    ]);
    expect(fixture.bars).toEqual(original);
    fixture.rules = {
      ...fixture.rules,
      version: '1.0',
      reentryCondition: undefined,
    };
    expect(runBacktest(fixture).trades).toEqual([]);
  });

  it.each([
    { ...noFees, brokerageRate: 1 },
    { ...noFees, brokerageRate: 2 },
    { ...noFees, brokerageRate: 0.6, cseRate: 0.5 },
    { ...noFees, brokerageRate: 1e308, cseRate: 1e308 },
  ])(
    'rejects aggregate fees at or above 100%, including overflow: %j',
    (fees) => {
      const fixture = input();
      fixture.feeConfig = fees;
      expect(() => runBacktest(fixture)).toThrow('total less than 100%');
    },
  );

  it('bounds fee-rounding residues at tiny sale consideration and reconciles every ledger component', () => {
    const fixture = input([bar(2, 0.5), bar(3, 0.0003)]);
    fixture.initialCapital = 1;
    fixture.positionSizing = { type: 'fixed_quantity', value: 1 };
    fixture.feeConfig = {
      brokerageRate: 0.19999,
      cseRate: 0.19999,
      cdsRate: 0.19999,
      secCessRate: 0.19999,
      stlRate: 0.19999,
    };
    const result = runBacktest(fixture);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[1].grossValue).toBe(0.0003);
    expect(result.trades[1].fees).toEqual({
      brokerage: 0.0001,
      cse: 0.0001,
      cds: 0.0001,
      secCess: 0,
      stl: 0,
      total: 0.0003,
    });
    expect(result.finalCash).toBe(0);
    let cash = fixture.initialCapital;
    for (const trade of result.trades) {
      const { total, ...components } = trade.fees;
      expect(total).toBeCloseTo(
        Object.values(components).reduce((sum, fee) => sum + fee, 0),
        4,
      );
      expect(Object.values(components).every((fee) => fee >= 0)).toBe(true);
      expect(trade.netCashFlow).toBeCloseTo(
        trade.type === 'BUY'
          ? -(trade.grossValue + total)
          : trade.grossValue - total,
        4,
      );
      cash += trade.netCashFlow;
      expect(cash).toBeGreaterThanOrEqual(0);
    }
    expect(
      result.equityCurve.every(
        (point) => point.cash >= 0 && point.totalEquity >= 0,
      ),
    ).toBe(true);
    fixture.rules = {
      ...fixture.rules,
      version: '1.0',
      reentryCondition: undefined,
    };
    expect(runBacktest(fixture).finalCash).toBe(-0.0002);
  });

  it.each([0, 100, -1, NaN, Infinity])(
    'rejects invalid re-entry %s',
    (value) => {
      const fixture = input();
      fixture.rules.reentryCondition!.value = value;
      expect(() => runBacktest(fixture)).toThrow('Strategy validation failed');
    },
  );
  it('rejects unsupported versions and incompatible/missing re-entry fields', () => {
    for (const rules of [
      { ...input().rules, version: '3.0' },
      { ...input().rules, version: '1.0' },
      { ...input().rules, reentryCondition: undefined },
    ])
      expect(() => runBacktest({ ...input(), rules })).toThrow();
  });
});

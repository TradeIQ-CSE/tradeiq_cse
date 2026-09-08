import { money } from '../common/money/money';
import { fromNumericString, summarise, valueHolding } from './positions';

// docs/api/paper-trading-v1.md §3.4, checked against the worked examples in §8.
// The §7.1 and §7.2 sample responses are §8.1 followed by §8.2, so those
// figures are fixed by the contract rather than chosen here.
describe('position valuation', () => {
  // §8.1 buy 1,000 @ 100 (lot cost 101,120), then §8.2 sell 400 @ 120
  // (allocated cost 40,448), leaving 600 shares at 60,672.
  const afterPartialSell = {
    symbol: 'COMB.N0000',
    quantity: 600,
    costBasis: money('60672.0000'),
  };

  it('values a position exactly as §7.1 documents it', () => {
    const { position } = valueHolding(afterPartialSell, money('120'));

    expect(position).toEqual({
      symbol: 'COMB.N0000',
      quantity: 600,
      cost_basis: 60672,
      average_cost: 101.12,
      price: 120,
      market_value: 72000,
      unrealized_pnl: 11328,
      unrealized_return_pct: 18.67,
    });
  });

  it('rolls the same position up into the §7.2 summary', () => {
    const held = valueHolding(afterPartialSell, money('120'));

    const summary = summarise({
      portfolioId: '2e43a766-234f-4a4a-99dc-6becb57838ea',
      asOf: '2025-01-10',
      startingCapital: money('1000000'),
      // §8.2 "cash after fill".
      cashBalance: money('946342.4000'),
      // §8.2 realized P/L.
      realizedPnl: money('7014.4000'),
      holdings: [held],
    });

    expect(summary).toEqual({
      portfolio_id: '2e43a766-234f-4a4a-99dc-6becb57838ea',
      currency: 'LKR',
      as_of: '2025-01-10',
      starting_capital: 1000000,
      cash_balance: 946342.4,
      holdings_value: 72000,
      total_equity: 1018342.4,
      realized_pnl: 7014.4,
      unrealized_pnl: 11328,
      total_pnl: 18342.4,
      total_return_pct: 1.83,
    });
  });

  // §8.3 leaves lot B holding 70 shares at 4,247.0400 after the multi-lot FIFO
  // sell, with cash at 998,302.0800 and realized P/L of 2,549.1200. This is the
  // case where the remainder rule matters: an average cost of 60.672 is not a
  // round number, so a cost basis rebuilt by multiplying it back out would not
  // come to 4,247.04.
  it('carries the §8.3 multi-lot remainder through to the summary', () => {
    const held = valueHolding(
      { symbol: 'JKH.N0000', quantity: 70, costBasis: money('4247.0400') },
      money('70'),
    );

    expect(held.position).toMatchObject({
      cost_basis: 4247.04,
      average_cost: 60.672,
      market_value: 4900,
      unrealized_pnl: 652.96,
      unrealized_return_pct: 15.37,
    });

    expect(
      summarise({
        portfolioId: 'p1',
        asOf: '2025-01-10',
        startingCapital: money('1000000'),
        cashBalance: money('998302.0800'),
        realizedPnl: money('2549.1200'),
        holdings: [held],
      }),
    ).toMatchObject({
      holdings_value: 4900,
      total_equity: 1003202.08,
      total_pnl: 3202.08,
      total_return_pct: 0.32,
    });
  });

  it('reports an empty portfolio as cash only', () => {
    expect(
      summarise({
        portfolioId: 'p1',
        asOf: '2025-01-10',
        startingCapital: money('1000000'),
        cashBalance: money('1000000'),
        realizedPnl: money('0'),
        holdings: [],
      }),
    ).toMatchObject({
      holdings_value: 0,
      total_equity: 1000000,
      unrealized_pnl: 0,
      total_pnl: 0,
      total_return_pct: 0,
    });
  });

  it('sums several positions into holdings value and unrealized P/L', () => {
    const summary = summarise({
      portfolioId: 'p1',
      asOf: '2025-01-10',
      startingCapital: money('1000000'),
      cashBalance: money('500000'),
      realizedPnl: money('0'),
      holdings: [
        valueHolding(
          { symbol: 'COMB.N0000', quantity: 600, costBasis: money('60672') },
          money('120'),
        ),
        valueHolding(
          { symbol: 'JKH.N0000', quantity: 70, costBasis: money('4247.04') },
          money('70'),
        ),
      ],
    });

    expect(summary.holdings_value).toBe(76900);
    expect(summary.unrealized_pnl).toBe(11980.96);
    expect(summary.total_equity).toBe(576900);
  });

  it('reads a null numeric column as zero rather than NaN', () => {
    expect(fromNumericString(null).toString()).toBe('0');
    expect(fromNumericString('4247.0400').toString()).toBe('4247.04');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaperOrder } from '../entities/paper-order.entity';
import {
  OrderNotFoundException,
  OrderRejectedException,
  PortfolioNotFoundException,
} from '../common/errors/api-exception';
import {
  ExecutionQuote,
  MarketTradingClient,
  QuoteResult,
} from '../market-trading/market-trading.client';
import { hashCanonicalRequest } from '../common/idempotency/idempotency';
import { OrdersService } from './orders.service';
import { SubmitOrderDto } from './dto/submit-order.dto';

const QUOTE: ExecutionQuote = {
  symbol: 'COMB.N0000',
  listing_status: 'listed',
  market_as_of: '2025-01-10',
  price_as_of: '2025-01-10',
  close: 100,
  settlement_date: '2025-01-14',
};

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PORTFOLIO = 'bbbbbbbb-0000-4000-8000-000000000002';

const order = (over: Partial<SubmitOrderDto> = {}): SubmitOrderDto => ({
  symbol: 'COMB.N0000',
  side: 'buy',
  quantity: 1000,
  ...over,
});

describe('OrdersService', () => {
  let service: OrdersService;
  let repoQuery: jest.Mock;
  let txQuery: jest.Mock;
  let getQuote: jest.Mock;

  // The service issues many statements per call, so the mocks match on SQL
  // rather than on call order: a sequence-based mock would have to be
  // rewritten every time an unrelated statement is added.
  const respond = (
    mock: jest.Mock,
    handlers: { match: string; rows: unknown[] }[],
  ) => {
    mock.mockImplementation((sql: string) => {
      const handler = handlers.find((h) => sql.includes(h.match));
      return Promise.resolve(handler ? handler.rows : []);
    });
  };

  beforeEach(async () => {
    repoQuery = jest.fn().mockResolvedValue([]);
    txQuery = jest.fn().mockResolvedValue([]);
    getQuote = jest.fn().mockResolvedValue({ found: true, quote: QUOTE });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(PaperOrder),
          useValue: { manager: { query: repoQuery } },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: (m: unknown) => unknown) =>
              cb({ query: txQuery }),
            ),
          },
        },
        { provide: MarketTradingClient, useValue: { getQuote } },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  const ownedPortfolio = (cash = '1000000') => ({
    match: 'FROM auth.virtual_portfolios',
    rows: [{ cash_balance: cash }],
  });

  // COALESCE(SUM(...), 0) always returns exactly one row in Postgres.
  const openQuantity = (quantity = 0) => ({
    match: 'COALESCE(SUM(quantity_remaining)',
    rows: [{ open_quantity: String(quantity) }],
  });

  describe('estimate', () => {
    it('returns the contract shape for an affordable buy', async () => {
      respond(repoQuery, [ownedPortfolio(), openQuantity()]);

      // docs/api/paper-trading-v1.md §8.1 — 1,000 @ 100.
      await expect(service.estimate(USER, PORTFOLIO, order())).resolves.toEqual(
        {
          symbol: 'COMB.N0000',
          side: 'buy',
          quantity: 1000,
          price: 100,
          price_as_of: '2025-01-10',
          settlement_date: '2025-01-14',
          gross_consideration: 100000,
          fees: [
            { type: 'brokerage', rate_percent: 0.64, amount: 640 },
            { type: 'cse', rate_percent: 0.084, amount: 84 },
            { type: 'cds', rate_percent: 0.024, amount: 24 },
            { type: 'sec_cess', rate_percent: 0.072, amount: 72 },
            { type: 'stl', rate_percent: 0.3, amount: 300 },
          ],
          fee_total: 1120,
          cash_effect: -101120,
        },
      );
    });

    it('writes nothing', async () => {
      respond(repoQuery, [ownedPortfolio(), openQuantity()]);

      await service.estimate(USER, PORTFOLIO, order());

      // Matching on a bare /INSERT|UPDATE|DELETE/ would false-positive on the
      // `deleted_at IS NULL` in the ownership check, so assert on the verb
      // each statement actually starts with.
      const verbs = repoQuery.mock.calls.map((c) =>
        (c[0] as string).trim().split(/\s+/)[0].toUpperCase(),
      );
      expect(verbs.length).toBeGreaterThan(0);
      expect(verbs.every((verb) => verb === 'SELECT')).toBe(true);
      // No transaction is opened at all.
      expect(txQuery).not.toHaveBeenCalled();
    });

    // §9.1 — with no order to attach it to, a rejection is an error envelope.
    it('throws a rejection instead of returning one', async () => {
      respond(repoQuery, [ownedPortfolio('10'), openQuantity()]);

      await expect(
        service.estimate(USER, PORTFOLIO, order()),
      ).rejects.toBeInstanceOf(OrderRejectedException);
    });

    it('404s an unowned portfolio before pricing anything', async () => {
      respond(repoQuery, []);

      await expect(
        service.estimate(USER, PORTFOLIO, order()),
      ).rejects.toBeInstanceOf(PortfolioNotFoundException);
      expect(getQuote).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    const KEY = 'idem-key-000001';

    const reserved = () => ({
      match: 'INSERT INTO auth.idempotency_records',
      rows: [{ idempotency_record_id: 'rec-1' }],
    });

    it('fetches the quote before opening the transaction', async () => {
      // §4 — a transient dependency failure must leave the key reusable, which
      // is only true if the quote is fetched before the key is reserved.
      respond(repoQuery, [ownedPortfolio()]);
      getQuote.mockRejectedValue(new Error('market-trading down'));

      await expect(
        service.submit(USER, PORTFOLIO, order(), KEY),
      ).rejects.toThrow();
      expect(txQuery).not.toHaveBeenCalled();
    });

    it('writes the order, fill, five fee rows, one cash row and a lot', async () => {
      respond(repoQuery, [ownedPortfolio()]);
      respond(txQuery, [reserved(), ownedPortfolio()]);

      const { body } = await service.submit(USER, PORTFOLIO, order(), KEY);

      const statements = txQuery.mock.calls.map((c) => c[0] as string);
      const count = (needle: string) =>
        statements.filter((s) => s.includes(needle)).length;

      expect(count('INSERT INTO auth.paper_orders')).toBe(1);
      expect(count('INSERT INTO auth.fills')).toBe(1);
      expect(count('INSERT INTO auth.fill_fees')).toBe(5);
      expect(count('INSERT INTO auth.cash_transactions')).toBe(1);
      expect(count('INSERT INTO auth.position_lots')).toBe(1);
      // A buy consumes nothing.
      expect(count('INSERT INTO auth.lot_disposals')).toBe(0);

      expect(body.status).toBe('filled');
      expect(body.fill?.cash_effect).toBe(-101120);
      expect(body.fill?.realized_pnl).toBeNull();
    });

    it('locks the portfolio row and re-reads cash inside the transaction', async () => {
      respond(repoQuery, [ownedPortfolio()]);
      respond(txQuery, [reserved(), ownedPortfolio()]);

      await service.submit(USER, PORTFOLIO, order(), KEY);

      const statements = txQuery.mock.calls.map((c) => c[0] as string);
      expect(
        statements.some(
          (s) =>
            s.includes('auth.virtual_portfolios') && s.includes('FOR UPDATE'),
        ),
      ).toBe(true);
    });

    it('locks open lots in FIFO order on a sell', async () => {
      respond(repoQuery, [ownedPortfolio()]);
      respond(txQuery, [
        reserved(),
        ownedPortfolio(),
        {
          match: 'FROM auth.position_lots',
          rows: [
            {
              lot_id: 'lot-1',
              quantity_original: 1000,
              quantity_remaining: 1000,
              cost_original: '101120.0000',
              cost_remaining: '101120.0000',
            },
          ],
        },
      ]);

      await service.submit(
        USER,
        PORTFOLIO,
        order({ side: 'sell', quantity: 400 }),
        KEY,
      );

      const lotLock = (
        txQuery.mock.calls.map((c) => c[0] as string) ?? []
      ).find(
        (s) =>
          s.includes('FROM auth.position_lots') && s.includes('FOR UPDATE'),
      );
      // §3.3 — the lock order must match the consumption order.
      expect(lotLock).toContain(
        'ORDER BY acquired_date ASC, created_at ASC, lot_id ASC',
      );
    });

    // §8.2 — sell 400 of a 1,000 lot costing 101,120 at 120.
    it('records disposals and realized P/L on a sell', async () => {
      respond(repoQuery, [ownedPortfolio()]);
      getQuote.mockResolvedValue({
        found: true,
        quote: { ...QUOTE, close: 120 },
      } as QuoteResult);
      respond(txQuery, [
        reserved(),
        ownedPortfolio(),
        {
          match: 'FROM auth.position_lots',
          rows: [
            {
              lot_id: 'lot-1',
              quantity_original: 1000,
              quantity_remaining: 1000,
              cost_original: '101120.0000',
              cost_remaining: '101120.0000',
            },
          ],
        },
      ]);

      const { body } = await service.submit(
        USER,
        PORTFOLIO,
        order({ side: 'sell', quantity: 400 }),
        KEY,
      );

      const statements = txQuery.mock.calls.map((c) => c[0] as string);
      expect(
        statements.filter((s) => s.includes('INSERT INTO auth.lot_disposals'))
          .length,
      ).toBe(1);
      // A sell opens no new lot.
      expect(
        statements.some((s) => s.includes('INSERT INTO auth.position_lots')),
      ).toBe(false);

      expect(body.fill?.cash_effect).toBe(47462.4);
      expect(body.fill?.realized_pnl).toBe(7014.4);
    });

    // §6.2 — a domain rejection is a persisted order, not an error.
    it('persists a rejection as a 201 order with no ledger movement', async () => {
      respond(repoQuery, [ownedPortfolio()]);
      respond(txQuery, [reserved(), ownedPortfolio('10')]);

      const { body } = await service.submit(USER, PORTFOLIO, order(), KEY);

      expect(body.status).toBe('rejected');
      expect(body.rejection_code).toBe('INSUFFICIENT_CASH');
      expect(body.filled_quantity).toBe(0);
      expect(body.fill).toBeNull();

      const statements = txQuery.mock.calls.map((c) => c[0] as string);
      for (const table of [
        'auth.fills',
        'auth.fill_fees',
        'auth.cash_transactions',
        'auth.position_lots',
        'auth.lot_disposals',
      ]) {
        expect(statements.some((s) => s.includes(`INSERT INTO ${table}`))).toBe(
          false,
        );
      }
      expect(
        statements.some((s) => s.includes('UPDATE auth.virtual_portfolios')),
      ).toBe(false);
    });

    it('replays a stored response without writing again', async () => {
      const stored = { order_id: 'existing', status: 'filled' };
      respond(repoQuery, [ownedPortfolio()]);
      // The reserve helper replays only when the stored hash matches the one
      // it recomputes, so the fixture has to carry the real hash.
      const storedHash = hashCanonicalRequest({
        symbol: 'COMB.N0000',
        side: 'buy',
        quantity: 1000,
      });
      txQuery.mockImplementation((sql: string) => {
        // No row returned from the reserving INSERT means the key already
        // exists, which is what sends the helper down the replay path.
        if (sql.includes('INSERT INTO auth.idempotency_records')) return [];
        if (sql.includes('SELECT request_hash')) {
          return [{ request_hash: storedHash, response_body: stored }];
        }
        return [];
      });

      const result = await service.submit(USER, PORTFOLIO, order(), KEY);

      expect(result.replayed).toBe(true);
      const statements = txQuery.mock.calls.map((c) => c[0] as string);
      expect(
        statements.some((s) => s.includes('INSERT INTO auth.paper_orders')),
      ).toBe(false);
    });
  });

  describe('get', () => {
    it('404s an order that is not in this portfolio', async () => {
      repoQuery.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('FROM auth.virtual_portfolios')
            ? [{ cash_balance: '1000000' }]
            : [],
        ),
      );

      await expect(
        service.get(USER, PORTFOLIO, 'cccccccc-0000-4000-8000-000000000003'),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
    });
  });
});

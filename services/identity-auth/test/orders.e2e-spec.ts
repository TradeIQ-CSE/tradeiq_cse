import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { DependencyUnavailableException } from '../src/common/errors/api-exception';
import { AppModule } from '../src/app.module';
import { configureIdentityAuthApp } from '../src/app.setup';
import {
  ExecutionQuote,
  MarketTradingClient,
  QuoteResult,
} from '../src/market-trading/market-trading.client';

// docs/api/paper-trading-v1.md §6.
//
// market-trading is stubbed rather than reached over HTTP, so a stale or
// unpriced quote can be pinned without seeding a second database. The stub
// removes the HTTP path only — the boundary itself is asserted separately in
// the 'service boundary' block below.
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let userId: string;
  let token: string;
  let portfolioId: string;
  let quote: jest.Mock;
  let valuations: jest.Mock;

  const LISTED: ExecutionQuote = {
    symbol: 'COMB.N0000',
    listing_status: 'listed',
    market_as_of: '2025-01-10',
    price_as_of: '2025-01-10',
    close: 100,
    settlement_date: '2025-01-14',
  };

  beforeAll(async () => {
    quote = jest.fn();
    valuations = jest.fn();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MarketTradingClient)
      .useValue({ getQuote: quote, getValuations: valuations })
      .compile();

    app = moduleFixture.createNestApplication();
    configureIdentityAuthApp(app);
    await app.init();
    jwtService = app.get(JwtService);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const submit = (body: object, key: string) =>
    api()
      .post(`/portfolios/${portfolioId}/orders`)
      .set(auth())
      .set('Idempotency-Key', key)
      .send(body);

  // trace_id is a fresh uuid per response.
  const envelope = (body: { error: Record<string, unknown> }) => {
    const { trace_id, ...rest } = body.error;
    expect(trace_id).toEqual(expect.any(String));
    return rest;
  };

  async function createUser(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO auth.users (user_id, email_encrypted, email_hash, password_hash, display_name)
       VALUES ($1, 'enc', $2, 'hash', 'Test User')`,
      [id, `hash-${id}`],
    );
    return id;
  }

  beforeEach(async () => {
    await dataSource.query(
      `TRUNCATE auth.lot_disposals, auth.fill_fees, auth.fills, auth.paper_orders,
                auth.position_lots, auth.idempotency_records,
                auth.cash_transactions, auth.virtual_portfolios, auth.users CASCADE`,
    );
    userId = await createUser();
    token = await jwtService.signAsync({ sub: userId }, { expiresIn: '5m' });
    quote.mockReset();
    quote.mockResolvedValue({ found: true, quote: LISTED } as QuoteResult);
    valuations.mockReset();

    const created = await api()
      .post('/portfolios')
      .set(auth())
      .set('Idempotency-Key', `seed-${randomUUID()}`)
      .send({ name: 'Orders portfolio', starting_capital: 1000000 })
      .expect(201);
    portfolioId = created.body.data.portfolio_id;
  });

  // §8.1 — buy 1,000 @ 100 debits 101,120 and opens a lot at that cost.
  describe('a filled buy', () => {
    it('writes the order, fill, fees, one cash row and a lot atomically', async () => {
      const response = await submit(
        { symbol: 'comb.n0000', side: 'buy', quantity: 1000 },
        'buy-key-000001',
      ).expect(201);

      expect(response.body.data).toMatchObject({
        symbol: 'COMB.N0000',
        status: 'filled',
        filled_quantity: 1000,
        rejection_code: null,
      });
      expect(response.body.data.fill).toMatchObject({
        fill_date: '2025-01-10',
        settlement_date: '2025-01-14',
        gross_consideration: 100000,
        fee_total: 1120,
        cash_effect: -101120,
        realized_pnl: null,
      });

      const [counts] = await dataSource.query(
        `SELECT (SELECT count(*) FROM auth.fills WHERE portfolio_id = $1) AS fills,
                (SELECT count(*) FROM auth.fill_fees ff JOIN auth.fills f USING (fill_id)
                  WHERE f.portfolio_id = $1) AS fees,
                (SELECT count(*) FROM auth.cash_transactions
                  WHERE portfolio_id = $1 AND transaction_type = 'buy_debit') AS cash,
                (SELECT count(*) FROM auth.position_lots WHERE portfolio_id = $1) AS lots`,
        [portfolioId],
      );
      expect(counts).toEqual({ fills: '1', fees: '5', cash: '1', lots: '1' });
    });

    it('leaves cash, the ledger and the lot in agreement', async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'buy-key-000002',
      ).expect(201);

      const [row] = await dataSource.query(
        `SELECT p.cash_balance,
                (SELECT balance_after FROM auth.cash_transactions
                  WHERE portfolio_id = p.portfolio_id
                  ORDER BY created_at DESC LIMIT 1) AS last_balance,
                (SELECT cost_original FROM auth.position_lots
                  WHERE portfolio_id = p.portfolio_id) AS lot_cost
           FROM auth.virtual_portfolios p WHERE p.portfolio_id = $1`,
        [portfolioId],
      );

      expect(row.cash_balance).toBe('898880.0000');
      expect(row.last_balance).toBe('898880.0000');
      // §3.3 — the lot's cost is the gross plus all buy fees, i.e. the debit.
      expect(row.lot_cost).toBe('101120.0000');
    });
  });

  // §8.2 — sell 400 of that lot at 120.
  describe('a filled sell', () => {
    beforeEach(async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'sell-setup-0001',
      ).expect(201);
      quote.mockResolvedValue({
        found: true,
        quote: { ...LISTED, close: 120 },
      } as QuoteResult);
    });

    it('realizes P/L against the FIFO lot and records the disposal', async () => {
      const response = await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 400 },
        'sell-key-000001',
      ).expect(201);

      expect(response.body.data.fill).toMatchObject({
        gross_consideration: 48000,
        fee_total: 537.6,
        cash_effect: 47462.4,
        realized_pnl: 7014.4,
      });

      const [lot] = await dataSource.query(
        `SELECT quantity_remaining, cost_remaining FROM auth.position_lots
          WHERE portfolio_id = $1`,
        [portfolioId],
      );
      expect(lot.quantity_remaining).toBe(600);
      expect(lot.cost_remaining).toBe('60672.0000');

      const [disposal] = await dataSource.query(
        `SELECT d.quantity, d.allocated_cost FROM auth.lot_disposals d
           JOIN auth.fills f ON f.fill_id = d.sell_fill_id
          WHERE f.portfolio_id = $1`,
        [portfolioId],
      );
      expect(disposal.quantity).toBe(400);
      expect(disposal.allocated_cost).toBe('40448.0000');
    });

    it('keeps the cash ledger reconciled across both fills', async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 400 },
        'sell-key-000002',
      ).expect(201);

      const [row] = await dataSource.query(
        `SELECT p.starting_capital + COALESCE(SUM(c.amount) FILTER
                  (WHERE c.transaction_type <> 'initial_capital'), 0) AS derived,
                p.cash_balance
           FROM auth.virtual_portfolios p
           JOIN auth.cash_transactions c ON c.portfolio_id = p.portfolio_id
          WHERE p.portfolio_id = $1
          GROUP BY p.starting_capital, p.cash_balance`,
        [portfolioId],
      );
      expect(row.derived).toBe(row.cash_balance);
    });
  });

  // §3.3 — lots are consumed by acquired_date, then created_at, then lot_id.
  describe('FIFO across multiple lots', () => {
    beforeEach(async () => {
      // The later-dated lot is bought FIRST so insertion order is the reverse
      // of FIFO order. Without that, a missing ORDER BY would still return the
      // rows in the right sequence and the test would pass on luck.
      quote.mockResolvedValue({
        found: true,
        quote: {
          ...LISTED,
          market_as_of: '2025-01-10',
          price_as_of: '2025-01-10',
          close: 60,
        },
      } as QuoteResult);
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 100 },
        'fifo-later-0001',
      ).expect(201);

      quote.mockResolvedValue({
        found: true,
        quote: {
          ...LISTED,
          market_as_of: '2025-01-08',
          price_as_of: '2025-01-08',
          settlement_date: '2025-01-10',
          close: 50,
        },
      } as QuoteResult);
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 100 },
        'fifo-earlier-001',
      ).expect(201);

      quote.mockResolvedValue({
        found: true,
        quote: {
          ...LISTED,
          market_as_of: '2025-01-10',
          price_as_of: '2025-01-10',
          close: 70,
        },
      } as QuoteResult);
    });

    it('consumes the earlier lot first even though it was created second', async () => {
      const response = await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 150 },
        'fifo-sell-00001',
      ).expect(201);

      // Earlier lot costs 5,056.00 and is closed exactly; 50 of the later lot
      // (6,067.20 for 100) allocates 3,033.60. Consuming by insertion order
      // instead would allocate 6,067.20 first and realize a different figure.
      expect(response.body.data.fill.realized_pnl).toBe(2292.8);

      const disposals = await dataSource.query(
        `SELECT l.acquired_date, d.quantity, d.allocated_cost
           FROM auth.lot_disposals d
           JOIN auth.position_lots l ON l.lot_id = d.lot_id
          ORDER BY l.acquired_date ASC`,
      );
      expect(disposals).toHaveLength(2);
      expect(disposals[0].quantity).toBe(100);
      expect(disposals[0].allocated_cost).toBe('5056.0000');
      expect(disposals[1].quantity).toBe(50);
      expect(disposals[1].allocated_cost).toBe('3033.6000');
    });

    it('closes the earlier lot exactly and leaves the later one part-open', async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 150 },
        'fifo-sell-00002',
      ).expect(201);

      const lots = await dataSource.query(
        `SELECT acquired_date, quantity_remaining, cost_remaining
           FROM auth.position_lots WHERE portfolio_id = $1
          ORDER BY acquired_date ASC`,
        [portfolioId],
      );
      // The closing allocation takes the lot's exact remainder, so nothing is
      // stranded behind (§3.3).
      expect(lots[0].quantity_remaining).toBe(0);
      expect(lots[0].cost_remaining).toBe('0.0000');
      expect(lots[1].quantity_remaining).toBe(50);
      expect(lots[1].cost_remaining).toBe('3033.6000');
    });
  });

  // §6.1 — a pre-trade preview that reserves nothing and writes nothing.
  describe('estimate', () => {
    it('answers 200, not the 201 a POST defaults to', async () => {
      const response = await api()
        .post(`/portfolios/${portfolioId}/orders/estimate`)
        .set(auth())
        .send({ symbol: 'comb.n0000', side: 'buy', quantity: 1000 })
        .expect(200);

      expect(response.body.data).toMatchObject({
        symbol: 'COMB.N0000',
        price: 100,
        gross_consideration: 100000,
        fee_total: 1120,
        cash_effect: -101120,
      });
      expect(response.body.data.fees).toHaveLength(5);
    });

    it('writes nothing to the ledger', async () => {
      await api()
        .post(`/portfolios/${portfolioId}/orders/estimate`)
        .set(auth())
        .send({ symbol: 'COMB.N0000', side: 'buy', quantity: 1000 })
        .expect(200);

      const [after] = await dataSource.query(
        `SELECT (SELECT count(*) FROM auth.paper_orders WHERE portfolio_id = $1) AS orders,
                (SELECT count(*) FROM auth.fills WHERE portfolio_id = $1) AS fills,
                (SELECT count(*) FROM auth.idempotency_records) AS keys,
                (SELECT cash_balance FROM auth.virtual_portfolios WHERE portfolio_id = $1) AS balance`,
        [portfolioId],
      );
      expect(after.orders).toBe('0');
      expect(after.fills).toBe('0');
      // Only the portfolio-creation key.
      expect(after.keys).toBe('1');
      expect(after.balance).toBe('1000000.0000');
    });

    // §9.1 — the same conditions that submission persists are error envelopes
    // here, because there is no order to attach them to.
    it('renders a rejection as an error envelope rather than an order', async () => {
      const unaffordable = await api()
        .post(`/portfolios/${portfolioId}/orders/estimate`)
        .set(auth())
        .send({ symbol: 'COMB.N0000', side: 'buy', quantity: 100000 })
        .expect(422);
      expect(envelope(unaffordable.body).code).toBe('INSUFFICIENT_CASH');

      quote.mockResolvedValue({ found: false } as QuoteResult);
      const unknown = await api()
        .post(`/portfolios/${portfolioId}/orders/estimate`)
        .set(auth())
        .send({ symbol: 'NOPE.X0000', side: 'buy', quantity: 1 })
        .expect(404);
      expect(envelope(unknown.body).code).toBe('SECURITY_NOT_FOUND');
    });
  });

  // §6.2 — a domain rejection is a persisted 201 order, not an error.
  describe('rejections', () => {
    it.each([
      [
        'INSUFFICIENT_CASH',
        { symbol: 'COMB.N0000', side: 'buy', quantity: 100000 },
        () => undefined,
      ],
      [
        'INSUFFICIENT_HOLDINGS',
        { symbol: 'COMB.N0000', side: 'sell', quantity: 10 },
        () => undefined,
      ],
      [
        'SECURITY_NOT_FOUND',
        { symbol: 'NOPE.X0000', side: 'buy', quantity: 1 },
        () => quote.mockResolvedValue({ found: false } as QuoteResult),
      ],
      [
        'SECURITY_NOT_TRADABLE',
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1 },
        () =>
          quote.mockResolvedValue({
            found: true,
            quote: { ...LISTED, listing_status: 'delisted' },
          } as QuoteResult),
      ],
      [
        'PRICE_UNAVAILABLE',
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1 },
        () =>
          quote.mockResolvedValue({
            found: true,
            quote: {
              ...LISTED,
              close: null,
              price_as_of: null,
              settlement_date: null,
            },
          } as QuoteResult),
      ],
      [
        'STALE_PRICE',
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1 },
        () =>
          quote.mockResolvedValue({
            found: true,
            quote: { ...LISTED, price_as_of: '2025-01-09' },
          } as QuoteResult),
      ],
    ])(
      'records %s as a 201 order with no ledger movement',
      async (code, body, setup) => {
        setup();

        const response = await submit(body, `reject-${code}`).expect(201);

        expect(response.body.data).toMatchObject({
          status: 'rejected',
          rejection_code: code,
          filled_quantity: 0,
          fill: null,
        });

        const [after] = await dataSource.query(
          `SELECT (SELECT count(*) FROM auth.fills WHERE portfolio_id = $1) AS fills,
                (SELECT count(*) FROM auth.position_lots WHERE portfolio_id = $1) AS lots,
                (SELECT count(*) FROM auth.cash_transactions WHERE portfolio_id = $1) AS cash,
                (SELECT cash_balance FROM auth.virtual_portfolios WHERE portfolio_id = $1) AS balance`,
          [portfolioId],
        );
        expect(after.fills).toBe('0');
        expect(after.lots).toBe('0');
        // Only the opening capital row.
        expect(after.cash).toBe('1');
        expect(after.balance).toBe('1000000.0000');
      },
    );
  });

  // §4
  describe('idempotency', () => {
    it('replays the original response without a second fill', async () => {
      const body = { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 };
      const first = await submit(body, 'replay-key-0001').expect(201);
      const second = await submit(body, 'replay-key-0001').expect(201);

      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.data.order_id).toBe(first.body.data.order_id);

      const [counts] = await dataSource.query(
        `SELECT (SELECT count(*) FROM auth.fills WHERE portfolio_id = $1) AS fills,
                (SELECT count(*) FROM auth.paper_orders WHERE portfolio_id = $1) AS orders`,
        [portfolioId],
      );
      expect(counts).toEqual({ fills: '1', orders: '1' });
    });

    it('409s the same key with a different request', async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'conflict-key-01',
      ).expect(201);

      const conflict = await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 500 },
        'conflict-key-01',
      ).expect(409);

      expect(envelope(conflict.body).code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    // §4 — a transient dependency failure is not stored, so the key stays
    // usable. Without this the user would be locked out by an outage.
    it('leaves the key reusable after a dependency failure', async () => {
      // The real client converts a timeout or 5xx into this exception, so the
      // stub has to throw the same thing — rejecting with a bare Error would
      // test the stub's behaviour rather than the service's.
      quote.mockRejectedValueOnce(new DependencyUnavailableException());

      const failed = await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'transient-key-1',
      ).expect(503);
      expect(envelope(failed.body).code).toBe('DEPENDENCY_UNAVAILABLE');

      const retried = await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'transient-key-1',
      ).expect(201);
      expect(retried.body.data.status).toBe('filled');
      expect(retried.headers['idempotent-replayed']).toBeUndefined();
    });
  });

  describe('reads', () => {
    beforeEach(async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'read-setup-0001',
      ).expect(201);
      quote.mockResolvedValue({ found: false } as QuoteResult);
      await submit(
        { symbol: 'NOPE.X0000', side: 'buy', quantity: 1 },
        'read-setup-0002',
      ).expect(201);
    });

    it('lists orders newest first and filters by status', async () => {
      const all = await api()
        .get(`/portfolios/${portfolioId}/orders`)
        .set(auth())
        .expect(200);
      expect(all.body.meta.total).toBe(2);

      const rejected = await api()
        .get(`/portfolios/${portfolioId}/orders?status=rejected`)
        .set(auth())
        .expect(200);
      expect(rejected.body.meta.total).toBe(1);
      expect(rejected.body.data[0].rejection_code).toBe('SECURITY_NOT_FOUND');
    });

    it('returns a single order with its nested fill and fee rows on the fill list', async () => {
      const list = await api()
        .get(`/portfolios/${portfolioId}/orders?status=filled`)
        .set(auth())
        .expect(200);
      const orderId = list.body.data[0].order_id;

      const single = await api()
        .get(`/portfolios/${portfolioId}/orders/${orderId}`)
        .set(auth())
        .expect(200);
      expect(single.body.data.fill).not.toBeNull();

      const fills = await api()
        .get(`/portfolios/${portfolioId}/fills`)
        .set(auth())
        .expect(200);
      expect(fills.body.meta.total).toBe(1);
      expect(fills.body.data[0].fees).toHaveLength(5);
    });
  });

  // CONTRIBUTING.md / SRS 3.6.2 — each service owns its database exclusively.
  describe('service boundary', () => {
    // Stubbing the quote client proves nothing about SQL, so assert the
    // guarantee at the level that actually enforces it: docker/db/init.sql
    // revokes CONNECT per database, so identity-auth's role cannot reach
    // market_data no matter what any query says. This fails if someone grants
    // the role access to make a shortcut work.
    it('cannot connect to the market_data database at all', async () => {
      const [privileges] = await dataSource.query(
        `SELECT has_database_privilege(current_user, 'market_data', 'CONNECT') AS market_data,
                has_database_privilege(current_user, current_database(), 'CONNECT') AS own`,
      );

      expect(privileges.market_data).toBe(false);
      // Guards against the assertion above passing for the wrong reason, such
      // as the role having no privileges anywhere.
      expect(privileges.own).toBe(true);
    });

    it('holds no market_data tables in its own catalogue', async () => {
      const rows = await dataSource.query(
        `SELECT table_schema FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema') AND table_schema LIKE 'market%'`,
      );
      expect(rows).toEqual([]);
    });
  });

  // §5.3, §6.4 — an identifier must not reveal whether it exists.
  describe('ownership', () => {
    it('returns the same PORTFOLIO_NOT_FOUND for another user and for nothing', async () => {
      const otherId = await createUser();
      const otherToken = await jwtService.signAsync(
        { sub: otherId },
        { expiresIn: '5m' },
      );

      const otherUsers = await api()
        .get(`/portfolios/${portfolioId}/orders`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      const neverExisted = await api()
        .get(`/portfolios/${randomUUID()}/orders`)
        .set(auth())
        .expect(404);

      expect(envelope(otherUsers.body)).toEqual(envelope(neverExisted.body));
    });

    it('404s an order id that belongs to no order in this portfolio', async () => {
      const missing = await api()
        .get(`/portfolios/${portfolioId}/orders/${randomUUID()}`)
        .set(auth())
        .expect(404);

      expect(envelope(missing.body).code).toBe('ORDER_NOT_FOUND');
    });
  });
  // docs/api/paper-trading-v1.md §7. The §7.1 and §7.2 sample responses are the
  // §8.1 buy followed by the §8.2 sell, so this runs both through the real
  // order path and checks the views report exactly what the contract prints.
  describe('positions and summary after the §8 worked example', () => {
    beforeEach(async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'buy', quantity: 1000 },
        'valuation-buy-01',
      ).expect(201);
      quote.mockResolvedValue({
        found: true,
        quote: { ...LISTED, close: 120 },
      } as QuoteResult);
      await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 400 },
        'valuation-sell-01',
      ).expect(201);

      valuations.mockResolvedValue({
        as_of: '2025-01-10',
        prices: [{ symbol: 'COMB.N0000', close: 120 }],
      });
    });

    it('reports the position exactly as §7.1 prints it', async () => {
      const response = await api()
        .get(`/portfolios/${portfolioId}/positions`)
        .set(auth())
        .expect(200);

      expect(response.body).toEqual({
        data: [
          {
            symbol: 'COMB.N0000',
            quantity: 600,
            cost_basis: 60672,
            average_cost: 101.12,
            price: 120,
            market_value: 72000,
            unrealized_pnl: 11328,
            unrealized_return_pct: 18.67,
          },
        ],
        meta: { as_of: '2025-01-10', total: 1 },
      });

      // Only the symbols actually held are priced.
      expect(valuations).toHaveBeenCalledWith(['COMB.N0000'], undefined);
    });

    it('reports the summary exactly as §7.2 prints it', async () => {
      const response = await api()
        .get(`/portfolios/${portfolioId}/summary`)
        .set(auth())
        .expect(200);

      expect(response.body.data).toEqual({
        portfolio_id: portfolioId,
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

    it('keeps cash plus holdings equal to equity in the figures it returns', async () => {
      const { body } = await api()
        .get(`/portfolios/${portfolioId}/summary`)
        .set(auth())
        .expect(200);

      expect(body.data.cash_balance + body.data.holdings_value).toBe(
        body.data.total_equity,
      );
    });

    // §3.4: an unpriced holding "never treats the position as worth zero".
    it('returns 422 naming the holding with no close on the session', async () => {
      valuations.mockResolvedValue({
        as_of: '2025-01-10',
        prices: [{ symbol: 'COMB.N0000', close: null }],
      });

      for (const path of ['positions', 'summary']) {
        const response = await api()
          .get(`/portfolios/${portfolioId}/${path}`)
          .set(auth())
          .expect(422);

        expect(envelope(response.body)).toEqual({
          code: 'PRICE_UNAVAILABLE',
          message:
            'No price is available for COMB.N0000 on the requested session.',
        });
      }
    });

    // The order path already refuses a non-positive close (§2.2); valuation has
    // to agree, or a stored 0.0000 would report the holding as worth nothing —
    // exactly the "position worth zero" §3.4 rules out.
    it.each([0, -1])(
      'returns 422 for a close of %s rather than valuing it',
      async (close) => {
        valuations.mockResolvedValue({
          as_of: '2025-01-10',
          prices: [{ symbol: 'COMB.N0000', close }],
        });

        const response = await api()
          .get(`/portfolios/${portfolioId}/summary`)
          .set(auth())
          .expect(422);

        expect(response.body.error.code).toBe('PRICE_UNAVAILABLE');
      },
    );

    it('drops a position once the whole holding is sold', async () => {
      await submit(
        { symbol: 'COMB.N0000', side: 'sell', quantity: 600 },
        'valuation-sell-02',
      ).expect(201);
      valuations.mockResolvedValue({ as_of: '2025-01-10', prices: [] });

      const positions = await api()
        .get(`/portfolios/${portfolioId}/positions`)
        .set(auth())
        .expect(200);
      expect(positions.body.data).toEqual([]);

      // The realized P/L of both sells survives the position closing.
      const summary = await api()
        .get(`/portfolios/${portfolioId}/summary`)
        .set(auth())
        .expect(200);
      expect(summary.body.data.holdings_value).toBe(0);
      expect(summary.body.data.realized_pnl).toBeGreaterThan(7014.4);
      expect(summary.body.data.total_equity).toBe(
        summary.body.data.cash_balance,
      );
    });
  });
});

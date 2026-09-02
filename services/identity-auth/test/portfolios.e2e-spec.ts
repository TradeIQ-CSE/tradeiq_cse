import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureIdentityAuthApp } from '../src/app.setup';
import {
  DependencyUnavailableException,
  ValidationFailedException,
} from '../src/common/errors/api-exception';
import { MarketTradingClient } from '../src/market-trading/market-trading.client';

// docs/api/paper-trading-v1.md §5. Test users come from the real signup
// endpoint (docs/api/auth-v1.md §4.1), so these tests exercise the same token
// path a browser does rather than a hand-minted one.
describe('Portfolios (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  // §7 prices positions through market-trading. Stubbed rather than reached
  // over HTTP, the same way test/orders.e2e-spec.ts does it, so a missing
  // close or an unreachable dependency can be pinned without a second
  // database.
  let valuations: jest.Mock;

  beforeAll(async () => {
    valuations = jest.fn();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MarketTradingClient)
      .useValue({ getValuations: valuations })
      .compile();

    app = moduleFixture.createNestApplication();
    configureIdentityAuthApp(app);
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(): Promise<{ userId: string; token: string }> {
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `${randomUUID()}@example.lk`,
        password: 'correct horse battery staple',
        display_name: 'Test User',
      })
      .expect(201);

    return {
      userId: response.body.data.user.user_id,
      token: response.body.data.access_token,
    };
  }

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE auth.idempotency_records, auth.cash_transactions, auth.virtual_portfolios, auth.users CASCADE',
    );
    ({ token } = await createUser());
  });

  it('creates a portfolio atomically with one opening cash transaction', async () => {
    const response = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-1')
      .send({ name: 'Evaluation portfolio', starting_capital: 1000000 })
      .expect(201);

    expect(response.body.data).toMatchObject({
      name: 'Evaluation portfolio',
      currency: 'LKR',
      starting_capital: 1000000,
      cash_balance: 1000000,
      status: 'active',
    });

    const portfolioId = response.body.data.portfolio_id;
    const ledger = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}/cash-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(ledger.body.data).toHaveLength(1);
    expect(ledger.body.data[0]).toMatchObject({
      type: 'initial_capital',
      amount: 1000000,
      balance_after: 1000000,
    });
  });

  it('replays the same response for a repeated Idempotency-Key with the same body', async () => {
    const payload = { name: 'Replay test', starting_capital: 200000 };
    const first = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'replay-key')
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'replay-key')
      .send(payload)
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotent-replayed']).toBe('true');

    const list = await request(app.getHttpServer())
      .get('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
  });

  it('rejects a reused Idempotency-Key with a different body', async () => {
    await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'conflict-key')
      .send({ name: 'A', starting_capital: 200000 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'conflict-key')
      .send({ name: 'B', starting_capital: 300000 })
      .expect(409);

    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requires an Idempotency-Key header on create', async () => {
    const response = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No key', starting_capital: 200000 })
      .expect(400);

    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('returns the same 404 for a missing, deleted, or other-user portfolio', async () => {
    const created = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'delete-key')
      .send({ name: 'To delete', starting_capital: 200000 })
      .expect(201);
    const portfolioId = created.body.data.portfolio_id;

    await request(app.getHttpServer())
      .delete(`/portfolios/${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const deleted = await request(app.getHttpServer())
      .get(`/portfolios/${portfolioId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const { token: otherToken } = await createUser();

    const otherCreated = await request(app.getHttpServer())
      .post('/portfolios')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('Idempotency-Key', 'other-key')
      .send({ name: 'Other portfolio', starting_capital: 200000 })
      .expect(201);

    const otherUsers = await request(app.getHttpServer())
      .get(`/portfolios/${otherCreated.body.data.portfolio_id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const neverExisted = await request(app.getHttpServer())
      .get(`/portfolios/${randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    // The envelopes must be indistinguishable, or the response itself
    // discloses whether a portfolio exists and who owns it. trace_id is
    // per-request by design, so compare everything else.
    const envelope = (res: { body: { error: Record<string, unknown> } }) => {
      const { trace_id, ...rest } = res.body.error;
      expect(trace_id).toEqual(expect.any(String));
      return rest;
    };

    expect(envelope(deleted)).toEqual({
      code: 'PORTFOLIO_NOT_FOUND',
      message: 'Portfolio not found.',
    });
    expect(envelope(otherUsers)).toEqual(envelope(deleted));
    expect(envelope(neverExisted)).toEqual(envelope(deleted));
  });
  // docs/api/paper-trading-v1.md §7. The valuation arithmetic is unit-tested in
  // src/portfolios/positions.spec.ts against the §8 vectors, and the full
  // buy-then-sell path is covered in orders.e2e-spec.ts; these cover the HTTP
  // surface — ownership, the envelope, and what happens when pricing fails.
  describe('positions and summary', () => {
    let portfolioId: string;

    beforeEach(async () => {
      const created = await request(app.getHttpServer())
        .post('/portfolios')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Valuation', starting_capital: 1000000 })
        .expect(201);
      portfolioId = created.body.data.portfolio_id;

      valuations.mockReset();
      valuations.mockResolvedValue({ as_of: '2025-01-10', prices: [] });
    });

    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/portfolios/${portfolioId}${path}`)
        .set('Authorization', `Bearer ${token}`);

    it('reports an empty portfolio as cash only, at the effective session', async () => {
      const positions = await get('/positions').expect(200);
      expect(positions.body).toEqual({
        data: [],
        meta: { as_of: '2025-01-10', total: 0 },
      });

      const summary = await get('/summary').expect(200);
      expect(summary.body.data).toEqual({
        portfolio_id: portfolioId,
        currency: 'LKR',
        as_of: '2025-01-10',
        starting_capital: 1000000,
        cash_balance: 1000000,
        holdings_value: 0,
        total_equity: 1000000,
        realized_pnl: 0,
        unrealized_pnl: 0,
        total_pnl: 0,
        total_return_pct: 0,
      });
    });

    // An empty portfolio still asks for the session, so a bad date is reported
    // rather than silently ignored.
    it('still resolves the session when nothing is held', async () => {
      await get('/positions').expect(200);

      expect(valuations).toHaveBeenCalledWith([], undefined);
    });

    it('passes as_of through to the valuation boundary', async () => {
      await get('/positions?as_of=2025-01-12').expect(200);

      expect(valuations).toHaveBeenCalledWith([], '2025-01-12');
    });

    it('rejects an as_of that is not a calendar date before calling out', async () => {
      const response = await get('/summary?as_of=12-01-2025').expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.fields).toEqual([
        expect.objectContaining({ field: 'as_of' }),
      ]);
      expect(valuations).not.toHaveBeenCalled();
    });

    // market-trading owns the available price range, so an in-range check it
    // fails must surface as the user's 400, not as a 503 they would retry.
    it('surfaces an out-of-range as_of from market-trading as a 400', async () => {
      valuations.mockRejectedValue(
        new ValidationFailedException([
          {
            field: 'as_of',
            reason: 'must fall between 2017-01-02 and 2025-01-10',
          },
        ]),
      );

      const response = await get('/positions?as_of=2030-01-01').expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('reports an unreachable market-trading as 503', async () => {
      valuations.mockRejectedValue(new DependencyUnavailableException());

      const response = await get('/summary').expect(503);

      expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    });

    it("returns the same 404 as every other route for another user's portfolio", async () => {
      const other = await createUser();
      const theirs = await request(app.getHttpServer())
        .post('/portfolios')
        .set('Authorization', `Bearer ${other.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Theirs', starting_capital: 500000 })
        .expect(201);

      for (const path of ['positions', 'summary']) {
        const response = await request(app.getHttpServer())
          .get(`/portfolios/${theirs.body.data.portfolio_id}/${path}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(404);
        expect(response.body.error.code).toBe('PORTFOLIO_NOT_FOUND');
      }

      // Ownership is checked before pricing, so nothing leaks to the boundary.
      expect(valuations).not.toHaveBeenCalled();
    });

    it('requires a bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/portfolios/${portfolioId}/positions`)
        .expect(401);
    });
  });
});

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureIdentityAuthApp } from '../src/app.setup';

// docs/api/paper-trading-v1.md §5 — no signup endpoint exists yet, so a test
// user is inserted directly into auth.users to satisfy the FK on
// virtual_portfolios, and a JWT is minted the same way app.e2e-spec.ts does.
describe('Portfolios (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureIdentityAuthApp(app);
    await app.init();
    jwtService = app.get(JwtService);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

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
      'TRUNCATE auth.idempotency_records, auth.cash_transactions, auth.virtual_portfolios, auth.users CASCADE',
    );
    userId = await createUser();
    token = await jwtService.signAsync({ sub: userId }, { expiresIn: '5m' });
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

    const otherUserId = await createUser();
    const otherToken = await jwtService.signAsync(
      { sub: otherUserId },
      { expiresIn: '5m' },
    );

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
});

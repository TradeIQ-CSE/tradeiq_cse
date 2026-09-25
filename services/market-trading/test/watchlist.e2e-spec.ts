import { randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';

// docs/api/watchlist-v1.md, against the seeded sample (see the CI "seed" job).
// The sample holds six securities, so the ten-item limit is exercised with
// extra price-less securities created here and removed afterwards.
describe('Watchlist (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let signer: TestSigner;
  let token: string;

  const extraSymbols = Array.from({ length: 10 }, (_, i) => `WLTEST${i}`);

  beforeAll(async () => {
    signer = createTestSigner();
    process.env.AUTH_JWT_PUBLIC_KEYS = signer.publicKeys;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
    dataSource = app.get(DataSource);

    for (const symbol of extraSymbols) {
      await dataSource.query(
        `INSERT INTO market_data.securities (security_id, symbol, company_name)
         VALUES ($1, $2, $3) ON CONFLICT (symbol) DO NOTHING`,
        [randomUUID(), symbol, `${symbol} test company`],
      );
    }
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE market_data.watchlist_items');
    await dataSource.query(
      'DELETE FROM market_data.securities WHERE symbol = ANY($1)',
      [extraSymbols],
    );
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE market_data.watchlist_items');
    token = signer.sign({ sub: randomUUID() });
  });

  const server = () => app.getHttpServer();
  const add = (symbol: string, as = token) =>
    request(server())
      .post('/watchlist')
      .set('Authorization', `Bearer ${as}`)
      .send({ symbol });

  it('requires a signed-in user', async () => {
    await request(server()).get('/watchlist').expect(401);
  });

  it('starts empty and reports the limit', async () => {
    const response = await request(server())
      .get('/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ data: { limit: 10, items: [] } });
  });

  it('adds by any casing and prices each row from its own latest session', async () => {
    const response = await add('jkh.n0000').expect(200);
    const [item] = response.body.data.items;
    expect(item).toMatchObject({
      symbol: 'JKH.N0000',
      company_name: expect.any(String),
      trade_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      close: expect.any(Number),
    });

    const [latest, previous] = await dataSource.query(
      `SELECT p.close FROM market_data.daily_prices p
       JOIN market_data.securities s USING (security_id)
       WHERE s.symbol = 'JKH.N0000'
       ORDER BY p.trade_date DESC LIMIT 2`,
    );
    expect(item.close).toBe(Number(latest.close));
    expect(item.change).toBeCloseTo(
      Number(latest.close) - Number(previous.close),
      4,
    );
  });

  it('keeps the order things were added in and ignores repeats', async () => {
    await add('JKH.N0000').expect(200);
    await add('HNB.N0000').expect(200);
    const response = await add('JKH.N0000').expect(200);
    expect(
      response.body.data.items.map((i: { symbol: string }) => i.symbol),
    ).toEqual(['JKH.N0000', 'HNB.N0000']);
  });

  it('answers 404 for an unknown symbol', async () => {
    const response = await add('NOPE.N0000').expect(404);
    expect(response.body.error.code).toBe('SECURITY_NOT_FOUND');
  });

  it('rejects a malformed body', async () => {
    const response = await add('').expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('stops at ten', async () => {
    for (const symbol of extraSymbols) await add(symbol).expect(200);
    const response = await add('JKH.N0000').expect(422);
    expect(response.body.error.code).toBe('WATCHLIST_FULL');

    // A price-less security is listed with null prices, not dropped.
    const list = await request(server())
      .get('/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(10);
    expect(list.body.data.items[0]).toMatchObject({
      trade_date: null,
      close: null,
      change: null,
      change_pct: null,
    });
  });

  it('never lets concurrent adds pass the limit', async () => {
    for (const symbol of extraSymbols.slice(0, 9))
      await add(symbol).expect(200);
    const results = await Promise.all([
      add('JKH.N0000'),
      add('HNB.N0000'),
      add('COMB.N0000'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 422, 422]);
  });

  it('removes idempotently and only for the caller', async () => {
    const other = signer.sign({ sub: randomUUID() });
    await add('JKH.N0000').expect(200);
    await add('JKH.N0000', other).expect(200);

    await request(server())
      .delete('/watchlist/jkh.n0000')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(server())
      .delete('/watchlist/JKH.N0000')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const mine = await request(server())
      .get('/watchlist')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const theirs = await request(server())
      .get('/watchlist')
      .set('Authorization', `Bearer ${other}`)
      .expect(200);
    expect(mine.body.data.items).toEqual([]);
    expect(theirs.body.data.items).toHaveLength(1);
  });
});

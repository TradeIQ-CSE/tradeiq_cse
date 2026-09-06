process.env.MARKET_DATA_DATABASE_URL =
  process.env.MARKET_DATA_DATABASE_URL ||
  'postgresql://market_data:changeme@localhost:5432/market_data';
process.env.MARKET_INGESTION_TOKEN = 'test-market-ingestion-token';

import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { DataSource } from 'typeorm';
import { calculateMarketDigest } from '../src/eod-ingestion/eod-ingestion.validation';

describe('HealthModule (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // Same pipeline main.ts installs, so error-envelope assertions below test
    // what actually ships rather than Nest's default exception rendering.
    configureMarketTradingApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'market-trading' });
  });

  it('/market/overview (GET) ranks the seeded EOD session', async () => {
    const path = '/market/overview?as_of=2025-01-05&limit=2';
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const repeated = await request(app.getHttpServer()).get(path).expect(200);

    expect(response.body.data.as_of).toBe('2025-01-03');
    expect(repeated.body).toEqual(response.body);
    expect(response.body.data.gainers).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'COMB.N0000',
        company_name: 'Commercial Bank of Ceylon PLC',
        close: 147.15,
        change: 1.34,
        change_pct: 0.92,
        volume: 1197713,
      },
    ]);
    expect(response.body.data.losers).toEqual([
      {
        rank: 1,
        symbol: 'SAMP.N0000',
        company_name: 'Sampath Bank PLC',
        close: 81.54,
        change: -1.51,
        change_pct: -1.82,
        volume: 528197,
      },
      {
        rank: 2,
        symbol: 'JKH.N0000',
        company_name: 'John Keells Holdings PLC',
        close: 22.32,
        change: -0.11,
        change_pct: -0.49,
        volume: 785056,
      },
    ]);
    expect(response.body.data.most_active).toEqual([
      {
        rank: 1,
        symbol: 'HNB.N0000',
        company_name: 'Hatton National Bank PLC',
        close: 257.12,
        change: 3.34,
        change_pct: 1.32,
        volume: 1517594,
      },
      {
        rank: 2,
        symbol: 'CTC.N0000',
        company_name: 'Ceylon Tobacco Company PLC',
        close: 965.36,
        change: 1.32,
        change_pct: 0.14,
        volume: 1382176,
      },
    ]);
  });

  // docs/api/paper-trading-v1.md §2.3 — the execution quote identity-auth
  // prices paper orders from.
  describe('/internal/paper-trading/quotes/{symbol} (GET)', () => {
    const quote = (symbol: string) =>
      request(app.getHttpServer()).get(
        `/internal/paper-trading/quotes/${symbol}`,
      );

    // Strips trace_id, which is a fresh uuid per response.
    const envelope = (body: { error: Record<string, unknown> }) => {
      const { trace_id, ...rest } = body.error;
      expect(trace_id).toEqual(expect.any(String));
      return rest;
    };

    it('returns the contract worked example verbatim', async () => {
      const response = await quote('COMB.N0000').expect(200);

      // This is the §2.3 sample response. The seeded fixture was built to
      // match it, so any drift in pricing, session resolution or T+2
      // settlement shows up here as a diff against the published contract.
      expect(response.body).toEqual({
        data: {
          symbol: 'COMB.N0000',
          listing_status: 'listed',
          market_as_of: '2025-01-10',
          price_as_of: '2025-01-10',
          close: 142.72,
          settlement_date: '2025-01-14',
        },
      });
    });

    it('settles T+2 across the weekend', async () => {
      // 2025-01-10 is a Friday, so settlement is Tuesday the 14th, not the
      // 12th. Asserted separately because it is the rule most likely to be
      // broken by a refactor of the calendar walk.
      const response = await quote('HNB.N0000').expect(200);

      expect(response.body.data.market_as_of).toBe('2025-01-10');
      expect(response.body.data.settlement_date).toBe('2025-01-14');
    });

    it('matches the symbol case-insensitively and echoes the canonical form', async () => {
      // The SPA sends whatever the user typed; canonical symbols are what
      // cross the service boundary.
      const response = await quote('comb.n0000').expect(200);

      expect(response.body.data.symbol).toBe('COMB.N0000');
      expect(response.body.data.close).toBe(142.72);
    });

    it('prices every seeded security at the same market session', async () => {
      // One shared session is what makes fills comparable across orders.
      const symbols = [
        'COMB.N0000',
        'HNB.N0000',
        'SAMP.N0000',
        'JKH.N0000',
        'DIAL.N0000',
        'CTC.N0000',
      ];

      const quotes = await Promise.all(
        symbols.map(async (s) => (await quote(s).expect(200)).body.data),
      );

      expect(quotes.map((q) => q.market_as_of)).toEqual(
        symbols.map(() => '2025-01-10'),
      );
      // Every fixture security trades on the last session, so none is stale.
      expect(quotes.every((q) => q.price_as_of === q.market_as_of)).toBe(true);
      expect(quotes.every((q) => typeof q.close === 'number')).toBe(true);
    });

    it('returns a SECURITY_NOT_FOUND envelope for an unknown symbol', async () => {
      const response = await quote('NOPE.X0000').expect(404);

      expect(envelope(response.body)).toEqual({
        code: 'SECURITY_NOT_FOUND',
        message: 'Security not found.',
      });
    });

    it('returns a VALIDATION_FAILED envelope with fields for an over-long symbol', async () => {
      const response = await quote('A'.repeat(21)).expect(400);

      expect(envelope(response.body)).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fields: [
          {
            field: 'symbol',
            reason: 'symbol must be shorter than or equal to 20 characters',
          },
        ],
      });
    });

    it('is deterministic across repeated calls', async () => {
      const first = await quote('CTC.N0000').expect(200);
      const second = await quote('CTC.N0000').expect(200);

      expect(second.body).toEqual(first.body);
    });
  });
  // docs/api/paper-trading-v1.md §2.4. The service unit tests mock
  // manager.query, so this is the only place the valuation SQL actually runs.
  it('/internal/paper-trading/valuations (GET) prices a set of symbols at one session', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/internal/paper-trading/valuations' +
          '?symbols=JKH.N0000,comb.n0000,NOPE.X0000&as_of=2025-01-05',
      )
      .expect(200);

    expect(response.body.data).toEqual({
      // 2025-01-05 is a Sunday; it settles back to the seeded session.
      as_of: '2025-01-03',
      prices: [
        // Case-folded on the way in, canonical on the way out.
        { symbol: 'COMB.N0000', close: 147.15 },
        { symbol: 'JKH.N0000', close: 22.32 },
        // Unknown and unpriced are the same outcome here (§2.4).
        { symbol: 'NOPE.X0000', close: null },
      ],
    });
  });

  it('/internal/paper-trading/valuations (GET) returns the session with no symbols', async () => {
    const response = await request(app.getHttpServer())
      .get('/internal/paper-trading/valuations?as_of=2025-01-05')
      .expect(200);

    expect(response.body.data).toEqual({ as_of: '2025-01-03', prices: [] });
  });

  it('/internal/paper-trading/valuations (GET) rejects an as_of outside the data', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/internal/paper-trading/valuations?symbols=JKH.N0000&as_of=2030-01-01',
      )
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields).toEqual([
      expect.objectContaining({ field: 'as_of' }),
    ]);
  });

  describe('/internal/v1/ingestions/eod', () => {
    const symbol = 'TEST.N0000';
    const tradeDate = '2025-01-13';
    const batchId = 'a'.repeat(64);
    const staleBatchId = 'c'.repeat(64);
    const prices = [
      {
        symbol,
        open: '10.0000',
        high: '12.0000',
        low: '9.5000',
        close: '11.2500',
        volume: '1234',
        validation_warnings: [],
        ohlc_repaired: false,
      },
    ];
    const body = {
      contract_version: '1',
      batch_id: batchId,
      trade_date: tradeDate,
      source: {
        name: 'contract_fixture',
        captured_at: '2025-01-13T09:20:00Z',
        source_date_method: 'fixture_date',
        raw_payload_hash: 'b'.repeat(64),
      },
      calendar: {
        is_trading_day: true,
        source: 'e2e fixture',
        verified_at: '2025-01-01T00:00:00Z',
      },
      validation: { processed: 1, accepted: 1, rejected: 0, repaired: 0 },
      securities: [{ symbol, company_name: 'Test Security PLC' }],
      prices,
      market_digest: calculateMarketDigest(prices),
    };

    afterAll(async () => {
      const db = app.get(DataSource);
      await db.query(
        `DELETE FROM market_data.price_aggregates
         WHERE security_id IN (
           SELECT security_id FROM market_data.securities WHERE symbol = $1
         )`,
        [symbol],
      );
      await db.query(
        `DELETE FROM market_data.daily_prices
         WHERE security_id IN (
           SELECT security_id FROM market_data.securities WHERE symbol = $1
         )`,
        [symbol],
      );
      await db.query(`DELETE FROM market_data.securities WHERE symbol = $1`, [
        symbol,
      ]);
      await db.query(
        `DELETE FROM market_data.ingestion_runs WHERE batch_id = ANY($1::text[])`,
        [[batchId, staleBatchId]],
      );
      await db.query(
        `DELETE FROM market_data.trading_calendar WHERE trade_date = $1::date`,
        [tradeDate],
      );
    });

    it('requires the machine bearer token', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .send(body)
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('commits a batch atomically and exposes it through trading quotes', async () => {
      const created = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send(body)
        .expect(201);

      expect(created.body.data).toEqual(
        expect.objectContaining({
          batch_id: batchId,
          trade_date: tradeDate,
          records_accepted: 1,
          replayed: false,
        }),
      );

      const quote = await request(app.getHttpServer())
        .get(`/internal/paper-trading/quotes/${symbol}`)
        .expect(200);
      expect(quote.body.data).toEqual(
        expect.objectContaining({
          symbol,
          market_as_of: tradeDate,
          price_as_of: tradeDate,
          close: 11.25,
        }),
      );

      const replay = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send(body)
        .expect(201);
      expect(replay.body.data.replayed).toBe(true);

      const latest = await request(app.getHttpServer())
        .get('/internal/v1/ingestions/eod/latest')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .expect(200);
      expect(latest.body.data.batch_id).toBe(batchId);

      const staleSnapshot = await request(app.getHttpServer())
        .post('/internal/v1/ingestions/eod')
        .set('Authorization', `Bearer ${process.env.MARKET_INGESTION_TOKEN}`)
        .send({
          ...body,
          batch_id: staleBatchId,
          trade_date: '2025-01-14',
          source: {
            ...body.source,
            captured_at: '2025-01-14T09:20:00Z',
          },
        })
        .expect(400);
      expect(staleSnapshot.body.error).toEqual(
        expect.objectContaining({
          code: 'VALIDATION_FAILED',
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'market_digest' }),
          ]),
        }),
      );
    });
  });
});

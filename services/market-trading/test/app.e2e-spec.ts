process.env.MARKET_DATA_DATABASE_URL =
  process.env.MARKET_DATA_DATABASE_URL ||
  'postgresql://market_data:changeme@localhost:5432/market_data';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';

describe('HealthModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
});

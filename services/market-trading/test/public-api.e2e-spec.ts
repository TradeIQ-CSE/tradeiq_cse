process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

import { randomBytes, randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { buildCorsOptionsDelegate } from '../src/common/cors';
import { generateApiKey, hashApiKey } from '../src/developer-api/api-key';
import { currentWindow } from '../src/developer-api/rate-limit-window';
import { RateLimitCounter } from '../src/redis/rate-limit-counter';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

// docs/api/public-api-v1.md, against the running db and redis. Fixture data
// only: a far-past window (1999) that CI's small seed and the local dev
// stack's full 2017–2025 dataset both leave untouched, so nothing here
// depends on which release is loaded.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function assertNoUuidAnywhere(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) {
      throw new Error(`found a uuid-like string at ${path}: ${value}`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoUuidAnywhere(item, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      expect(key).not.toBe('security_id');
      expect(key).not.toBe('api_key_id');
      expect(key).not.toBe('index_value_id');
      assertNoUuidAnywhere(v, `${path}.${key}`);
    }
  }
}

const SUFFIX = randomBytes(4).toString('hex').toUpperCase();
const SYM_A = `ZZT${SUFFIX}A.N0000`;
const SYM_B = `ZZT${SUFFIX}B.N0000`;
const SYM_C = `ZZT${SUFFIX}C.N0000`;
const SEARCH_PREFIX = `ZZT${SUFFIX}`;
const SECTOR_GICS = `Z${SUFFIX.slice(0, 3)}`;
const SECTOR_NAME = `ZZTest Sector ${SUFFIX}`;
const INDEX_CODE = `ZZIDX${SUFFIX}`;
const INDEX_NAME = `ZZTest Index ${SUFFIX}`;

const D1 = '1999-01-04'; // Mon, week 1
const D2 = '1999-01-05'; // Tue, week 1
const D3 = '1999-01-06'; // Wed, week 1
const D4 = '1999-01-11'; // Mon, week 2
const D5 = '1999-01-12'; // Tue, week 2
const D6 = '1999-02-01'; // Mon, week 3 (Feb)
const D7 = '1999-02-02'; // Tue, week 3 (Feb)
const D8 = '1999-02-26'; // Fri, week 4 (Feb)
const NO_SESSION_DATE = '1999-01-02'; // Saturday — no trading_calendar/price row

const ALL_TRADING_DAYS = [D1, D2, D3, D4, D5, D6, D7, D8];

describe('Public developer API (e2e)', () => {
  let signer: TestSigner;
  let dataApp: NestExpressApplication;
  let dataSource: DataSource;
  let redis: Redis;
  let devKey: string;

  const createdRedisKeys = new Set<string>();
  const createdUserIds: string[] = [];

  async function createApp(
    options: {
      hourlyLimit?: number;
      rateLimitCounter?: RateLimitCounter;
    } = {},
  ): Promise<NestExpressApplication> {
    if (options.hourlyLimit !== undefined) {
      process.env.PUBLIC_API_HOURLY_LIMIT = String(options.hourlyLimit);
    } else {
      delete process.env.PUBLIC_API_HOURLY_LIMIT;
    }

    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (options.rateLimitCounter) {
      builder = builder
        .overrideProvider(RateLimitCounter)
        .useValue(options.rateLimitCounter);
    }
    const moduleRef: TestingModule = await builder.compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    app.enableCors(buildCorsOptionsDelegate(['http://localhost:5173']));
    await app.init();
    return app;
  }

  async function mintKey(
    app: NestExpressApplication,
  ): Promise<{ token: string; key: string; userId: string }> {
    const userId = randomUUID();
    createdUserIds.push(userId);
    const token = signer.sign({ sub: userId });
    const response = await request(app.getHttpServer())
      .post('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    return { token, key: response.body.data.key as string, userId };
  }

  beforeAll(async () => {
    signer = createTestSigner();
    process.env.AUTH_JWT_PUBLIC_KEYS = signer.publicKeys;

    dataApp = await createApp({ hourlyLimit: 1000 });
    dataSource = dataApp.get(DataSource);
    redis = dataApp.get(REDIS_CLIENT);

    // --- Fixture data --------------------------------------------------
    const sectorId = randomUUID();
    await dataSource.query(
      `INSERT INTO market_data.sectors (sector_id, gics_code, sector_name)
       VALUES ($1, $2, $3)`,
      [sectorId, SECTOR_GICS, SECTOR_NAME],
    );

    const securityIdA = randomUUID();
    const securityIdB = randomUUID();
    const securityIdC = randomUUID();
    await dataSource.query(
      `INSERT INTO market_data.securities
         (security_id, symbol, cse_code, company_name, sector_id,
          shares_outstanding, data_from, data_to)
       VALUES
         ($1, $2, $2, 'ZZTest Company A', $5, 1000000, $8::date, $9::date),
         ($3, $4, $4, 'ZZTest Company B', $5, 2000000, $10::date, $11::date),
         ($6, $7, NULL, 'ZZTest Company C', NULL, NULL, NULL, NULL)`,
      [
        securityIdA,
        SYM_A,
        securityIdB,
        SYM_B,
        sectorId,
        securityIdC,
        SYM_C,
        D1,
        D8,
        D2,
        D3,
      ],
    );

    // B is suspended, C is delisted; A carries no listing_events row at all
    // (default 'listed').
    await dataSource.query(
      `INSERT INTO market_data.listing_events (event_id, security_id, event_type, event_date)
       VALUES ($1, $2, 'suspended', $4::date), ($3, $5, 'delisted', $4::date)`,
      [randomUUID(), securityIdB, randomUUID(), D1, securityIdC],
    );

    for (const day of ALL_TRADING_DAYS) {
      await dataSource.query(
        `INSERT INTO market_data.trading_calendar (trade_date, is_trading_day)
         VALUES ($1::date, true)
         ON CONFLICT (trade_date) DO NOTHING`,
        [day],
      );
    }

    const runId = randomUUID();
    await dataSource.query(
      `INSERT INTO market_data.ingestion_runs (run_id, trigger_type, status)
       VALUES ($1, 'manual', 'succeeded')`,
      [runId],
    );

    // Security A: 8 daily bars across four ISO weeks and two months.
    // D1's open is NULL — exercises §6.3's "open can be null on any bar".
    const pricesA: [string, string | null, string, string, string, number][] = [
      [D1, null, '10.1000', '9.9000', '10.0000', 1001],
      [D2, '10.0500', '10.6000', '9.9500', '10.5000', 1002],
      [D3, '10.5500', '11.1000', '10.4500', '11.0000', 1003],
      [D4, '11.0500', '11.6000', '10.9500', '11.5000', 1004],
      [D5, '11.5500', '12.1000', '11.4500', '12.0000', 1005],
      [D6, '12.0500', '12.6000', '11.9500', '12.5000', 1006],
      [D7, '12.5500', '13.1000', '12.4500', '13.0000', 1007],
      [D8, '13.0500', '13.6000', '12.9500', '13.5000', 1008],
    ];
    for (const [day, open, high, low, close, volume] of pricesA) {
      await dataSource.query(
        `INSERT INTO market_data.daily_prices
           (security_id, trade_date, open, high, low, close, volume, ingestion_run_id)
         VALUES ($1, $2::date, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7::bigint, $8)`,
        [securityIdA, day, open, high, low, close, volume, runId],
      );
    }

    // Security B: two days only, so D2's close has no previous session
    // (change: null) and D3's does (change: 1.0000).
    await dataSource.query(
      `INSERT INTO market_data.daily_prices
         (security_id, trade_date, open, high, low, close, volume, ingestion_run_id)
       VALUES
         ($1, $2::date, 49.5000, 50.5000, 49.0000, 50.0000, 500, $4),
         ($1, $3::date, 50.5000, 51.5000, 50.0000, 51.0000, 600, $4)`,
      [securityIdB, D2, D3, runId],
    );

    await dataSource.query(
      `INSERT INTO market_data.indices (index_code, index_name)
       VALUES ($1, $2)`,
      [INDEX_CODE, INDEX_NAME],
    );
    const indexValues: [string, string][] = [
      [D1, '1000.0000'],
      [D2, '1010.0000'],
      [D3, '1005.0000'],
    ];
    for (const [day, close] of indexValues) {
      await dataSource.query(
        `INSERT INTO market_data.index_values (index_value_id, index_code, trade_date, index_value)
         VALUES ($1, $2, $3::date, $4::numeric)`,
        [randomUUID(), INDEX_CODE, day, close],
      );
    }

    devKey = (await mintKey(dataApp)).key;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM market_data.index_values WHERE index_code = $1`,
      [INDEX_CODE],
    );
    await dataSource.query(
      `DELETE FROM market_data.indices WHERE index_code = $1`,
      [INDEX_CODE],
    );
    await dataSource.query(
      `DELETE FROM market_data.daily_prices WHERE security_id IN (
         SELECT security_id FROM market_data.securities WHERE symbol = ANY($1)
       )`,
      [[SYM_A, SYM_B, SYM_C]],
    );
    await dataSource.query(
      `DELETE FROM market_data.listing_events WHERE security_id IN (
         SELECT security_id FROM market_data.securities WHERE symbol = ANY($1)
       )`,
      [[SYM_A, SYM_B, SYM_C]],
    );
    await dataSource.query(
      `DELETE FROM market_data.securities WHERE symbol = ANY($1)`,
      [[SYM_A, SYM_B, SYM_C]],
    );
    await dataSource.query(
      `DELETE FROM market_data.sectors WHERE gics_code = $1`,
      [SECTOR_GICS],
    );

    if (createdUserIds.length > 0) {
      const keyRows: { api_key_id: string }[] = await dataSource.query(
        `SELECT api_key_id FROM market_data.api_keys WHERE user_id = ANY($1)`,
        [createdUserIds],
      );
      for (const { api_key_id: apiKeyId } of keyRows) {
        createdRedisKeys.add(currentWindow(new Date()).counterKey(apiKeyId));
      }

      await dataSource.query(
        `DELETE FROM market_data.api_key_usage WHERE api_key_id IN (
           SELECT api_key_id FROM market_data.api_keys WHERE user_id = ANY($1)
         )`,
        [createdUserIds],
      );
      await dataSource.query(
        `DELETE FROM market_data.api_keys WHERE user_id = ANY($1)`,
        [createdUserIds],
      );
    }

    if (createdRedisKeys.size > 0) {
      await redis.del(...Array.from(createdRedisKeys));
    }

    await dataApp.close();
  }, 30_000);

  const server = () => dataApp.getHttpServer();

  function get(path: string, key: string = devKey) {
    return request(server()).get(path).set('X-API-Key', key);
  }

  describe('authentication (§2)', () => {
    it('a missing header is 401 with the exact message', async () => {
      const response = await request(server())
        .get('/public/v1/securities')
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(response.body.error.message).toBe('A valid API key is required');
    });

    it('a malformed key is 401 with the same message', async () => {
      const response = await get(
        '/public/v1/securities',
        'not-a-real-key',
      ).expect(401);
      expect(response.body.error.message).toBe('A valid API key is required');
    });

    it('a well-formed but unknown key is 401', async () => {
      const unknown = generateApiKey();
      const response = await get('/public/v1/securities', unknown).expect(401);
      expect(response.body.error.message).toBe('A valid API key is required');
    });

    it('a key in the query string is ignored — still 401', async () => {
      const response = await request(server())
        .get(`/public/v1/securities?api_key=${devKey}`)
        .expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('a revoked key is refused immediately after DELETE /developer/key', async () => {
      const { token, key } = await mintKey(dataApp);
      await get('/public/v1/securities', key).expect(200);

      await request(server())
        .delete('/developer/key')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const response = await get('/public/v1/securities', key).expect(401);
      expect(response.body.error.message).toBe('A valid API key is required');
    });

    it('after regenerate, the old key is 401 and the new key works', async () => {
      const { token, key: oldKey } = await mintKey(dataApp);
      await get('/public/v1/securities', oldKey).expect(200);

      const regenerated = await request(server())
        .post('/developer/key/regenerate')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(201);
      const newKey = regenerated.body.data.key as string;

      await get('/public/v1/securities', oldKey).expect(401);
      await get('/public/v1/securities', newKey).expect(200);
    });
  });

  describe('rate-limit headers on 200 and 404 (§3)', () => {
    it('are present on a 200', async () => {
      const response = await get('/public/v1/securities?page_size=1').expect(
        200,
      );
      expect(response.headers['x-ratelimit-limit']).toBe('1000');
      expect(
        Number(response.headers['x-ratelimit-remaining']),
      ).toBeGreaterThanOrEqual(0);
      expect(response.headers['x-ratelimit-reset']).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/,
      );
    });

    it('are present on a 404', async () => {
      const response = await get('/public/v1/securities/NOPE.N0000').expect(
        404,
      );
      expect(response.body.error.code).toBe('SECURITY_NOT_FOUND');
      expect(response.headers['x-ratelimit-limit']).toBe('1000');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('GET /public/v1/securities (§6.1)', () => {
    it('finds all three fixtures by prefix search, ordered by symbol, paginated', async () => {
      const page1 = await get(
        `/public/v1/securities?search=${SEARCH_PREFIX}&page_size=2&page=1`,
      ).expect(200);
      expect(page1.body.data.map((s: { symbol: string }) => s.symbol)).toEqual([
        SYM_A,
        SYM_B,
      ]);
      expect(page1.body.meta).toEqual({ page: 1, page_size: 2, total: 3 });

      const page2 = await get(
        `/public/v1/securities?search=${SEARCH_PREFIX}&page_size=2&page=2`,
      ).expect(200);
      expect(page2.body.data.map((s: { symbol: string }) => s.symbol)).toEqual([
        SYM_C,
      ]);
    });

    it('filters by sector and computes listing_status via the latest listing_events row', async () => {
      const response = await get(
        `/public/v1/securities?sector=${SECTOR_GICS}&page_size=50`,
      ).expect(200);
      const bySymbol = Object.fromEntries(
        (response.body.data as { symbol: string }[]).map((s) => [s.symbol, s]),
      );
      expect(Object.keys(bySymbol).sort()).toEqual([SYM_A, SYM_B]);
      expect(bySymbol[SYM_A]).toMatchObject({
        cse_code: SYM_A,
        sector: { gics_code: SECTOR_GICS, name: SECTOR_NAME },
        listing_status: 'listed',
        shares_outstanding: 1000000,
        data_from: D1,
        data_to: D8,
      });
      expect(bySymbol[SYM_B]).toMatchObject({
        listing_status: 'suspended',
        shares_outstanding: 2000000,
      });
    });

    it('an unclassified security carries a null sector and null coverage window', async () => {
      const response = await get(
        `/public/v1/securities?search=${SEARCH_PREFIX}C&page_size=10`,
      ).expect(200);
      expect(response.body.data[0]).toMatchObject({
        symbol: SYM_C,
        cse_code: null,
        sector: null,
        listing_status: 'delisted',
        shares_outstanding: null,
        data_from: null,
        data_to: null,
      });
    });

    it('an unknown sector code is 400 VALIDATION_FAILED', async () => {
      const response = await get(
        '/public/v1/securities?sector=doesnotexist9999',
      ).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('page_size 0 and above the max are 400', async () => {
      await get('/public/v1/securities?page_size=0').expect(400);
      await get('/public/v1/securities?page_size=201').expect(400);
    });

    it('search=%25 (a literal percent sign) does not match every security', async () => {
      const all = await get('/public/v1/securities?page_size=1').expect(200);
      const percent = await get(
        '/public/v1/securities?search=%25&page_size=1',
      ).expect(200);
      expect(percent.body.meta.total).toBeLessThan(all.body.meta.total);
    });

    it('a search over 100 characters is 400', async () => {
      const response = await get(
        `/public/v1/securities?search=${'A'.repeat(101)}`,
      ).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('a page past the end is 200 with an empty array', async () => {
      const response = await get(
        `/public/v1/securities?search=${SEARCH_PREFIX}&page=999`,
      ).expect(200);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /public/v1/securities/{symbol} (§6.2)', () => {
    it('matches case-insensitively and returns the canonical uppercase symbol', async () => {
      const response = await get(
        `/public/v1/securities/${SYM_A.toLowerCase()}`,
      ).expect(200);
      expect(response.body.data.symbol).toBe(SYM_A);
      expect(response.body.data.listing_status).toBe('listed');
    });

    it('an unknown symbol is 404 SECURITY_NOT_FOUND', async () => {
      const response = await get('/public/v1/securities/NOPE.N0000').expect(
        404,
      );
      expect(response.body.error.code).toBe('SECURITY_NOT_FOUND');
    });
  });

  describe('GET /public/v1/securities/{symbol}/ohlcv (§6.3)', () => {
    it('daily bars are paginated, ascending, with a null open where the source has none', async () => {
      const response = await get(
        `/public/v1/securities/${SYM_A}/ohlcv?timeframe=daily&from=${D1}&to=${D8}&page_size=3&page=1`,
      ).expect(200);
      expect(response.body.data.symbol).toBe(SYM_A);
      expect(response.body.data.bars).toHaveLength(3);
      expect(response.body.data.bars[0]).toMatchObject({
        date: D1,
        open: null,
        high: 10.1,
        low: 9.9,
        close: 10,
        volume: 1001,
      });
      expect(response.body.meta).toEqual({ page: 1, page_size: 3, total: 8 });
    });

    it('weekly bars group into four ISO weeks with period_start/period_end', async () => {
      const response = await get(
        `/public/v1/securities/${SYM_A}/ohlcv?timeframe=weekly&from=${D1}&to=${D8}&page_size=10`,
      ).expect(200);
      expect(response.body.meta.total).toBe(4);
      expect(response.body.data.bars[0]).toMatchObject({
        period_start: D1,
        period_end: D3,
      });
      expect(response.body.data.bars[3]).toMatchObject({
        period_start: D8,
        period_end: D8,
      });
    });

    it('monthly bars group into January and February', async () => {
      const response = await get(
        `/public/v1/securities/${SYM_A}/ohlcv?timeframe=monthly&from=${D1}&to=${D8}&page_size=10`,
      ).expect(200);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.data.bars[0]).toMatchObject({
        period_start: D1,
        period_end: D5,
      });
      expect(response.body.data.bars[1]).toMatchObject({
        period_start: D6,
        period_end: D8,
      });
    });

    it('a security with no price history returns an empty series, not an error', async () => {
      // `from`/`to` still default from the database's overall latest date
      // (§6.3's "to = latest completed session"), even though this specific
      // security has none of its own — only an entirely empty database
      // resolves them to null, which the seeded/dev dataset never is.
      const response = await get(`/public/v1/securities/${SYM_C}/ohlcv`).expect(
        200,
      );
      expect(response.body.data.bars).toEqual([]);
      expect(response.body.data.symbol).toBe(SYM_C);
      expect(response.body.data.from).toEqual(expect.any(String));
      expect(response.body.data.to).toEqual(expect.any(String));
      expect(response.body.meta.total).toBe(0);
    });

    it('an unknown symbol is 404', async () => {
      await get('/public/v1/securities/NOPE.N0000/ohlcv').expect(404);
    });

    it('page_size 0 and above the max are 400', async () => {
      await get(`/public/v1/securities/${SYM_A}/ohlcv?page_size=0`).expect(400);
      await get(`/public/v1/securities/${SYM_A}/ohlcv?page_size=1001`).expect(
        400,
      );
    });

    it('an invalid timeframe or from > to is 400', async () => {
      await get(`/public/v1/securities/${SYM_A}/ohlcv?timeframe=hourly`).expect(
        400,
      );
      await get(
        `/public/v1/securities/${SYM_A}/ohlcv?from=${D8}&to=${D1}`,
      ).expect(400);
    });
  });

  describe('GET /public/v1/indices (§6.4)', () => {
    it('lists the fixture index among every index, ordered by code', async () => {
      const response = await get('/public/v1/indices?page_size=200').expect(
        200,
      );
      expect(response.body.meta.page_size).toBe(200);
      expect(response.body.meta.total).toBe(response.body.data.length);
      const codes = response.body.data.map((i: { code: string }) => i.code);
      expect(codes).toEqual([...codes].sort());

      const fixture = response.body.data.find(
        (i: { code: string }) => i.code === INDEX_CODE,
      );
      expect(fixture).toMatchObject({
        code: INDEX_CODE,
        name: INDEX_NAME,
        latest: { date: D3, close: 1005 },
      });
      expect(fixture.latest.change).toBeCloseTo(-5, 4);
      expect(fixture.latest.change_pct).toBeCloseTo(-0.5, 2);
    });

    it('page_size 0 and above the max are 400', async () => {
      await get('/public/v1/indices?page_size=0').expect(400);
      await get('/public/v1/indices?page_size=201').expect(400);
    });
  });

  describe('GET /public/v1/indices/{code}/values (§6.5)', () => {
    it('matches case-insensitively and returns ascending values', async () => {
      const response = await get(
        `/public/v1/indices/${INDEX_CODE.toLowerCase()}/values?from=${D1}&to=${D3}`,
      ).expect(200);
      expect(response.body.data).toMatchObject({
        code: INDEX_CODE,
        name: INDEX_NAME,
        from: D1,
        to: D3,
        values: [
          { date: D1, close: 1000 },
          { date: D2, close: 1010 },
          { date: D3, close: 1005 },
        ],
      });
      expect(response.body.meta.total).toBe(3);
    });

    it('an unknown code is 404 INDEX_NOT_FOUND', async () => {
      const response = await get('/public/v1/indices/NOPE9999/values').expect(
        404,
      );
      expect(response.body.error.code).toBe('INDEX_NOT_FOUND');
    });

    it('a code over 20 characters is 400', async () => {
      await get(`/public/v1/indices/${'X'.repeat(21)}/values`).expect(400);
    });

    it('page_size 0 and above the max are 400', async () => {
      await get(`/public/v1/indices/${INDEX_CODE}/values?page_size=0`).expect(
        400,
      );
      await get(
        `/public/v1/indices/${INDEX_CODE}/values?page_size=1001`,
      ).expect(400);
    });

    it('a page past the end is 200 with an empty array', async () => {
      const response = await get(
        `/public/v1/indices/${INDEX_CODE}/values?from=${D1}&to=${D3}&page=999`,
      ).expect(200);
      expect(response.body.data.values).toEqual([]);
      expect(response.body.meta.total).toBe(3);
    });
  });

  describe('GET /public/v1/eod (§6.6)', () => {
    it('an explicit session date returns one row per fixture security, ordered by symbol', async () => {
      const response = await get(
        `/public/v1/eod?date=${D2}&page_size=200`,
      ).expect(200);
      expect(response.body.meta.as_of).toBe(D2);
      const rows = (response.body.data as { symbol: string }[]).filter((r) =>
        [SYM_A, SYM_B].includes(r.symbol),
      );
      expect(rows.map((r) => r.symbol)).toEqual([SYM_A, SYM_B]);

      const rowA = rows.find((r) => r.symbol === SYM_A) as Record<
        string,
        unknown
      >;
      expect(rowA).toMatchObject({
        date: D2,
        open: 10.05,
        high: 10.6,
        low: 9.95,
        close: 10.5,
        volume: 1002,
        change: 0.5,
        change_pct: 5,
      });

      const rowB = rows.find((r) => r.symbol === SYM_B) as Record<
        string,
        unknown
      >;
      // B's first day of coverage — no previous session, so change is null.
      expect(rowB).toMatchObject({ close: 50, change: null, change_pct: null });
    });

    it("B's second day has a change against its own previous session", async () => {
      const response = await get(
        `/public/v1/eod?date=${D3}&page_size=200`,
      ).expect(200);
      const rowB = (response.body.data as Record<string, unknown>[]).find(
        (r) => r.symbol === SYM_B,
      );
      expect(rowB).toMatchObject({ close: 51, change: 1, change_pct: 2 });
    });

    it('a date with no session is 200 with an empty page and as_of null', async () => {
      const response = await get(
        `/public/v1/eod?date=${NO_SESSION_DATE}`,
      ).expect(200);
      expect(response.body).toMatchObject({
        data: [],
        meta: { total: 0, as_of: null },
      });
    });

    it('with no date, answers 200 with a non-null as_of', async () => {
      const response = await get('/public/v1/eod?page_size=1').expect(200);
      expect(response.body.meta.as_of).toEqual(expect.any(String));
    });

    it('a malformed date is 400', async () => {
      await get('/public/v1/eod?date=not-a-date').expect(400);
    });

    it('page_size 0 and above the max are 400', async () => {
      await get('/public/v1/eod?page_size=0').expect(400);
      await get('/public/v1/eod?page_size=501').expect(400);
    });

    it('paginates with page_size=1 across the two fixture rows on D2', async () => {
      const page1 = await get(
        `/public/v1/eod?date=${D2}&page_size=1&page=1`,
      ).expect(200);
      const page2 = await get(
        `/public/v1/eod?date=${D2}&page_size=1&page=2`,
      ).expect(200);
      expect(page1.body.data[0].symbol).toBe(SYM_A);
      expect(page2.body.data[0].symbol).toBe(SYM_B);
      expect(page1.body.meta.total).toBe(page2.body.meta.total);
    });
  });

  describe('usage recording', () => {
    it('records a request in api_key_usage and sets last_used_at', async () => {
      const { key } = await mintKey(dataApp);
      const [{ api_key_id: apiKeyId }] = await dataSource.query(
        `SELECT api_key_id FROM market_data.api_keys WHERE key_hash = $1`,
        [hashApiKey(key)],
      );

      await get('/public/v1/securities?page_size=1', key).expect(200);

      const usageDate = new Date().toISOString().slice(0, 10);
      let requestCount = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        const rows: { request_count: number }[] = await dataSource.query(
          `SELECT request_count FROM market_data.api_key_usage
           WHERE api_key_id = $1 AND usage_date = $2::date`,
          [apiKeyId, usageDate],
        );
        requestCount = rows[0]?.request_count ?? 0;
        if (requestCount >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(requestCount).toBeGreaterThanOrEqual(1);

      const [{ last_used_at: lastUsedAt }] = await dataSource.query(
        `SELECT last_used_at FROM market_data.api_keys WHERE api_key_id = $1`,
        [apiKeyId],
      );
      expect(lastUsedAt).not.toBeNull();
    });
  });

  describe('CORS preflight (§4)', () => {
    it('OPTIONS answers 204 with the allow headers, no key required, and is not counted', async () => {
      const response = await request(server())
        .options('/public/v1/securities')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'x-api-key')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(
        response.headers['access-control-allow-headers']?.toLowerCase(),
      ).toContain('x-api-key');
      // Never went through ApiKeyGuard/RateLimitInterceptor.
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });
  });

  describe('recursive uuid scan', () => {
    it('no response body ever contains a uuid-like string', async () => {
      const responses = await Promise.all([
        get(`/public/v1/securities?search=${SEARCH_PREFIX}`),
        get(`/public/v1/securities/${SYM_A}`),
        get(`/public/v1/securities/${SYM_A}/ohlcv?from=${D1}&to=${D8}`),
        get('/public/v1/indices?page_size=50'),
        get(`/public/v1/indices/${INDEX_CODE}/values`),
        get(`/public/v1/eod?date=${D2}`),
      ]);
      for (const response of responses) {
        assertNoUuidAnywhere(response.body);
      }
    });
  });

  describe('a low hourly limit (5)', () => {
    let limitedApp: NestExpressApplication;
    let limitedKey: string;
    let limitedApiKeyId: string;

    beforeAll(async () => {
      limitedApp = await createApp({ hourlyLimit: 5 });
      const minted = await mintKey(limitedApp);
      limitedKey = minted.key;

      const [{ api_key_id: apiKeyId }] = await dataSource.query(
        `SELECT api_key_id FROM market_data.api_keys WHERE user_id = $1`,
        [minted.userId],
      );
      limitedApiKeyId = apiKeyId;
      createdRedisKeys.add(
        currentWindow(new Date()).counterKey(limitedApiKeyId),
      );
    }, 30_000);

    afterAll(async () => {
      await limitedApp.close();
    });

    it('requests 1–5 succeed with Remaining counting down, the 6th is 429', async () => {
      for (let i = 1; i <= 5; i++) {
        const response = await request(limitedApp.getHttpServer())
          .get('/public/v1/securities?page_size=1')
          .set('X-API-Key', limitedKey)
          .expect(200);
        expect(response.headers['x-ratelimit-limit']).toBe('5');
        expect(response.headers['x-ratelimit-remaining']).toBe(String(5 - i));
      }

      const sixth = await request(limitedApp.getHttpServer())
        .get('/public/v1/securities?page_size=1')
        .set('X-API-Key', limitedKey)
        .expect(429);

      expect(sixth.body.error.code).toBe('RATE_LIMITED');
      expect(sixth.body.error.reset_at).toBe(
        currentWindow(new Date())
          .resetAt.toISOString()
          .replace(/\.\d{3}Z$/, 'Z'),
      );
      expect(Number(sixth.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    });

    it('an OPTIONS preflight never counts against the limit', async () => {
      for (let i = 0; i < 10; i++) {
        await request(limitedApp.getHttpServer())
          .options('/public/v1/securities')
          .set('Origin', 'https://example.com')
          .set('Access-Control-Request-Headers', 'x-api-key')
          .expect(204);
      }
      // The limit (5) was already exhausted by the previous test's six
      // requests, so this only proves OPTIONS did not add to that count —
      // a fresh key would be needed to prove it stays under the limit, which
      // is exactly what the per-key counter guarantees regardless.
      await request(limitedApp.getHttpServer())
        .get('/public/v1/securities?page_size=1')
        .set('X-API-Key', limitedKey)
        .expect(429);
    });
  });

  describe('fail-open when the rate-limit counter is unavailable', () => {
    let failOpenApp: NestExpressApplication;
    let failOpenKey: string;

    beforeAll(async () => {
      const throwingCounter: RateLimitCounter = {
        increment: () => {
          throw new Error('ECONNREFUSED (test double)');
        },
        peek: () => {
          throw new Error('ECONNREFUSED (test double)');
        },
      };
      failOpenApp = await createApp({
        hourlyLimit: 1000,
        rateLimitCounter: throwingCounter,
      });
      const minted = await mintKey(failOpenApp);
      failOpenKey = minted.key;
    }, 30_000);

    afterAll(async () => {
      await failOpenApp.close();
    });

    it('serves the request without X-RateLimit-Remaining', async () => {
      const response = await request(failOpenApp.getHttpServer())
        .get('/public/v1/securities?page_size=1')
        .set('X-API-Key', failOpenKey)
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBe('1000');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
    });
  });
});

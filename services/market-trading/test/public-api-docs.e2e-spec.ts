process.env.MARKET_DATA_DATABASE_URL =
  process.env.MARKET_DATA_DATABASE_URL ||
  'postgresql://market_data:changeme@localhost:5432/market_data';
process.env.MARKET_INGESTION_TOKEN =
  process.env.MARKET_INGESTION_TOKEN || 'test-market-ingestion-token';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { buildCorsOptionsDelegate } from '../src/common/cors';
import { setupPublicApiDocs } from '../src/public-api/openapi/public-api-docs';

// docs/api/public-api-v1.md §9 — hosted docs, no key required, generated
// from the public controllers only.
describe('Public developer API docs (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    // The same pipeline main.ts installs, in the same order: CORS, then docs.
    configureMarketTradingApp(app);
    app.enableCors(buildCorsOptionsDelegate(['http://localhost:5173']));
    setupPublicApiDocs(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const PUBLIC_PATHS = [
    '/public/v1/securities',
    '/public/v1/securities/{symbol}',
    '/public/v1/securities/{symbol}/ohlcv',
    '/public/v1/indices',
    '/public/v1/indices/{code}/values',
    '/public/v1/eod',
  ];

  it('GET /public/v1/openapi.json answers 200 with no key and a valid OpenAPI 3 document', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/v1/openapi.json')
      .expect(200);

    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info).toMatchObject({
      title: 'TradeIQ public API',
      version: '1',
    });
    expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
  });

  it('its paths are exactly the six public routes, nothing else', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/v1/openapi.json')
      .expect(200);

    expect(Object.keys(response.body.paths).sort()).toEqual(
      [...PUBLIC_PATHS].sort(),
    );
  });

  it('components.securitySchemes.apiKey is the X-API-Key header', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/v1/openapi.json')
      .expect(200);

    expect(response.body.components.securitySchemes.apiKey).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    });
  });

  it('GET /public/v1/docs answers 200 HTML with no key, uncounted', async () => {
    const response = await request(app.getHttpServer())
      .get('/public/v1/docs')
      .expect(200);

    expect(response.type).toBe('text/html');
    expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
  });
});

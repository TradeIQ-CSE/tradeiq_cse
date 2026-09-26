process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

import { createHash, randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AppModule } from '../src/app.module';
import { configureMarketTradingApp } from '../src/app.setup';
import { currentWindow } from '../src/developer-api/rate-limit-window';
import { RateLimitCounter } from '../src/redis/rate-limit-counter';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

// docs/api/public-api-v1.md §7, against a real Postgres and Redis. Every test
// mints its own user id, so nothing here depends on another test's data, and
// every row/Redis key a test creates is tracked and swept up in afterAll.
describe('Developer API keys (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let rateLimitCounter: RateLimitCounter;
  let redis: Redis;
  let signer: TestSigner;

  const createdUserIds: string[] = [];
  const createdRedisKeys: string[] = [];

  function newUser(): { userId: string; token: string } {
    const userId = randomUUID();
    createdUserIds.push(userId);
    return { userId, token: signer.sign({ sub: userId }) };
  }

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
    rateLimitCounter = app.get(RateLimitCounter);
    redis = app.get(REDIS_CLIENT);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
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
    if (createdRedisKeys.length > 0) {
      await redis.del(...createdRedisKeys);
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  interface KeyData {
    key: string;
    prefix: string;
    label: string | null;
    created_at: string;
  }
  interface KeyDataResponse {
    data: KeyData;
  }

  const create = (token: string, label?: string) =>
    request(server())
      .post('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .send(label === undefined ? {} : { label });

  const regenerate = (token: string, label?: string) =>
    request(server())
      .post('/developer/key/regenerate')
      .set('Authorization', `Bearer ${token}`)
      .send(label === undefined ? {} : { label });

  it('requires a signed-in user', async () => {
    await request(server()).get('/developer/key').expect(401);
    await request(server()).get('/developer/usage').expect(401);
    await request(server()).post('/developer/key').send({}).expect(401);
    await request(server()).delete('/developer/key').expect(401);
  });

  it('is null at first', async () => {
    const { token } = newUser();
    const response = await request(server())
      .get('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ data: null });
  });

  it('creates a key matching the regex, with the prefix as its first 8 characters', async () => {
    const { token } = newUser();
    const response = await create(token, 'My script').expect(201);
    const { key, prefix, label, created_at } = (
      response.body as KeyDataResponse
    ).data;

    expect(key).toMatch(/^tiq_[A-Za-z0-9]{40}$/);
    expect(prefix).toBe(key.slice(0, 8));
    expect(label).toBe('My script');
    expect(created_at).toEqual(expect.any(String));
  });

  it('stores only the hash and prefix — never the secret', async () => {
    const { userId, token } = newUser();
    const response = await create(token).expect(201);
    const { key } = (response.body as KeyDataResponse).data;

    const rows: { key_hash: string; key_prefix: string }[] =
      await dataSource.query(
        `SELECT key_hash, key_prefix FROM market_data.api_keys WHERE user_id = $1`,
        [userId],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].key_hash).toBe(
      createHash('sha256').update(key, 'utf8').digest('hex'),
    );
    expect(JSON.stringify(rows[0])).not.toContain(key);
  });

  it('a second create is 409 API_KEY_EXISTS', async () => {
    const { token } = newUser();
    await create(token).expect(201);
    const response = await create(token).expect(409);
    expect(response.body.error.code).toBe('API_KEY_EXISTS');
  });

  it('regenerate revokes the old key, activates a new one, and keeps the label', async () => {
    const { userId, token } = newUser();
    const first = await create(token, 'first label').expect(201);
    const firstData = (first.body as KeyDataResponse).data;

    const second = await regenerate(token).expect(201);
    const secondData = (second.body as KeyDataResponse).data;

    expect(secondData.key).not.toBe(firstData.key);
    expect(secondData.label).toBe('first label');

    const rows: { key_prefix: string; revoked_at: string | null }[] =
      await dataSource.query(
        `SELECT key_prefix, revoked_at FROM market_data.api_keys
         WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      );
    expect(rows).toHaveLength(2);
    const old = rows.find((r) => r.key_prefix === firstData.prefix);
    const active = rows.find((r) => r.key_prefix === secondData.prefix);
    expect(old?.revoked_at).not.toBeNull();
    expect(active?.revoked_at).toBeNull();
    expect(rows.filter((r) => r.revoked_at === null)).toHaveLength(1);
  });

  it('regenerate with no active key behaves like create', async () => {
    const { token } = newUser();
    const response = await regenerate(token, 'fresh').expect(201);
    expect((response.body as KeyDataResponse).data.label).toBe('fresh');
  });

  it('never lets concurrent creates leave more than one active key', async () => {
    const { token } = newUser();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => create(token)),
    );
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
  });

  describe('label rules', () => {
    it('trims the label', async () => {
      const { token } = newUser();
      const response = await create(token, '  spaced label  ').expect(201);
      expect((response.body as KeyDataResponse).data.label).toBe(
        'spaced label',
      );
    });

    it('stores a whitespace-only label as null', async () => {
      const { token } = newUser();
      const response = await create(token, '   ').expect(201);
      expect((response.body as KeyDataResponse).data.label).toBeNull();
    });

    it('rejects a label over 100 characters after trimming', async () => {
      const { token } = newUser();
      const response = await create(token, `  ${'a'.repeat(101)}  `).expect(
        400,
      );
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  it('delete is 204 twice, idempotently, and GET is then null', async () => {
    const { token } = newUser();
    await create(token).expect(201);

    await request(server())
      .delete('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await request(server())
      .delete('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const response = await request(server())
      .get('/developer/key')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ data: null });
  });

  it('never lets one user see or revoke another user’s key', async () => {
    const owner = newUser();
    const intruder = newUser();

    await create(owner.token, 'owner key').expect(201);

    const intruderView = await request(server())
      .get('/developer/key')
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(200);
    expect(intruderView.body).toEqual({ data: null });

    await request(server())
      .delete('/developer/key')
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(204);

    const ownerView = await request(server())
      .get('/developer/key')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerView.body.data).not.toBeNull();
  });

  describe('usage', () => {
    it('is null with no key', async () => {
      const { token } = newUser();
      const response = await request(server())
        .get('/developer/usage')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body).toEqual({ data: null });
    });

    it('reports the configured limit, zero used, and the next UTC hour as reset_at', async () => {
      const { token } = newUser();
      await create(token).expect(201);

      const response = await request(server())
        .get('/developer/usage')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const { limit, used, reset_at: resetAt, daily } = response.body.data;
      expect(limit).toBeGreaterThanOrEqual(1);
      expect(used).toBe(0);
      expect(resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
      expect(new Date(resetAt).getTime()).toBeGreaterThan(Date.now());
      expect(daily).toHaveLength(30);
    });

    it('sums today and three days ago across an old revoked key and the active key', async () => {
      const { userId, token } = newUser();
      const first = await create(token).expect(201);
      const second = await regenerate(token).expect(201);
      const firstData = (first.body as KeyDataResponse).data;
      const secondData = (second.body as KeyDataResponse).data;

      const rows: { api_key_id: string; key_prefix: string }[] =
        await dataSource.query(
          `SELECT api_key_id, key_prefix FROM market_data.api_keys
           WHERE user_id = $1 ORDER BY created_at`,
          [userId],
        );
      const oldKeyId = rows.find(
        (r) => r.key_prefix === firstData.prefix,
      )?.api_key_id;
      const activeKeyId = rows.find(
        (r) => r.key_prefix === secondData.prefix,
      )?.api_key_id;

      const today = new Date().toISOString().slice(0, 10);
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      await dataSource.query(
        `INSERT INTO market_data.api_key_usage (api_key_id, usage_date, request_count)
         VALUES ($1, $3::date, 12), ($2, $3::date, 8), ($1, $4::date, 4)`,
        [oldKeyId, activeKeyId, today, threeDaysAgo],
      );

      const response = await request(server())
        .get('/developer/usage')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const daily: { date: string; request_count: number }[] =
        response.body.data.daily;
      expect(daily).toHaveLength(30);
      expect(daily[daily.length - 1]).toEqual({
        date: today,
        request_count: 20,
      });
      expect(daily.find((d) => d.date === threeDaysAgo)?.request_count).toBe(4);
    });

    it('reflects an incremented hourly counter in used', async () => {
      const { userId, token } = newUser();
      await create(token).expect(201);

      const [{ api_key_id: apiKeyId }]: { api_key_id: string }[] =
        await dataSource.query(
          `SELECT api_key_id FROM market_data.api_keys
           WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
      const counterKey = currentWindow(new Date()).counterKey(apiKeyId);
      createdRedisKeys.push(counterKey);
      await rateLimitCounter.increment(counterKey, 3600);

      const response = await request(server())
        .get('/developer/usage')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.data.used).toBe(1);
    });
  });
});

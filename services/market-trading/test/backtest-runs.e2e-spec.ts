import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { BacktestRunsController } from '../src/backtest-runs/backtest-runs.controller';
import { BacktestRunsService } from '../src/backtest-runs/backtest-runs.service';
import { BacktestRunsRepository } from '../src/backtest-runs/backtest-runs.repository';
import { BacktestRun } from '../src/backtest-runs/backtest-run.entity';
import { BacktestResult } from '../src/backtest-runs/backtest-result.entity';
import { configureMarketTradingApp } from '../src/app.setup';

// Signed here rather than mocked: these tests are the reason the routes are
// guarded, so they go through the real guard with real tokens.
const TEST_SECRET = 'e2e-only-secret';
const OWNER = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';
const OTHER_USER = '9f1c0b52-6d3e-4a70-9a1e-2b4c8d5e7f01';

describe('Backtest Runs (e2e)', () => {
  let app: NestExpressApplication;
  let mockRepo: Partial<Record<keyof BacktestRunsRepository, jest.Mock>>;
  let ownerAuth: string;
  let otherAuth: string;

  const validDto = {
    symbol: 'JKH',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    startingCapital: 1000000,
    rule: {
      buy: { type: 'period_start' },
      sell: [{ type: 'take_profit_pct', value: 10 }],
    },
    warmupPeriod: 0,
  };

  const sampleBars = [
    {
      tradeDate: '2026-08-01',
      open: '100.00',
      high: '105.00',
      low: '98.00',
      close: '102.00',
      volume: '1000',
    },
    {
      tradeDate: '2026-08-02',
      open: '102.00',
      high: '103.00',
      low: '95.00',
      close: '96.00',
      volume: '1100',
    },
    {
      tradeDate: '2026-08-03',
      open: '96.00',
      high: '108.00',
      low: '95.00',
      close: '107.00',
      volume: '1200',
    },
    {
      tradeDate: '2026-08-04',
      open: '107.00',
      high: '115.00',
      low: '106.00',
      close: '112.00',
      volume: '1300',
    },
    {
      tradeDate: '2026-08-05',
      open: '112.00',
      high: '120.00',
      low: '111.00',
      close: '118.00',
      volume: '1400',
    },
  ];

  const runsStore = new Map<string, BacktestRun>();
  const resultsStore = new Map<string, BacktestResult>();

  beforeAll(async () => {
    mockRepo = {
      findSecurityBySymbol: jest.fn().mockImplementation(async (symbol) => {
        if (symbol === 'JKH') {
          return { securityId: 'sec-123', symbol: 'JKH' };
        }
        return null;
      }),
      findDailyPricesBySecurity: jest.fn().mockResolvedValue(sampleBars),
      findWarmupDailyPrices: jest.fn().mockResolvedValue([]),
      createRun: jest.fn().mockImplementation(async (run) => {
        runsStore.set(run.id, run);
        return run;
      }),
      findRunByIdAndOwner: jest.fn().mockImplementation(async (id, ownerId) => {
        const run = runsStore.get(id);
        return run && run.ownerId === ownerId ? run : null;
      }),
      updateRunStatus: jest
        .fn()
        .mockImplementation(async (id, status, fields) => {
          const run = runsStore.get(id);
          if (run) {
            run.status = status;
            Object.assign(run, fields);
          }
        }),
      saveResult: jest.fn().mockImplementation(async (result) => {
        resultsStore.set(result.backtestRunId, result);
        return result;
      }),
      findResultByRunIdAndOwner: jest
        .fn()
        .mockImplementation(async (runId, ownerId) => {
          const run = runsStore.get(runId);
          if (!run || run.ownerId !== ownerId) return null;
          return resultsStore.get(runId) || null;
        }),
      runInTransaction: jest.fn().mockImplementation(async (cb) => {
        return cb({});
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: '5m' },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      controllers: [BacktestRunsController],
      providers: [
        BacktestRunsService,
        JwtAuthGuard,
        {
          provide: BacktestRunsRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    const jwt = moduleFixture.get(JwtService);
    ownerAuth = `Bearer ${jwt.sign({ sub: OWNER })}`;
    otherAuth = `Bearer ${jwt.sign({ sub: OTHER_USER })}`;

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should process a valid backtest submission, run it in background, and retrieve results', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(validDto)
      .expect(201);

    expect(postRes.body).toHaveProperty('id');
    expect(postRes.body.status).toBe('queued');

    const runId = postRes.body.id;

    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}`)
      .set('Authorization', ownerAuth)
      .expect(200);

    expect(statusRes.body.id).toBe(runId);
    expect(['queued', 'running', 'completed']).toContain(statusRes.body.status);

    await new Promise((r) => setTimeout(r, 100));

    const resultRes = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}/results`)
      .set('Authorization', ownerAuth)
      .expect(200);

    expect(resultRes.body).toHaveProperty('initialCapital', 1000000);
    expect(resultRes.body).toHaveProperty('finalCash');
    expect(resultRes.body).toHaveProperty('finalEquity');
    expect(resultRes.body.trades).toBeInstanceOf(Array);
    expect(resultRes.body.equityCurve).toBeInstanceOf(Array);
  });

  it('should reject invalid requests before run creation', async () => {
    const invalidDto = { ...validDto, startingCapital: -50 };

    const initialCount = runsStore.size;

    await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(invalidDto)
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        expect(res.body.error.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'startingCapital' }),
          ]),
        );
      });

    expect(runsStore.size).toBe(initialCount);
  });

  it('should return structured error envelope with trace_id on unknown symbol', async () => {
    const unknownSymbolDto = { ...validDto, symbol: 'NONEXISTENT' };

    const res = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(unknownSymbolDto)
      .expect(400);

    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('INVALID_SYMBOL');
    expect(res.body.error.message).toContain('NONEXISTENT');
    expect(res.body.error).toHaveProperty('trace_id');
  });

  it('refuses every route without a bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .send(validDto)
      .expect(401)
      .expect((res) => {
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      });

    await request(app.getHttpServer())
      .get('/api/v1/backtests/00000000-0000-0000-0000-000000000099')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/backtests/00000000-0000-0000-0000-000000000099/results')
      .expect(401);
  });

  // The header this replaced was caller-supplied, so one user reading another's
  // run was a matter of typing a different value.
  it('does not show a run to a different authenticated user', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(validDto)
      .expect(201);

    const runId = postRes.body.id;

    await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}`)
      .set('Authorization', otherAuth)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}/results`)
      .set('Authorization', otherAuth)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}`)
      .set('Authorization', ownerAuth)
      .expect(200);
  });

  it('should return structured error envelope with trace_id on run not found', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/backtests/00000000-0000-0000-0000-000000000099')
      .set('Authorization', ownerAuth)
      .expect(404);

    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('BACKTEST_NOT_FOUND');
    expect(res.body.error).toHaveProperty('trace_id');
  });
});

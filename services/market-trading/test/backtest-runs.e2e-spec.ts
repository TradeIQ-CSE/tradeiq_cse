import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BacktestRunsRepository } from '../src/backtest-runs/backtest-runs.repository';

jest.mock('@nestjs/typeorm', () => {
  const original = jest.requireActual('@nestjs/typeorm');
  return {
    ...original,
    TypeOrmModule: {
      forRoot: jest.fn().mockReturnValue({
        module: class DummyRootModule {},
        providers: [
          { provide: original.getEntityManagerToken(), useValue: {} },
          { provide: original.getDataSourceToken(), useValue: {} },
        ],
        exports: [original.getEntityManagerToken(), original.getDataSourceToken()],
      }),
      forFeature: jest.fn().mockReturnValue({
        module: class DummyFeatureModule {},
        providers: [],
        exports: [],
      }),
    },
  };
});

describe('Backtest Runs (e2e)', () => {
  let app: INestApplication;
  let mockRepo: any;

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
    { tradeDate: '2026-08-01', open: '100.00', high: '105.00', low: '98.00', close: '102.00', volume: '1000' },
    { tradeDate: '2026-08-02', open: '102.00', high: '103.00', low: '95.00', close: '96.00', volume: '1100' },
    { tradeDate: '2026-08-03', open: '96.00', high: '108.00', low: '95.00', close: '107.00', volume: '1200' },
    { tradeDate: '2026-08-04', open: '107.00', high: '115.00', low: '106.00', close: '112.00', volume: '1300' },
    { tradeDate: '2026-08-05', open: '112.00', high: '120.00', low: '111.00', close: '118.00', volume: '1400' },
  ];

  const runsStore = new Map<string, any>();
  const resultsStore = new Map<string, any>();

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
        return runsStore.get(id) || null;
      }),
      updateRunStatus: jest.fn().mockImplementation(async (id, status, fields) => {
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
      findResultByRunIdAndOwner: jest.fn().mockImplementation(async (runId, ownerId) => {
        return resultsStore.get(runId) || null;
      }),
      runInTransaction: jest.fn().mockImplementation(async (cb) => {
        return cb({});
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BacktestRunsRepository)
      .useValue(mockRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should process a valid backtest submission, run it in background, and retrieve results', async () => {
    const postRes = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('x-user-id', 'test-user-1')
      .send(validDto)
      .expect(201);

    expect(postRes.body).toHaveProperty('id');
    expect(postRes.body.status).toBe('queued');

    const runId = postRes.body.id;

    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}`)
      .set('x-user-id', 'test-user-1')
      .expect(200);

    expect(statusRes.body.id).toBe(runId);
    expect(['queued', 'running', 'completed']).toContain(statusRes.body.status);

    await new Promise((r) => setTimeout(r, 100));

    const resultRes = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${runId}/results`)
      .set('x-user-id', 'test-user-1')
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
      .set('x-user-id', 'test-user-1')
      .send(invalidDto)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('INVALID_STARTING_CAPITAL');
      });

    expect(runsStore.size).toBe(initialCount);
  });
});

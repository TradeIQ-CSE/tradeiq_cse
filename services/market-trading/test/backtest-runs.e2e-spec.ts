import { runBacktest } from '../src/backtesting/engine/runBacktest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestSigner, TestSigner } from './access-token';
import { AccessTokenKeyring } from '../src/auth/access-token-keyring';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { BacktestPolicyController } from '../src/backtest-runs/backtest-policy.controller';
import { BacktestPreviewController } from '../src/backtest-runs/backtest-preview.controller';
import { BacktestRunsController } from '../src/backtest-runs/backtest-runs.controller';
import { BacktestRunsService } from '../src/backtest-runs/backtest-runs.service';
import { BacktestRunsRepository } from '../src/backtest-runs/backtest-runs.repository';
import { BacktestRun } from '../src/backtest-runs/backtest-run.entity';
import { BacktestResult } from '../src/backtest-runs/backtest-result.entity';
import { DataCoverageService } from '../src/data-coverage/data-coverage.service';
import { configureMarketTradingApp } from '../src/app.setup';

// Signed here rather than mocked: these tests are the reason the routes are
// guarded, so they go through the real guard with real tokens — and, since
// TIQ-133, with a real RS256 keypair generated for this suite.
const signer: TestSigner = createTestSigner();
const OWNER = '2ed6b5f9-c9fa-41e9-9b34-a39aef711f4e';
const OTHER_USER = '9f1c0b52-6d3e-4a70-9a1e-2b4c8d5e7f01';

describe('Backtest Runs (e2e)', () => {
  let app: NestExpressApplication;
  let mockRepo: Partial<Record<keyof BacktestRunsRepository, jest.Mock>>;
  let ownerAuth: string;
  let otherAuth: string;

  const validDto = {
    symbol: 'JKH',
    startDate: '2025-08-02',
    endDate: '2025-08-06',
    startingCapital: 1000000,
    rule: {
      buy: { type: 'period_start' },
      sell: [{ type: 'take_profit_pct', value: 10 }],
    },
    warmupPeriod: 0,
  };

  const sampleBars = [
    {
      tradeDate: '2025-08-02',
      open: '100.00',
      high: '105.00',
      low: '98.00',
      close: '102.00',
      volume: '1000',
    },
    {
      tradeDate: '2025-08-03',
      open: '102.00',
      high: '103.00',
      low: '95.00',
      close: '96.00',
      volume: '1100',
    },
    {
      tradeDate: '2025-08-04',
      open: '96.00',
      high: '108.00',
      low: '95.00',
      close: '107.00',
      volume: '1200',
    },
    {
      tradeDate: '2025-08-05',
      open: '107.00',
      high: '115.00',
      low: '106.00',
      close: '112.00',
      volume: '1300',
    },
    {
      tradeDate: '2025-08-06',
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
      findDailyPricesBySecurity: jest
        .fn()
        .mockImplementation(async (_securityId, start, end) => {
          const history = [
            ...sampleBars,
            ...sampleBars.map((bar) => ({
              ...bar,
              tradeDate: bar.tradeDate.replace('2025', '2026'),
            })),
          ];
          return history.filter(
            (bar) => bar.tradeDate >= start && bar.tradeDate <= end,
          );
        }),
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
          verifyOptions: { algorithms: ['RS256'] },
        }),
      ],
      controllers: [
        BacktestPolicyController,
        BacktestPreviewController,
        BacktestRunsController,
      ],
      providers: [
        BacktestRunsService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => '2025-12-31' },
        },
        JwtAuthGuard,
        {
          // The guard picks its verification key out of the ring by the
          // token's `kid`. Built from the real class over a stub config so the
          // lookup under test is the one that runs in production.
          provide: AccessTokenKeyring,
          useValue: new AccessTokenKeyring({
            getOrThrow: () => signer.publicKeys,
          } as unknown as ConfigService),
        },
        {
          provide: BacktestRunsRepository,
          useValue: mockRepo,
        },
        {
          // No known gaps: these tests are exercising auth/ownership, not
          // data-gap handling (covered in backtest-runs.service.spec.ts).
          provide: DataCoverageService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              data: {
                prices: { from: null, to: null, gaps: [] },
                indices: { from: null, to: null, gaps: [] },
              },
            }),
            invalidate: jest.fn(),
          },
        },
      ],
    }).compile();

    ownerAuth = `Bearer ${signer.sign({ sub: OWNER })}`;
    otherAuth = `Bearer ${signer.sign({ sub: OTHER_USER })}`;

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureMarketTradingApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the public policy before the protected run-id route', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/backtests/policy')
      .expect(200);
    expect(response.body).toEqual({ maxDate: '2025-12-31' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(['/api/v1/backtests', '/api/v1/backtests/preview'])(
    'rejects post-policy dates at %s with structured details and no database work',
    async (path) => {
      const findCount = mockRepo.findSecurityBySymbol!.mock.calls.length;
      const priceCount = mockRepo.findDailyPricesBySecurity!.mock.calls.length;
      const runCount = mockRepo.createRun!.mock.calls.length;
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', ownerAuth)
        .send({ ...validDto, endDate: '2026-01-01' })
        .expect(400);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_DATE_RANGE',
        details: { field: 'endDate', maxDate: '2025-12-31' },
      });
      expect(response.body.error.message).toContain('31 December 2025');
      expect(mockRepo.findSecurityBySymbol!.mock.calls).toHaveLength(findCount);
      expect(mockRepo.findDailyPricesBySecurity!.mock.calls).toHaveLength(
        priceCount,
      );
      expect(mockRepo.createRun!.mock.calls).toHaveLength(runCount);
    },
  );

  it('accepts the inclusive cutoff with later history present and returns only supported observations', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/backtests/preview')
      .send({ ...validDto, endDate: '2025-12-31' })
      .expect(200);
    expect(response.body.equityCurve.length).toBeGreaterThan(0);
    expect(
      response.body.equityCurve.every(
        (point: { date: string }) => point.date <= '2025-12-31',
      ),
    ).toBe(true);
    expect(
      response.body.trades.every(
        (trade: { date: string }) => trade.date <= '2025-12-31',
      ),
    ).toBe(true);
  });

  it('preserves repeated strategy metadata and gives preview, direct engine and saved run identical results', async () => {
    const prices = [100, 110, 100, 110, 100, 110, 100].map((price, index) => ({
      ...sampleBars[0],
      tradeDate: `2025-08-${String(index + 2).padStart(2, '0')}`,
      open: String(price),
      high: String(price),
      low: String(price),
      close: String(price),
    }));
    mockRepo
      .findDailyPricesBySecurity!.mockResolvedValueOnce(prices)
      .mockResolvedValueOnce(prices);
    const dto = {
      ...validDto,
      endDate: '2025-08-08',
      rule: {
        ...validDto.rule,
        version: '2.0',
        reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
      },
    };
    const preview = await request(app.getHttpServer())
      .post('/api/v1/backtests/preview')
      .send(dto)
      .expect(200);
    expect(preview.body.strategy).toMatchObject({
      version: '2.0',
      reentryCondition: { value: 5 },
    });
    expect(preview.body.trades).toHaveLength(6);
    const direct = runBacktest({
      bars: prices.map((price) => ({
        date: price.tradeDate,
        open: Number(price.open),
        high: Number(price.high),
        low: Number(price.low),
        close: Number(price.close),
        volume: Number(price.volume),
      })),
      startDate: dto.startDate,
      endDate: dto.endDate,
      initialCapital: dto.startingCapital,
      positionSizing: { type: 'full_capital' },
      feeConfig: {
        brokerageRate: 0.0064,
        cseRate: 0.00084,
        cdsRate: 0.00024,
        secCessRate: 0.00072,
        stlRate: 0.003,
      },
      rules: preview.body.strategy,
    });
    expect(preview.body).toEqual({
      strategy: preview.body.strategy,
      ...direct,
    });
    const submitted = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(dto)
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saved = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${submitted.body.id}/results`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(saved.body).toEqual(preview.body);
    expect(runsStore.get(submitted.body.id)!.ruleConfig).toEqual(
      preview.body.strategy,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/backtests/${submitted.body.id}/results`)
      .set('Authorization', otherAuth)
      .expect(404);
  });

  it('executes database-style zero opening and low strings without changing stored history', async () => {
    const prices = [
      {
        ...sampleBars[0],
        tradeDate: '2025-08-02',
        open: '0.0000',
        high: '100.0000',
        low: '0.0000',
        close: '100.0000',
      },
      {
        ...sampleBars[0],
        tradeDate: '2025-08-03',
        open: '110.0000',
        high: '110.0000',
        low: '110.0000',
        close: '110.0000',
      },
      {
        ...sampleBars[0],
        tradeDate: '2025-08-04',
        open: '100.0000',
        high: '100.0000',
        low: '100.0000',
        close: '100.0000',
      },
    ];
    const original = JSON.parse(JSON.stringify(prices));
    mockRepo
      .findDailyPricesBySecurity!.mockResolvedValueOnce(prices)
      .mockResolvedValueOnce(prices);
    const dto = {
      ...validDto,
      endDate: '2025-08-04',
      rule: {
        ...validDto.rule,
        version: '2.0',
        reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
      },
    };
    const preview = await request(app.getHttpServer())
      .post('/api/v1/backtests/preview')
      .send(dto)
      .expect(200);
    expect(
      preview.body.trades.map(
        (trade: { executionPrice: number }) => trade.executionPrice,
      ),
    ).toEqual([100, 110]);
    const submitted = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(dto)
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saved = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${submitted.body.id}/results`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(saved.body).toEqual(preview.body);
    expect(prices).toEqual(original);
  });

  it.each([
    { brokerageRate: 1, cseRate: 0, cdsRate: 0, secCessRate: 0, stlRate: 0 },
    { brokerageRate: 2 },
    { brokerageRate: 0.6, cseRate: 0.5 },
    { brokerageRate: 1e308, cseRate: 1e308 },
  ])(
    'rejects invalid aggregate fees before saved persistence and in previews: %j',
    async (feeConfig) => {
      const before = runsStore.size;
      const dto = {
        ...validDto,
        feeConfig,
        rule: {
          ...validDto.rule,
          version: '2.0',
          reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
        },
      };
      for (const endpoint of [
        '/api/v1/backtests',
        '/api/v1/backtests/preview',
      ]) {
        const response = await request(app.getHttpServer())
          .post(endpoint)
          .set('Authorization', ownerAuth)
          .send(dto)
          .expect(400);
        expect(response.body.error.code).toBe('INVALID_RULE_CONFIGURATION');
      }
      expect(runsStore.size).toBe(before);
    },
  );

  it('preserves cash and ledger reconciliation for tiny consideration with valid near-100% fees', async () => {
    const prices = [
      {
        ...sampleBars[0],
        tradeDate: '2025-08-02',
        open: '0.5000',
        high: '0.5000',
        low: '0.5000',
        close: '0.5000',
      },
      {
        ...sampleBars[0],
        tradeDate: '2025-08-03',
        open: '0.0003',
        high: '0.0003',
        low: '0.0003',
        close: '0.0003',
      },
    ];
    mockRepo
      .findDailyPricesBySecurity!.mockResolvedValueOnce(prices)
      .mockResolvedValueOnce(prices);
    const dto = {
      ...validDto,
      endDate: '2025-08-03',
      startingCapital: 1,
      positionSizing: { type: 'fixed_quantity', value: 1 },
      feeConfig: {
        brokerageRate: 0.19999,
        cseRate: 0.19999,
        cdsRate: 0.19999,
        secCessRate: 0.19999,
        stlRate: 0.19999,
      },
      rule: {
        ...validDto.rule,
        version: '2.0',
        reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
      },
    };
    const preview = await request(app.getHttpServer())
      .post('/api/v1/backtests/preview')
      .send(dto)
      .expect(200);
    expect(preview.body.finalCash).toBe(0);
    expect(preview.body.trades[1].fees.total).toBe(0.0003);
    expect(preview.body.trades[1].netCashFlow).toBe(0);
    const submitted = await request(app.getHttpServer())
      .post('/api/v1/backtests')
      .set('Authorization', ownerAuth)
      .send(dto)
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const saved = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${submitted.body.id}/results`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(saved.body).toEqual(preview.body);
  });

  it.each([
    { version: '3.0' },
    { version: '2.0' },
    {
      version: '1.0',
      reentry: { type: 'price_falls_pct_from_last_sell', value: 5 },
    },
    { reentry: { type: 'price_falls_pct_from_last_sell', value: 5 } },
    {
      version: '2.0',
      reentry: { type: 'price_falls_pct_from_last_sell', value: 100 },
    },
    { version: null },
  ])(
    'rejects incompatible strategy fields %j in preview and saved submission',
    async (rule) => {
      const before = runsStore.size;
      for (const endpoint of ['/api/v1/backtests/preview', '/api/v1/backtests'])
        await request(app.getHttpServer())
          .post(endpoint)
          .set('Authorization', ownerAuth)
          .send({ ...validDto, rule: { ...validDto.rule, ...rule } })
          .expect(400);
      expect(runsStore.size).toBe(before);
    },
  );

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

    // Old result rows have no strategy metadata column; it comes from the owning run.
    expect(resultRes.body.strategy.version).toBe('1.0');
    expect(resultRes.body.strategy.reentryCondition).toBeUndefined();
    const originalPreview = await request(app.getHttpServer())
      .post('/api/v1/backtests/preview')
      .send(validDto)
      .expect(200);
    expect(resultRes.body).toEqual(originalPreview.body);
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

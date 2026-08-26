import { Test, TestingModule } from '@nestjs/testing';
import { BacktestRunsService } from '../backtest-runs.service';
import { BacktestRunsRepository } from '../backtest-runs.repository';
import { BacktestApiError } from '../errors/backtest-api-error';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { BacktestRun } from '../backtest-run.entity';
import { runBacktest, BacktestInput } from '../../backtesting';

describe('BacktestRunsService - Unit Tests', () => {
  let service: BacktestRunsService;
  let repo: jest.Mocked<BacktestRunsRepository>;

  const mockOwnerId = 'owner-uuid';

  // Localized definition for testing
  const DEFAULT_TEST_FEES = {
    brokerageRate: 0.0064,
    cseRate: 0.00084,
    cdsRate: 0.00024,
    secCessRate: 0.00072,
    stlRate: 0.003,
  };

  const validDto: CreateBacktestRunDto = {
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

  beforeEach(async () => {
    const mockRepoMethods = {
      createRun: jest.fn(),
      findRunByIdAndOwner: jest.fn(),
      updateRunStatus: jest.fn(),
      saveResult: jest.fn(),
      findResultByRunIdAndOwner: jest.fn(),
      findSecurityBySymbol: jest.fn(),
      findDailyPricesBySecurity: jest.fn(),
      findWarmupDailyPrices: jest.fn(),
      runInTransaction: jest.fn((cb) => cb({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BacktestRunsService,
        {
          provide: BacktestRunsRepository,
          useValue: mockRepoMethods,
        },
      ],
    }).compile();

    service = module.get<BacktestRunsService>(BacktestRunsService);
    repo = module.get(BacktestRunsRepository);
  });

  describe('Validation Checks', () => {
    it('should reject invalid symbols', async () => {
      repo.findSecurityBySymbol.mockResolvedValue(null);

      let error: any;
      try {
        await service.submitRun(validDto, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INVALID_SYMBOL');
      expect(repo.createRun).not.toHaveBeenCalled();
    });

    it('should reject start date after end date', async () => {
      const invalidDto = { ...validDto, startDate: '2026-08-10', endDate: '2026-08-05' };

      let error: any;
      try {
        await service.submitRun(invalidDto, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INVALID_DATE_RANGE');
      expect(repo.createRun).not.toHaveBeenCalled();
    });

    it('should reject zero or negative starting capital', async () => {
      const invalidDto = { ...validDto, startingCapital: 0 };

      let error: any;
      try {
        await service.submitRun(invalidDto, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INVALID_STARTING_CAPITAL');
      expect(repo.createRun).not.toHaveBeenCalled();
    });

    it('should reject invalid rule configuration', async () => {
      const invalidDto = {
        ...validDto,
        rule: {
          buy: { type: 'unsupported_type' },
          sell: [],
        },
      } as any;

      let error: any;
      try {
        await service.submitRun(invalidDto, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INVALID_RULE_CONFIGURATION');
      expect(repo.createRun).not.toHaveBeenCalled();
    });

    it('should reject insufficient historical simulation data', async () => {
      repo.findSecurityBySymbol.mockResolvedValue({ securityId: 'sec-123', symbol: 'JKH' } as any);
      repo.findDailyPricesBySecurity.mockResolvedValue([]);

      let error: any;
      try {
        await service.submitRun(validDto, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INSUFFICIENT_PRICE_HISTORY');
      expect(repo.createRun).not.toHaveBeenCalled();
    });

    it('should reject insufficient warmup data', async () => {
      repo.findSecurityBySymbol.mockResolvedValue({ securityId: 'sec-123', symbol: 'JKH' } as any);
      repo.findDailyPricesBySecurity.mockResolvedValue([sampleBars[0]] as any);
      repo.findWarmupDailyPrices.mockResolvedValue([]);

      const dtoWithWarmup = { ...validDto, warmupPeriod: 5 };

      let error: any;
      try {
        await service.submitRun(dtoWithWarmup, mockOwnerId);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(BacktestApiError);
      expect(error.code).toBe('INSUFFICIENT_WARMUP_DATA');
      expect(repo.createRun).not.toHaveBeenCalled();
    });
  });

  describe('State Transitions & Run Orchestration', () => {
    it('should successfully submit valid run, transition queued -> running -> completed, and write results', async () => {
      repo.findSecurityBySymbol.mockResolvedValue({ securityId: 'sec-123', symbol: 'JKH' } as any);
      repo.findDailyPricesBySecurity.mockResolvedValue(sampleBars as any);

      const createdRun: any = {
        id: 'run-123',
        ownerId: mockOwnerId,
        status: 'queued',
        symbol: 'JKH',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        startingCapital: 1000000,
        ruleConfig: {
          version: '1.0',
          buyCondition: { type: 'period_start' },
          sellConditions: [{ type: 'take_profit_pct', value: 10 }],
        },
        executionAssumptions: {
          feeConfig: DEFAULT_TEST_FEES,
          positionSizing: { type: 'full_capital' },
          warmupPeriod: 0,
        },
        createdAt: new Date(),
      };

      repo.createRun.mockResolvedValue(createdRun);
      repo.findRunByIdAndOwner.mockResolvedValue(createdRun);

      const run = await service.submitRun(validDto, mockOwnerId);
      expect(run.status).toBe('queued');
      expect(repo.createRun).toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith(run.id, 'running', expect.any(Object), undefined);
      expect(repo.updateRunStatus).toHaveBeenCalledWith(run.id, 'completed', expect.any(Object), expect.any(Object));
      expect(repo.saveResult).toHaveBeenCalled();
    });

    it('should mark runs as failed and store safe error code if engine fails', async () => {
      repo.findSecurityBySymbol.mockResolvedValue({ securityId: 'sec-123', symbol: 'JKH' } as any);
      repo.findDailyPricesBySecurity.mockResolvedValue(sampleBars as any);

      const createdRun: any = {
        id: 'run-555',
        ownerId: mockOwnerId,
        status: 'queued',
        symbol: 'JKH',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        startingCapital: 1000000,
        ruleConfig: {
          version: '1.0',
          buyCondition: { type: 'invalid_engine_condition' },
          sellConditions: [{ type: 'take_profit_pct', value: 10 }],
        } as any,
        executionAssumptions: {
          feeConfig: DEFAULT_TEST_FEES,
          positionSizing: { type: 'full_capital' },
        },
        createdAt: new Date(),
      };

      repo.createRun.mockResolvedValue(createdRun);
      repo.findRunByIdAndOwner.mockResolvedValue(createdRun);

      const run = await service.submitRun(validDto, mockOwnerId);

      await new Promise((r) => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith(run.id, 'failed', expect.objectContaining({
        failureCode: 'INVALID_RULE',
        failureReason: expect.any(String),
      }), undefined);
    });
  });

  describe('Result Consistency Checks', () => {
    it('should produce identical results through service and direct engine run', async () => {
      const directInput: BacktestInput = {
        bars: sampleBars.map((b) => ({
          date: b.tradeDate,
          open: parseFloat(b.open),
          high: parseFloat(b.high),
          low: parseFloat(b.low),
          close: parseFloat(b.close),
          volume: parseInt(b.volume, 10),
        })),
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        initialCapital: 1000000,
        positionSizing: { type: 'full_capital' },
        feeConfig: DEFAULT_TEST_FEES,
        rules: {
          version: '1.0',
          buyCondition: { type: 'period_start' },
          sellConditions: [{ type: 'take_profit_pct', value: 10 }],
        } as any,
        warmupPeriod: 0,
      };
      const directResult = runBacktest(directInput);

      repo.findSecurityBySymbol.mockResolvedValue({ securityId: 'sec-123', symbol: 'JKH' } as any);
      repo.findDailyPricesBySecurity.mockResolvedValue(sampleBars as any);

      const createdRun: any = {
        id: 'run-999',
        ownerId: mockOwnerId,
        status: 'queued',
        symbol: 'JKH',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        startingCapital: 1000000,
        ruleConfig: directInput.rules,
        executionAssumptions: {
          feeConfig: directInput.feeConfig,
          positionSizing: directInput.positionSizing,
          warmupPeriod: 0,
        },
        createdAt: new Date(),
      };

      repo.createRun.mockResolvedValue(createdRun);
      repo.findRunByIdAndOwner.mockResolvedValue(createdRun);

      await service.submitRun(validDto, mockOwnerId);

      await new Promise((r) => setTimeout(r, 50));

      expect(repo.saveResult).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'JKH',
        summaryMetrics: expect.objectContaining({
          initialCapital: directResult.initialCapital,
          finalCash: directResult.finalCash,
          finalEquity: directResult.finalEquity,
        }),
        tradeLedger: directResult.trades,
        equityCurve: directResult.equityCurve,
      }), expect.any(Object));
    });
  });
});

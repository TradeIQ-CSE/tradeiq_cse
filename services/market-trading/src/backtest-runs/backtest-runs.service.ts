import { Injectable, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import { BacktestRunsRepository } from './backtest-runs.repository';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';
import { BacktestRun } from './backtest-run.entity';
import { BacktestResult } from './backtest-result.entity';
import { DailyPrice } from '../db/entities/daily-price.entity';
import { DataCoverageService } from '../data-coverage/data-coverage.service';
import { BacktestApiError, mapEngineError } from './errors/backtest-api-error';
import { runBacktest } from '../backtesting/engine/runBacktest';
import { validateRule } from '../backtesting/rules/validateRule';
import {
  BacktestInput,
  FeeConfig,
  RuleSet,
  BuyConditionType,
  SellConditionType,
  PositionSizingConfig,
  PositionSizingType,
} from '../backtesting/domain/types';

// Validate allowed state transitions
function validateStateTransition(
  current: 'queued' | 'running' | 'completed' | 'failed',
  next: 'queued' | 'running' | 'completed' | 'failed',
) {
  const allowed: Record<string, string[]> = {
    queued: ['running', 'failed'],
    running: ['completed', 'failed'],
    completed: [],
    failed: [],
  };

  if (!allowed[current]?.includes(next)) {
    throw new Error(`Invalid state transition from ${current} to ${next}`);
  }
}

// Steps an ISO date over a weekend, forwards (1) or backwards (-1), leaving a
// weekday unchanged. UTC throughout so the runtime's time zone cannot shift
// the calendar day.
function toWeekday(date: string, step: 1 | -1): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) {
    value.setUTCDate(value.getUTCDate() + step);
  }
  return value.toISOString().slice(0, 10);
}

interface PreparedRun {
  ruleSet: RuleSet;
  feeConfig: FeeConfig;
  positionSizing: PositionSizingConfig;
  warmupPeriod: number;
  warmupPrices: DailyPrice[];
  simulationPrices: DailyPrice[];
}

/** The results body a preview returns — the same shape as GET :runId/results. */
export interface BacktestPreview {
  initialCapital: number;
  finalCash: number;
  finalEquity: number;
  trades: ReturnType<typeof runBacktest>['trades'];
  equityCurve: ReturnType<typeof runBacktest>['equityCurve'];
}

// `warmupPrices` arrive newest first (findWarmupDailyPrices orders DESC so
// its LIMIT takes the bars nearest the start); the engine needs one
// chronological series.
function toEngineInput(
  run: Pick<
    BacktestRun,
    | 'startDate'
    | 'endDate'
    | 'startingCapital'
    | 'ruleConfig'
    | 'executionAssumptions'
  >,
  warmupPrices: DailyPrice[],
  simulationPrices: DailyPrice[],
): BacktestInput {
  const allPrices = [...[...warmupPrices].reverse(), ...simulationPrices];
  return {
    bars: allPrices.map((p) => ({
      date: p.tradeDate,
      open: p.open ? parseFloat(p.open) : parseFloat(p.close),
      high: parseFloat(p.high),
      low: parseFloat(p.low),
      close: parseFloat(p.close),
      volume: parseInt(p.volume || '0', 10),
    })),
    startDate: run.startDate,
    endDate: run.endDate,
    initialCapital: Number(run.startingCapital),
    positionSizing: run.executionAssumptions.positionSizing,
    feeConfig: run.executionAssumptions.feeConfig,
    rules: run.ruleConfig,
    warmupPeriod: run.executionAssumptions.warmupPeriod,
  };
}

@Injectable()
export class BacktestRunsService {
  constructor(
    private readonly repository: BacktestRunsRepository,
    private readonly dataCoverage: DataCoverageService,
  ) {}

  // Everything a run needs before the engine: validation, the data-gap check
  // and the price history. Shared by a saved run and a preview, so the two
  // accept and reject exactly the same requests.
  private async prepareRun(dto: CreateBacktestRunDto): Promise<PreparedRun> {
    // 1. DTO and Boundary Validation
    if (!dto.symbol) {
      throw new BacktestApiError('INVALID_SYMBOL', 'Symbol is required.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dto.startDate || !dateRegex.test(dto.startDate)) {
      throw new BacktestApiError(
        'INVALID_DATE_RANGE',
        'startDate must be in YYYY-MM-DD format.',
      );
    }
    if (!dto.endDate || !dateRegex.test(dto.endDate)) {
      throw new BacktestApiError(
        'INVALID_DATE_RANGE',
        'endDate must be in YYYY-MM-DD format.',
      );
    }

    const startMs = Date.parse(dto.startDate);
    const endMs = Date.parse(dto.endDate);
    if (isNaN(startMs) || isNaN(endMs)) {
      throw new BacktestApiError(
        'INVALID_DATE_RANGE',
        'startDate or endDate is an invalid calendar date.',
      );
    }
    if (startMs > endMs) {
      throw new BacktestApiError(
        'INVALID_DATE_RANGE',
        'startDate cannot be after endDate.',
      );
    }

    if (dto.startingCapital <= 0) {
      throw new BacktestApiError(
        'INVALID_STARTING_CAPITAL',
        'startingCapital must be greater than 0.',
      );
    }

    if (!dto.rule) {
      throw new BacktestApiError(
        'INVALID_RULE_CONFIGURATION',
        'Rule configuration is required.',
      );
    }

    // 2. Rule DSL Mapping and Validation
    const ruleSet: RuleSet = {
      version: '1.0',
      buyCondition: {
        type: (dto.rule.buy?.type === 'price_fall_pct'
          ? 'price_falls_pct_from_period_start'
          : dto.rule.buy?.type) as BuyConditionType,
        value: dto.rule.buy?.value,
      },
      sellConditions: (dto.rule.sell || []).map((s) => ({
        type: s.type as SellConditionType,
        value: s.value,
      })),
    };

    try {
      validateRule(ruleSet);
    } catch (err: unknown) {
      throw mapEngineError(err);
    }

    // 3. Database Validation (Symbol and price history)
    const security = await this.repository.findSecurityBySymbol(dto.symbol);
    if (!security) {
      throw new BacktestApiError(
        'INVALID_SYMBOL',
        `Symbol '${dto.symbol}' not found.`,
      );
    }

    // 3.5 Data-gap validation. A start or end date that falls inside a
    // `missing_data` gap must not silently start (or end) the
    // simulation on the first bar the price lookup happens to find
    // (docs/plans/data-gap-handling.md §2). A range that only crosses a gap
    // is accepted unchanged, and `market_closed` gaps (real market history,
    // like a weekend) never reject either end.
    // Gap bounds are always weekdays, so a weekend start is first moved
    // forward, and a weekend end back, to the session it actually selects:
    // otherwise an end on the Sunday after a gap would pass and quietly end
    // the run on the last bar before it.
    const coverage = await this.dataCoverage.get();
    const gapContaining = (date: string) =>
      coverage.data.prices.gaps.find(
        (gap) =>
          gap.kind === 'missing_data' && date >= gap.from && date <= gap.to,
      );
    const startGap = gapContaining(toWeekday(dto.startDate, 1));
    const dateGap = startGap ?? gapContaining(toWeekday(dto.endDate, -1));
    if (dateGap) {
      throw new BacktestApiError(
        'DATE_IN_DATA_GAP',
        `No market data from ${dateGap.from} to ${dateGap.to}. Choose a date outside this period.`,
        {
          field: startGap ? 'startDate' : 'endDate',
          from: dateGap.from,
          to: dateGap.to,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const simulationPrices = await this.repository.findDailyPricesBySecurity(
      security.securityId,
      dto.startDate,
      dto.endDate,
    );

    if (simulationPrices.length === 0) {
      throw new BacktestApiError(
        'INSUFFICIENT_PRICE_HISTORY',
        `No price history bars found within the simulation range: ${dto.startDate} to ${dto.endDate}`,
      );
    }

    const warmupPeriod = dto.warmupPeriod ?? 0;
    let warmupPrices: DailyPrice[] = [];
    if (warmupPeriod > 0) {
      warmupPrices = await this.repository.findWarmupDailyPrices(
        security.securityId,
        dto.startDate,
        warmupPeriod,
      );

      if (warmupPrices.length < warmupPeriod) {
        throw new BacktestApiError(
          'INSUFFICIENT_WARMUP_DATA',
          `Insufficient warm-up data. Required: ${warmupPeriod}, Available: ${warmupPrices.length}`,
        );
      }
    }

    // 4. Default execution assumptions
    const feeConfig = {
      brokerageRate: dto.feeConfig?.brokerageRate ?? 0.0064,
      cseRate: dto.feeConfig?.cseRate ?? 0.00084,
      cdsRate: dto.feeConfig?.cdsRate ?? 0.00024,
      secCessRate: dto.feeConfig?.secCessRate ?? 0.00072,
      stlRate: dto.feeConfig?.stlRate ?? 0.003,
    };

    const positionSizing: PositionSizingConfig = {
      type: (dto.positionSizing?.type ?? 'full_capital') as PositionSizingType,
      value: dto.positionSizing?.value,
    };

    return {
      ruleSet,
      feeConfig,
      positionSizing,
      warmupPeriod,
      warmupPrices,
      simulationPrices,
    };
  }

  async submitRun(
    dto: CreateBacktestRunDto,
    ownerId: string,
  ): Promise<BacktestRun> {
    const prepared = await this.prepareRun(dto);

    // Persist QUEUED run
    const run = new BacktestRun();
    run.id = crypto.randomUUID();
    run.ownerId = ownerId;
    run.status = 'queued';
    run.symbol = dto.symbol;
    run.startDate = dto.startDate;
    run.endDate = dto.endDate;
    run.startingCapital = dto.startingCapital;
    run.ruleConfig = prepared.ruleSet;
    run.executionAssumptions = {
      feeConfig: prepared.feeConfig,
      positionSizing: prepared.positionSizing,
      warmupPeriod: prepared.warmupPeriod,
    };
    run.createdAt = new Date();

    await this.repository.createRun(run);

    // Asynchronous Background Execution (Fire-and-forget)
    this.runExecutionAsync(
      run.id,
      ownerId,
      prepared.warmupPrices,
      prepared.simulationPrices,
    ).catch((err) => {
      console.error('Unhandled background backtest error:', err);
    });

    return run;
  }

  /**
   * Runs a backtest for a visitor who is not signed in: the same validation
   * and engine as `submitRun`, but synchronous and stored nowhere. There is
   * no run to own, so nothing needs an owner and nothing can be read back
   * later — saving a result means signing in and submitting it as a run.
   * One security's daily bars over the dataset window is a few thousand
   * rows, so the engine finishes well inside a request.
   */
  async previewRun(dto: CreateBacktestRunDto): Promise<BacktestPreview> {
    const prepared = await this.prepareRun(dto);
    let engineResult: ReturnType<typeof runBacktest>;
    try {
      engineResult = runBacktest(
        toEngineInput(
          {
            startDate: dto.startDate,
            endDate: dto.endDate,
            startingCapital: dto.startingCapital,
            ruleConfig: prepared.ruleSet,
            executionAssumptions: {
              feeConfig: prepared.feeConfig,
              positionSizing: prepared.positionSizing,
              warmupPeriod: prepared.warmupPeriod,
            },
          },
          prepared.warmupPrices,
          prepared.simulationPrices,
        ),
      );
    } catch (err: unknown) {
      throw mapEngineError(err);
    }
    return {
      initialCapital: engineResult.initialCapital,
      finalCash: engineResult.finalCash,
      finalEquity: engineResult.finalEquity,
      trades: engineResult.trades,
      equityCurve: engineResult.equityCurve,
    };
  }

  async getRunStatus(runId: string, ownerId: string): Promise<BacktestRun> {
    const run = await this.repository.findRunByIdAndOwner(runId, ownerId);
    if (!run) {
      throw new BacktestApiError(
        'BACKTEST_NOT_FOUND',
        `Backtest run not found.`,
        null,
        HttpStatus.NOT_FOUND,
      );
    }
    return run;
  }

  async getRunResults(runId: string, ownerId: string): Promise<BacktestResult> {
    const run = await this.repository.findRunByIdAndOwner(runId, ownerId);
    if (!run) {
      throw new BacktestApiError(
        'BACKTEST_NOT_FOUND',
        `Backtest run not found.`,
        null,
        HttpStatus.NOT_FOUND,
      );
    }

    if (run.status === 'failed') {
      throw new BacktestApiError(
        'BACKTEST_EXECUTION_FAILED',
        `Backtest run failed: ${run.failureReason || 'unknown reason'}`,
      );
    }

    if (run.status !== 'completed') {
      throw new BacktestApiError(
        'BACKTEST_NOT_COMPLETED',
        `Backtest results are not available yet. Current status: ${run.status}`,
      );
    }

    const result = await this.repository.findResultByRunIdAndOwner(
      runId,
      ownerId,
    );
    if (!result) {
      throw new BacktestApiError(
        'BACKTEST_NOT_COMPLETED',
        'Backtest results could not be located.',
      );
    }

    return result;
  }

  private async updateStatus(
    runId: string,
    ownerId: string,
    nextStatus: 'queued' | 'running' | 'completed' | 'failed',
    updateFields: Partial<BacktestRun> = {},
    manager?: EntityManager,
  ): Promise<BacktestRun> {
    const run = await this.repository.findRunByIdAndOwner(
      runId,
      ownerId,
      manager,
    );
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    validateStateTransition(run.status, nextStatus);

    await this.repository.updateRunStatus(
      runId,
      nextStatus,
      updateFields,
      manager,
    );
    run.status = nextStatus;
    Object.assign(run, updateFields);
    return run;
  }

  private async runExecutionAsync(
    runId: string,
    ownerId: string,
    warmupPrices: DailyPrice[],
    simulationPrices: DailyPrice[],
  ) {
    try {
      // 1. Move to running
      await this.updateStatus(runId, ownerId, 'running', {
        startedAt: new Date(),
      });

      // Load updated run configuration
      const run = await this.repository.findRunByIdAndOwner(runId, ownerId);
      if (!run) {
        throw new Error(
          `Run ${runId} not found during execution initialization.`,
        );
      }

      // 2-3. Map prices and assemble engine inputs
      const backtestInput = toEngineInput(run, warmupPrices, simulationPrices);

      // 4. Run calculations
      const engineResult = runBacktest(backtestInput);

      // 5. Write results and set completed in single transaction
      await this.repository.runInTransaction(async (manager) => {
        const result = new BacktestResult();
        result.id = crypto.randomUUID();
        result.backtestRunId = runId;
        result.symbol = run.symbol;
        result.summaryMetrics = {
          initialCapital: engineResult.initialCapital,
          finalCash: engineResult.finalCash,
          finalEquity: engineResult.finalEquity,
          totalReturnPct:
            ((engineResult.finalEquity - engineResult.initialCapital) /
              engineResult.initialCapital) *
            100,
        };
        result.tradeLedger = engineResult.trades;
        result.equityCurve = engineResult.equityCurve;

        await this.repository.saveResult(result, manager);

        await this.updateStatus(
          runId,
          ownerId,
          'completed',
          { completedAt: new Date() },
          manager,
        );
      });
    } catch (err: unknown) {
      console.error(`Backtest run ${runId} execution failed:`, err);
      try {
        const errorObj = err as { message?: string; code?: string };
        const safeReason =
          errorObj?.message || 'The backtest could not be completed.';
        const failureCode = errorObj?.code || 'BACKTEST_EXECUTION_FAILED';
        await this.updateStatus(runId, ownerId, 'failed', {
          failureCode,
          failureReason: safeReason,
          completedAt: new Date(),
        });
      } catch (innerErr) {
        console.error(`Fatal transition failure on run ${runId}:`, innerErr);
      }
    }
  }
}

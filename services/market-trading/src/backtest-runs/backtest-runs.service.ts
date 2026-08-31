import { Injectable, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import { BacktestRunsRepository } from './backtest-runs.repository';
import { CreateBacktestRunDto } from './dto/create-backtest-run.dto';
import { BacktestRun } from './backtest-run.entity';
import { BacktestResult } from './backtest-result.entity';
import { DailyPrice } from '../db/entities/daily-price.entity';
import { BacktestApiError, mapEngineError } from './errors/backtest-api-error';
import { runBacktest } from '../backtesting/engine/runBacktest';
import { validateRule } from '../backtesting/rules/validateRule';
import {
  BacktestInput,
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

@Injectable()
export class BacktestRunsService {
  constructor(private readonly repository: BacktestRunsRepository) {}

  async submitRun(
    dto: CreateBacktestRunDto,
    ownerId: string,
  ): Promise<BacktestRun> {
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

    // 5. Persist QUEUED run
    const run = new BacktestRun();
    run.id = crypto.randomUUID();
    run.ownerId = ownerId;
    run.status = 'queued';
    run.symbol = dto.symbol;
    run.startDate = dto.startDate;
    run.endDate = dto.endDate;
    run.startingCapital = dto.startingCapital;
    run.ruleConfig = ruleSet;
    run.executionAssumptions = {
      feeConfig,
      positionSizing,
      warmupPeriod,
    };
    run.createdAt = new Date();

    await this.repository.createRun(run);

    // 6. Asynchronous Background Execution (Fire-and-forget)
    this.runExecutionAsync(
      run.id,
      ownerId,
      warmupPrices,
      simulationPrices,
    ).catch((err) => {
      console.error('Unhandled background backtest error:', err);
    });

    return run;
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

      // 2. Map prices to engine format
      const sortedWarmup = [...warmupPrices].reverse(); // reverse chronological ordering back to normal chronological
      const allPrices = [...sortedWarmup, ...simulationPrices];

      const bars = allPrices.map((p) => ({
        date: p.tradeDate,
        open: p.open ? parseFloat(p.open) : 0,
        high: parseFloat(p.high),
        low: parseFloat(p.low),
        close: parseFloat(p.close),
        volume: parseInt(p.volume || '0', 10),
      }));

      // 3. Assemble inputs
      const backtestInput: BacktestInput = {
        bars,
        startDate: run.startDate,
        endDate: run.endDate,
        initialCapital: Number(run.startingCapital),
        positionSizing: run.executionAssumptions.positionSizing,
        feeConfig: run.executionAssumptions.feeConfig,
        rules: run.ruleConfig,
        warmupPeriod: run.executionAssumptions.warmupPeriod,
      };

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

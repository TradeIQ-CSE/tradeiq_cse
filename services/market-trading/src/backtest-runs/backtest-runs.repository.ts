import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BacktestRun } from './backtest-run.entity';
import { BacktestResult } from './backtest-result.entity';
import { Security } from '../db/entities/security.entity';
import { DailyPrice } from '../db/entities/daily-price.entity';

@Injectable()
export class BacktestRunsRepository {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async createRun(run: BacktestRun, manager?: EntityManager): Promise<BacktestRun> {
    const em = manager || this.entityManager;
    return em.save(BacktestRun, run);
  }

  async findRunByIdAndOwner(
    id: string,
    ownerId: string,
    manager?: EntityManager,
  ): Promise<BacktestRun | null> {
    const em = manager || this.entityManager;
    return em.findOne(BacktestRun, { where: { id, ownerId } });
  }

  async updateRunStatus(
    id: string,
    status: 'queued' | 'running' | 'completed' | 'failed',
    updateFields: Partial<BacktestRun>,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager || this.entityManager;
    await em.update(BacktestRun, id, { status, ...updateFields });
  }

  async saveResult(result: BacktestResult, manager?: EntityManager): Promise<BacktestResult> {
    const em = manager || this.entityManager;
    return em.save(BacktestResult, result);
  }

  async findResultByRunIdAndOwner(
    runId: string,
    ownerId: string,
    manager?: EntityManager,
  ): Promise<BacktestResult | null> {
    const em = manager || this.entityManager;
    const run = await this.findRunByIdAndOwner(runId, ownerId, em);
    if (!run) {
      return null;
    }
    return em.findOne(BacktestResult, { where: { backtestRunId: runId } });
  }

  async findSecurityBySymbol(symbol: string): Promise<Security | null> {
    return this.entityManager.findOne(Security, { where: { symbol } });
  }

  async findDailyPricesBySecurity(
    securityId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DailyPrice[]> {
    const query = this.entityManager.createQueryBuilder(DailyPrice, 'dp')
      .where('dp.securityId = :securityId', { securityId });

    if (startDate) {
      query.andWhere('dp.tradeDate >= :startDate', { startDate });
    }
    if (endDate) {
      query.andWhere('dp.tradeDate <= :endDate', { endDate });
    }

    return query.orderBy('dp.tradeDate', 'ASC').getMany();
  }

  async findWarmupDailyPrices(
    securityId: string,
    startDate: string,
    warmupPeriod: number,
  ): Promise<DailyPrice[]> {
    return this.entityManager.createQueryBuilder(DailyPrice, 'dp')
      .where('dp.securityId = :securityId', { securityId })
      .andWhere('dp.tradeDate < :startDate', { startDate })
      .orderBy('dp.tradeDate', 'DESC')
      .limit(warmupPeriod)
      .getMany();
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.entityManager.transaction(work);
  }
}

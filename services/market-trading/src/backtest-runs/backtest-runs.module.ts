import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacktestRunsController } from './backtest-runs.controller';
import { BacktestRunsService } from './backtest-runs.service';
import { BacktestRunsRepository } from './backtest-runs.repository';
import { BacktestRun } from './backtest-run.entity';
import { BacktestResult } from './backtest-result.entity';
import { Security } from '../db/entities/security.entity';
import { DailyPrice } from '../db/entities/daily-price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BacktestRun, BacktestResult, Security, DailyPrice]),
  ],
  controllers: [BacktestRunsController],
  providers: [BacktestRunsService, BacktestRunsRepository],
  exports: [BacktestRunsService],
})
export class BacktestRunsModule {}

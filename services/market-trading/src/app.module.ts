import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as dotenv from 'dotenv';
import { HealthModule } from './health/health.module';
import { BacktestRunsModule } from './backtest-runs/backtest-runs.module';

dotenv.config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.MARKET_DATA_DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
      logging: false,
    }),
    HealthModule,
    BacktestRunsModule,
  ],
})
export class AppModule {}


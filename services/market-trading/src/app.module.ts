import { join } from 'path';
import { Module } from '@nestjs/common';
<<<<<<< HEAD
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
=======
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { validate } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { MarketOverviewModule } from './market-overview/market-overview.module';
import { PaperTradingQuotesModule } from './paper-trading-quotes/paper-trading-quotes.module';
import { SecuritiesModule } from './securities/securities.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: config.getOrThrow<string>('database.url'),
        entities: [],
        autoLoadEntities: true,
        // Compiled output mirrors src/, so this resolves to
        // dist/db/migrations/*.js at runtime.
        migrations: [join(__dirname, 'db', 'migrations', '*.js')],
        // Pin the tracking table to public: once the market_data schema exists,
        // the market_data user's default search_path ("$user", public) would
        // otherwise resolve an unqualified "migrations" to that schema.
        migrationsTableName: 'public.migrations',
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    HealthModule,
    MarketOverviewModule,
    PaperTradingQuotesModule,
    SecuritiesModule,
>>>>>>> origin/dev
  ],
})
export class AppModule {}


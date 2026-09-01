import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { validate } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PortfoliosModule } from './portfolios/portfolios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, databaseConfig],
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
        // dist/db/migrations/*.js at runtime or src/db/migrations/*.ts in tests/ts-node.
        migrations: [join(__dirname, 'db', 'migrations', '*.{js,ts}')],
        // Pin the tracking table to public: once the auth schema exists, the
        // auth user's default search_path ("$user", public) would otherwise
        // resolve an unqualified "migrations" to that schema.
        migrationsTableName: 'public.migrations',
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    HealthModule,
    PortfoliosModule,
  ],
})
export class AppModule {}

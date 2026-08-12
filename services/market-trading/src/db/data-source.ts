import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.MARKET_DATA_DATABASE_URL,
  entities: [],
  migrations: ['src/db/migrations/*.ts'],
  // pin tracking table to public: once the market_data schema exists, the
  // market_data user's default search_path ("$user", public) would otherwise
  // resolve an unqualified "migrations" to the market_data schema.
  migrationsTableName: 'public.migrations',
  synchronize: false,
});

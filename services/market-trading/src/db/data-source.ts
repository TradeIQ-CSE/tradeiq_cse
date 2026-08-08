import 'reflect-metadata';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.MARKET_DATA_DATABASE_URL,
  entities: [],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});

import 'reflect-metadata';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.AUTH_DATABASE_URL,
  entities: [],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const KEYS = [
  'NODE_ENV',
  'MARKET_TRADING_PORT',
  'MARKET_DATA_DATABASE_URL',
  'MARKET_TRADING_CORS_ORIGINS',
  'MARKET_INGESTION_TOKEN',
  'AUTH_JWT_PUBLIC_KEYS',
  'REDIS_URL',
  'PUBLIC_API_HOURLY_LIMIT',
  'BACKTEST_MAX_DATE',
] as const;

/** Local tools share one root file; deployed services use injected variables. */
export function loadLocalEnvironment(
  filePath = resolve(__dirname, '../../../../.env'),
): void {
  if (process.env.NODE_ENV === 'production' || !existsSync(filePath)) return;
  const values = parse(readFileSync(filePath));
  for (const key of KEYS) {
    if (process.env[key] === undefined && values[key] !== undefined) {
      process.env[key] = values[key];
    }
  }
}

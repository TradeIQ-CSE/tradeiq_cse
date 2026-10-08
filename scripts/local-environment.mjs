import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const services = {
  frontend: {
    directory: 'frontend',
    command: 'pnpm',
    keys: ['FRONTEND_PORT', 'VITE_MARKET_TRADING_API_URL', 'VITE_IDENTITY_AUTH_API_URL'],
  },
  'market-trading': {
    directory: 'services/market-trading',
    command: 'pnpm',
    keys: ['NODE_ENV', 'MARKET_TRADING_PORT', 'MARKET_DATA_DATABASE_URL',
      'MARKET_TRADING_CORS_ORIGINS', 'MARKET_INGESTION_TOKEN', 'AUTH_JWT_PUBLIC_KEYS',
      'REDIS_URL', 'PUBLIC_API_HOURLY_LIMIT', 'BACKTEST_MAX_DATE'],
  },
  'identity-auth': {
    directory: 'services/identity-auth',
    command: 'pnpm',
    keys: ['NODE_ENV', 'IDENTITY_AUTH_PORT', 'AUTH_DATABASE_URL',
      'IDENTITY_AUTH_CORS_ORIGINS', 'AUTH_JWT_PRIVATE_KEY', 'AUTH_JWT_PUBLIC_KEYS',
      'AUTH_EMAIL_ENCRYPTION_KEY', 'AUTH_ACCESS_TOKEN_TTL', 'AUTH_REFRESH_TOKEN_TTL',
      'AUTH_REFRESH_COOKIE_SECURE'],
  },
  'ml-prediction': {
    directory: 'services/ml-prediction',
    command: 'uv',
    keys: ['ML_DATABASE_URL', 'ML_PREDICTION_PORT'],
  },
  'data-ingestion': {
    directory: 'pipeline/data-ingestion',
    command: 'uv',
    keys: ['DATA_INGESTION_MARKET_DATA_DATABASE_URL', 'CSE_DATASET_ARTIFACT'],
  },
};

export function serviceEnvironment(name, inherited = process.env, filePath = resolve(repoRoot, '.env')) {
  const service = services[name];
  if (!service) throw new Error(`Unknown service: ${name}`);
  const values = inherited.NODE_ENV !== 'production' && existsSync(filePath)
    ? parseEnv(readFileSync(filePath, 'utf8')) : {};
  // Keep OS/tool settings, but remove application settings before selecting this service's keys.
  const environment = { ...inherited };
  const applicationKeys = new Set([
    ...Object.keys(values), ...Object.values(services).flatMap((entry) => entry.keys),
    'POSTGRES_USER', 'POSTGRES_PASSWORD', 'DB_PORT', 'REDIS_PORT', 'IMAGE_TAG',
    'MARKET_DATA_DB_PASSWORD', 'AUTH_DB_PASSWORD', 'ML_DB_PASSWORD',
  ]);
  for (const key of applicationKeys) delete environment[key];
  for (const key of service.keys) {
    if (inherited[key] !== undefined) environment[key] = inherited[key];
    else if (values[key] !== undefined) environment[key] = values[key];
  }
  return environment;
}

export function requireNode20() {
  if (Number(process.versions.node.split('.')[0]) !== 20) {
    throw new Error('Node.js 20 is required. Select the version in .node-version, then retry.');
  }
}

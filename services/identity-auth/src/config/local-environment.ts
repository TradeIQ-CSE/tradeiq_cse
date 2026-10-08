import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const KEYS = [
  'NODE_ENV',
  'IDENTITY_AUTH_PORT',
  'AUTH_DATABASE_URL',
  'IDENTITY_AUTH_CORS_ORIGINS',
  'AUTH_JWT_PRIVATE_KEY',
  'AUTH_JWT_PUBLIC_KEYS',
  'AUTH_EMAIL_ENCRYPTION_KEY',
  'AUTH_ACCESS_TOKEN_TTL',
  'AUTH_REFRESH_TOKEN_TTL',
  'AUTH_REFRESH_COOKIE_SECURE',
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

import { registerAs } from '@nestjs/config';

// Browser clients are cross-origin in every environment (the SPA is served
// separately from the API), so CORS is always configured explicitly rather
// than left open. Comma-separated origins; defaults to the Vite dev server.
//
// Unlike market-trading, these responses set a cookie, so the origin list has
// to stay exact: a wildcard origin is rejected outright once credentials are
// allowed (docs/api/auth-v1.md §9).
const DEFAULT_CORS_ORIGINS = 'http://localhost:5173';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.IDENTITY_AUTH_PORT ?? '3002', 10),
  corsOrigins: (process.env.IDENTITY_AUTH_CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));

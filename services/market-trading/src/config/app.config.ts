import { registerAs } from '@nestjs/config';

// Browser clients are cross-origin in every environment (the SPA is served
// separately from the API), so CORS is always configured explicitly rather
// than left open. Comma-separated origins; defaults to the Vite dev server.
const DEFAULT_CORS_ORIGINS = 'http://localhost:5173';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.MARKET_TRADING_PORT ?? '3001', 10),
  corsOrigins: (process.env.MARKET_TRADING_CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}));

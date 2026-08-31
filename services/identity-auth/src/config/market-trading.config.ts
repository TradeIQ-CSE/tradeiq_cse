import { registerAs } from '@nestjs/config';

export default registerAs('marketTrading', () => ({
  // Base URL of the market-trading service. identity-auth reaches market data
  // only over REST (SRS 3.6.2); it never connects to the market_data database.
  baseUrl: process.env.MARKET_TRADING_URL ?? 'http://localhost:3001',
  // A paper order blocks on this call, so the timeout has to be short enough
  // that a stalled dependency surfaces as 503 DEPENDENCY_UNAVAILABLE rather
  // than hanging the request.
  // Number(), not parseInt(): env.validation coerces this the same way, and
  // parseInt('1e3') is 1 where Number('1e3') is 1000 — the two would disagree
  // on a value validation had already accepted, silently yielding a 1ms
  // timeout that fails every order.
  timeoutMs: Number(process.env.MARKET_TRADING_TIMEOUT_MS ?? 3000),
}));

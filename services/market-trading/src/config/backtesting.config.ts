import { registerAs } from '@nestjs/config';

export const DEFAULT_BACKTEST_MAX_DATE = '2025-12-31';

export function isBacktestPolicyDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '2017-01-01'
  )
    return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export function backtestLimitMessage(maxDate: string): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(maxDate));
  return `Backtesting is available through ${date}. Choose an earlier date.`;
}

export default registerAs('backtesting', () => ({
  maxDate: process.env.BACKTEST_MAX_DATE ?? DEFAULT_BACKTEST_MAX_DATE,
}));

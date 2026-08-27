import { EntityManager } from 'typeorm';
import { ValidationFailedException } from './errors/api-exception';

interface PriceDateRangeRow {
  from: Date | string | null;
  to: Date | string | null;
}

interface SettledDateRow {
  trade_date: Date | string | null;
}

export interface ResolvedMarketDate {
  asOf: string | null;
  availableFrom: string | null;
  availableTo: string | null;
}

// The API contract fixes dates at YYYY-MM-DD. node-postgres returns `date`
// columns as Date objects, so format them without applying a UTC conversion
// that could move the calendar day in some time zones.
export function toIsoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

// Resolve one comparable EOD session for every row in an endpoint response.
// Explicit weekends and holidays settle to the latest session on or before
// the requested date. Empty databases have no effective session.
export async function resolveMarketDate(
  manager: EntityManager,
  requested?: string,
): Promise<ResolvedMarketDate> {
  const rangeRows: PriceDateRangeRow[] = await manager.query(
    `SELECT MIN(trade_date) AS from, MAX(trade_date) AS to
     FROM market_data.daily_prices`,
  );
  const availableFrom = toIsoDate(rangeRows[0]?.from ?? null);
  const availableTo = toIsoDate(rangeRows[0]?.to ?? null);

  if (availableFrom === null || availableTo === null) {
    return { asOf: null, availableFrom, availableTo };
  }

  if (requested === undefined) {
    return { asOf: availableTo, availableFrom, availableTo };
  }

  if (requested < availableFrom || requested > availableTo) {
    throw new ValidationFailedException([
      {
        field: 'as_of',
        reason: `must fall between ${availableFrom} and ${availableTo}`,
      },
    ]);
  }

  const settledRows: SettledDateRow[] = await manager.query(
    `SELECT MAX(trade_date) AS trade_date
     FROM market_data.daily_prices
     WHERE trade_date <= $1::date`,
    [requested],
  );

  return {
    asOf: toIsoDate(settledRows[0]?.trade_date ?? null),
    availableFrom,
    availableTo,
  };
}

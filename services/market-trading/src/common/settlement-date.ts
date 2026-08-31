import { EntityManager } from 'typeorm';
import { toIsoDate } from './market-date';

// docs/api/paper-trading-v1.md §2.2 — settlement is the second market day
// after the fill date (T+2).
const SETTLEMENT_MARKET_DAYS = 2;

// How far past the fill date to look for closures. T+2 needs at most a handful
// of calendar days; this bound keeps the scan from reading the whole calendar
// while leaving room for a long holiday run.
const LOOKAHEAD_DAYS = 30;

interface ClosedDayRow {
  trade_date: Date | string;
}

const SATURDAY = 6;
const SUNDAY = 0;

// The cursor below is a synthetic calendar date, not a value read from the
// database, so it is built and stepped entirely in UTC. Walking it in local
// time would make the result depend on the machine's zone: new Date(y, m, d)
// followed by getDay() lands on the previous weekday in any zone west of UTC
// and settles a day early. UTC has no such offset and no DST, so this produces
// the same answer everywhere. (Dates read from pg are a different case and
// keep using toIsoDate's local getters — see market-date.ts.)
function fromIsoDateUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Resolve the T+2 settlement date for a fill.
//
// market_data.trading_calendar only ever gains a row for a date that already
// has prices (pipeline/data-ingestion/src/data_ingestion/seed.py inserts one
// row per date in the OHLCV data, all is_trading_day = true). It therefore
// holds nothing after the latest completed session and cannot simply be walked
// forward. Step over calendar days instead, skipping weekends and any date the
// calendar explicitly flags as closed.
//
// This is weekday-based with a holiday override: once real non-trading rows are
// loaded the helper is already correct with no code change, but until then a
// settlement date that lands on an unrecorded CSE holiday is reported a day
// early. Settlement is retained "for audit and display, not deferred
// accounting" (§2.2) — no cash or lot movement depends on it.
export async function resolveSettlementDate(
  manager: EntityManager,
  fillDate: string,
): Promise<string> {
  const closedRows: ClosedDayRow[] = await manager.query(
    `SELECT trade_date FROM market_data.trading_calendar
     WHERE is_trading_day = false
       AND trade_date > $1::date
       AND trade_date <= $1::date + $2::int`,
    [fillDate, LOOKAHEAD_DAYS],
  );
  const closed = new Set(closedRows.map((row) => toIsoDate(row.trade_date)));

  const cursor = fromIsoDateUtc(fillDate);
  let remaining = SETTLEMENT_MARKET_DAYS;
  let settlement = fillDate;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day === SATURDAY || day === SUNDAY) continue;

    const iso = toIsoDateUtc(cursor);
    if (closed.has(iso)) continue;

    settlement = iso;
    remaining -= 1;
  }

  return settlement;
}

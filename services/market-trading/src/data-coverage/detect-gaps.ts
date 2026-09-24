import { MarketClosure } from './known-market-closures';

// A gap is expressed as the first and last missing *weekday*, never a
// weekend day, plus how many weekday sessions it spans. `market_closed` gaps
// carry the curated closure's label; `missing_data` gaps do not, since there
// is nothing curated to name.
export type DataGap =
  | { from: string; to: string; sessions: number; kind: 'missing_data' }
  | {
      from: string;
      to: string;
      sessions: number;
      kind: 'market_closed';
      label: string;
    };

const DAY_MS = 24 * 60 * 60 * 1000;

// All date math here runs on UTC-anchored timestamps built from the parsed
// y/m/d components, never on a Date parsed from the ISO string directly (that
// would apply the runtime's local time zone to a midnight-only value and can
// shift the calendar day).
function toUtcTimestamp(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekday(timestamp: number): boolean {
  const day = new Date(timestamp).getUTCDay();
  return day !== 0 && day !== 6;
}

function overlappingClosure(
  from: string,
  to: string,
  closures: readonly MarketClosure[],
): MarketClosure | undefined {
  return closures.find((closure) => closure.from <= to && closure.to >= from);
}

// Pure: walks the sorted distinct dates and counts the weekdays strictly
// between each consecutive pair. A gap is emitted only once that count
// reaches `minWeekdays`, so short holiday runs (at most three consecutive
// weekdays on the CSE calendar) and weekend-only stretches are never gaps.
// Because gaps are only ever found *between* two present dates, there is
// never a leading or trailing gap.
export function detectGaps(
  presentDates: readonly string[],
  closures: readonly MarketClosure[] = [],
  minWeekdays = 4,
): DataGap[] {
  const distinctSorted = Array.from(new Set(presentDates)).sort();
  const gaps: DataGap[] = [];

  for (let i = 1; i < distinctSorted.length; i += 1) {
    const previous = toUtcTimestamp(distinctSorted[i - 1]);
    const next = toUtcTimestamp(distinctSorted[i]);

    const missingWeekdays: number[] = [];
    for (let ts = previous + DAY_MS; ts < next; ts += DAY_MS) {
      if (isWeekday(ts)) missingWeekdays.push(ts);
    }

    if (missingWeekdays.length < minWeekdays) continue;

    const from = toIsoDate(missingWeekdays[0]);
    const to = toIsoDate(missingWeekdays[missingWeekdays.length - 1]);
    const closure = overlappingClosure(from, to, closures);

    gaps.push(
      closure
        ? {
            from,
            to,
            sessions: missingWeekdays.length,
            kind: 'market_closed',
            label: closure.label,
          }
        : { from, to, sessions: missingWeekdays.length, kind: 'missing_data' },
    );
  }

  return gaps;
}

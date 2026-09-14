import type { IndexChartPoint } from "../../components/charts/IndexLineChart";
import { IndexValue, OhlcvTimeframe } from "./types";

export type { IndexChartPoint };

function asUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `day`, as a date key for bucketing. */
function weekKey(day: string): string {
  const date = asUtcDate(day);
  const isoDayOfWeek = (date.getUTCDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
  date.setUTCDate(date.getUTCDate() - isoDayOfWeek);
  return toIsoDate(date);
}

function monthKey(day: string): string {
  return day.slice(0, 7); // "YYYY-MM"
}

/**
 * Indices only ever expose a daily close series (§10) — there's no
 * weekly/monthly aggregate endpoint like securities have. Weekly/monthly
 * views are built here from the real daily closes: each bucket's value is
 * the last actual close in it, never an invented average or carried-forward
 * value, and `periodEnd` is the last date real data existed for that bucket
 * (which can fall short of a calendar week/month at either edge of the
 * series, or around a gap).
 */
export function resampleIndexValues(
  values: readonly IndexValue[],
  timeframe: OhlcvTimeframe,
): IndexChartPoint[] {
  if (timeframe === "daily") {
    return values.map((value) => ({ date: value.date, close: value.close }));
  }

  const keyOf = timeframe === "weekly" ? weekKey : monthKey;
  const buckets = new Map<string, { start: string; end: string; close: number }>();

  for (const value of values) {
    const key = keyOf(value.date);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { start: value.date, end: value.date, close: value.close });
      continue;
    }
    // Values arrive ascending by date, so the latest one seen per bucket is
    // always the bucket's real last close.
    existing.end = value.date;
    existing.close = value.close;
  }

  return [...buckets.values()].map((bucket) => ({
    date: bucket.start,
    periodEnd: bucket.end,
    close: bucket.close,
  }));
}

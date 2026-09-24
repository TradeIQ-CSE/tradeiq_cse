// Pure helpers for the data-gap plan (docs/plans/data-gap-handling.md §3).
// Framework-agnostic on purpose: charts (components/charts) and pages
// (features/markets) both consume these, and neither should have to reach
// into the other to draw a grey band or skip a missing-data date.

/** Mirrors the backend's DataGap (services/market-trading/src/data-coverage). */
export type DataGapKind = 'missing_data' | 'market_closed';

export interface DataGap {
  /** First missing weekday, inclusive. */
  from: string;
  /** Last missing weekday, inclusive. */
  to: string;
  sessions: number;
  kind: DataGapKind;
  /** Only ever present for `market_closed` (the curated closure's label). */
  label?: string;
}

export type GapTimeframe = 'daily' | 'weekly' | 'monthly';

const DAY_MS = 24 * 60 * 60 * 1000;

// All date math below runs on UTC-anchored timestamps built from the parsed
// y/m/d components, never on a `Date` parsed from the ISO string directly —
// that would apply the runtime's local time zone to a midnight-only value
// and can shift the calendar day, exactly as the backend's detect-gaps.ts
// warns against.
function toUtcTimestamp(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
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

/** Every weekday in `[from, to]`, inclusive of both ends. */
function weekdaysInclusive(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let timestamp = toUtcTimestamp(from);
    timestamp <= toUtcTimestamp(to);
    timestamp += DAY_MS
  ) {
    if (isWeekday(timestamp)) days.push(toIsoDate(timestamp));
  }
  return days;
}

interface PeriodBounds {
  start: string;
  /** The period's last *weekday* — Sat/Sun never carry data, so this is
   * what a real aggregate bar's own `period_end` would land on too. */
  end: string;
  /** The first day of the following period — always a safe cursor advance. */
  next: string;
}

/** Monday-start bounds of the ISO week containing `day`. */
function weekBounds(day: string): PeriodBounds {
  const timestamp = toUtcTimestamp(day);
  const isoDayOfWeek = (new Date(timestamp).getUTCDay() + 6) % 7; // 0 = Monday
  const start = timestamp - isoDayOfWeek * DAY_MS;
  return {
    start: toIsoDate(start),
    end: toIsoDate(start + 4 * DAY_MS), // Friday
    next: toIsoDate(start + 7 * DAY_MS),
  };
}

/** 1st-of-month-start bounds of the calendar month containing `day`. */
function monthBounds(day: string): PeriodBounds {
  const [year, month] = day.slice(0, 7).split('-').map(Number);
  const lastCalendarDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let endTimestamp = Date.UTC(year, month - 1, lastCalendarDay);
  while (!isWeekday(endTimestamp)) endTimestamp -= DAY_MS;
  return {
    start: `${day.slice(0, 7)}-01`,
    end: toIsoDate(endTimestamp),
    next: toIsoDate(Date.UTC(year, month, 1)),
  };
}

/**
 * Every week or month lying *entirely* inside `[gapFrom, gapTo]`. A period
 * straddling either edge is left out: some weekday in it falls outside the
 * gap, which per the plan means it kept at least one real session and
 * therefore already has a real bar — no slot is needed (or wanted) for it.
 */
function periodsInside(
  gapFrom: string,
  gapTo: string,
  boundsOf: (day: string) => PeriodBounds,
): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  let cursor = boundsOf(gapFrom).start;
  while (cursor <= gapTo) {
    const { start, end, next } = boundsOf(cursor);
    if (start >= gapFrom && end <= gapTo) periods.push({ start, end });
    cursor = next;
  }
  return periods;
}

function slotDatesFor(
  gap: DataGap,
  timeframe: GapTimeframe,
): { date: string; periodEnd?: string }[] {
  if (timeframe === 'daily') {
    return weekdaysInclusive(gap.from, gap.to).map((date) => ({ date }));
  }
  const boundsOf = timeframe === 'weekly' ? weekBounds : monthBounds;
  return periodsInside(gap.from, gap.to, boundsOf).map((period) => ({
    date: period.start,
    periodEnd: period.end,
  }));
}

/**
 * Gaps overlapping `[from, to]` at all (used by the backtest period picker,
 * PR 3 — kept here now since it is part of the shared gap-helper module the
 * plan asks for in §3).
 */
export function gapsWithin(
  gaps: readonly DataGap[],
  from: string,
  to: string,
): DataGap[] {
  return gaps.filter((gap) => gap.from <= to && gap.to >= from);
}

/** The gap `date` falls inside, if any. */
export function gapContaining(
  gaps: readonly DataGap[],
  date: string,
): DataGap | undefined {
  return gaps.find((gap) => gap.from <= date && date <= gap.to);
}

function yearBefore(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  // One year earlier, then +1 day — same UTC-anchored math as the rest of
  // this module, so a leap-year Feb 29 rolls to Mar 1 like `Date.UTC`
  // already does for every other month-length edge case.
  return toIsoDate(Date.UTC(year - 1, month - 1, date) + DAY_MS);
}

function dayBefore(day: string): string {
  return toIsoDate(toUtcTimestamp(day) - DAY_MS);
}

function latestWeekdayOnOrBefore(day: string): string {
  let timestamp = toUtcTimestamp(day);
  while (!isWeekday(timestamp)) timestamp -= DAY_MS;
  return toIsoDate(timestamp);
}

export interface DefaultRange {
  start: string;
  end: string;
}

/**
 * The security/index detail pages' default chart window: the trailing year
 * `[to − 1y + 1d, to]`, pulled back to skip a `missing_data` gap it would
 * otherwise open on (decided post-plan — see SecurityDetailPage/
 * IndexDetailPage). `market_closed` gaps never trigger a pull-back: those
 * dates simply have no bars, same as a weekend.
 *
 * When the naive window overlaps one or more `missing_data` gaps, the
 * latest-ending one wins: `end` moves to the last weekday before that gap
 * (stepping back over a weekend when the gap starts on a Monday), and
 * `start` is recomputed as that new `end`'s trailing year. This repeats —
 * a newly shortened window can still reach an earlier gap — until the
 * window is clean. If a pull-back ever pushes `start` earlier than `from`
 * (the data's first date), `start` clamps to `from` and the search stops
 * there, whether or not a gap is still inside the clamped window.
 *
 * Callers use `end === to` to tell "untouched" apart from "pulled back":
 * that never changes without a dodge, even when the naive window itself
 * needed clamping (e.g. less than a year of history and no gap at all).
 */
export function defaultRangeAvoidingGaps(
  to: string,
  from: string,
  gaps: readonly DataGap[],
): DefaultRange {
  const missingDataGaps = gaps.filter((gap) => gap.kind === 'missing_data');
  let end = to;
  for (;;) {
    const start = yearBefore(end);
    if (start < from) return { start: from, end };

    const overlapping = gapsWithin(missingDataGaps, start, end);
    if (overlapping.length === 0) return { start, end };

    // The latest-ending gap is the one nearest `end` — dodging it first is
    // what lets the next iteration discover an earlier gap, rather than
    // jumping past every gap in the window at once.
    const latest = overlapping.reduce((a, b) => (b.to > a.to ? b : a));
    end = latestWeekdayOnOrBefore(dayBefore(latest.from));
  }
}

/**
 * Inserts placeholder points into a chart series wherever a gap sits
 * entirely between two real points. Daily gets one slot per missing weekday;
 * weekly/monthly get one slot per week/month lying entirely inside the gap
 * (a period that kept any real session keeps its real bar instead — see
 * `periodsInside`).
 *
 * A gap is skipped outright unless it falls strictly between this series'
 * own first and last point: a series covering a narrower range than the
 * gap (or not reaching it at all) must never grow a slot before its first
 * bar or after its last one.
 *
 * `makeSlot` builds the placeholder in the caller's own point shape (a
 * `ChartDatum` with every price field null, an `IndexChartPoint` with a null
 * close, ...) — this function only decides *which* dates need one.
 */
export function withGapSlots<T extends { date: string }>(
  points: readonly T[],
  gaps: readonly DataGap[],
  timeframe: GapTimeframe,
  makeSlot: (date: string, periodEnd: string | undefined, gap: DataGap) => T,
): T[] {
  if (points.length === 0) return [...points];
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const interior = gaps.filter(
    (gap) => gap.from > firstDate && gap.to < lastDate,
  );
  if (interior.length === 0) return [...points];

  const result: T[] = [];
  for (let index = 0; index < points.length; index += 1) {
    result.push(points[index]);
    const next = points[index + 1];
    if (!next) continue;
    for (const gap of interior) {
      if (gap.from <= points[index].date || gap.to >= next.date) continue;
      for (const slot of slotDatesFor(gap, timeframe)) {
        result.push(makeSlot(slot.date, slot.periodEnd, gap));
      }
    }
  }
  return result;
}

/** One run of consecutive slots belonging to the same gap. */
export interface GapRun {
  startIndex: number;
  endIndex: number;
  /** The date of the first slot in the run — an x1 for a chart band. */
  from: string;
  /** The date of the last slot in the run — an x2 for a chart band. */
  to: string;
  gap: DataGap;
}

/**
 * Groups a slotted series' consecutive gap slots into runs, for drawing one
 * band per gap rather than one per slot.
 */
export function gapRuns<T extends { date: string; gap?: DataGap }>(
  points: readonly T[],
): GapRun[] {
  const runs: GapRun[] = [];
  let current: GapRun | null = null;

  points.forEach((point, index) => {
    if (point.gap) {
      if (
        current &&
        current.gap.from === point.gap.from &&
        current.gap.to === point.gap.to
      ) {
        current.endIndex = index;
        current.to = point.date;
      } else {
        if (current) runs.push(current);
        current = {
          startIndex: index,
          endIndex: index,
          from: point.date,
          to: point.date,
          gap: point.gap,
        };
      }
    } else if (current) {
      runs.push(current);
      current = null;
    }
  });
  if (current) runs.push(current);

  return runs;
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** A single boundary date, always with its year — used for the sr-only rows
 * and any other place a gap's edge needs to stand alone. */
export function formatGapBoundary(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate(day));
}

/**
 * A compact "from – to" range for the chart band/tooltip: the year is
 * dropped from `from` when both ends fall in the same year, matching how
 * `chartDateLabel` (candlestick.ts) already shortens a period's start.
 */
export function formatGapDateRange(gap: DataGap, locale: string): string {
  const from = utcDate(gap.from);
  const to = utcDate(gap.to);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const withYear = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const withoutYear = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const fromLabel = sameYear ? withoutYear.format(from) : withYear.format(from);
  return `${fromLabel} – ${withYear.format(to)}`;
}

export interface GapKindLabels {
  missingData: string;
  marketClosed: string;
}

/** "No data · 1 Jan – 12 Jun 2026" / "Market closed · 23 Mar – 8 May 2020". */
export function formatGapLabel(
  gap: DataGap,
  locale: string,
  kindLabels: GapKindLabels,
): string {
  const kind =
    gap.kind === 'market_closed' ? kindLabels.marketClosed : kindLabels.missingData;
  return `${kind} · ${formatGapDateRange(gap, locale)}`;
}

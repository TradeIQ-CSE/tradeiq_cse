import {
  DataGap,
  DefaultRange,
  defaultRangeAvoidingGaps,
  firstSessionAfterGap,
  formatGapBoundary,
} from '../../lib/data-gaps';
import { CoverageWindow } from './useDataCoverage';

export type OverviewView = 'recent' | 'fullYear';

export interface OverviewWindows {
  /** The latest full year with no `missing_data` gap in it. */
  fullYear: DefaultRange;
  /** From the first session after the latest gap to the latest session. */
  recent: DefaultRange;
  /** The gap the two windows sit either side of. */
  gap: DataGap;
  /** Which window opens first — see `MIN_RECENT_WEEKDAYS`. */
  defaultView: OverviewView;
}

// About three months of sessions. Below this the post-gap run is too short
// to read as a trend, so the overview opens on the full year and offers the
// recent run as the second option; once the run grows past it (or the gap is
// filled and this returns null) the overview follows the data by itself.
const MIN_RECENT_WEEKDAYS = 60;

function weekdaysBetween(from: string, to: string): number {
  let count = 0;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= end; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

/**
 * The Markets overview's two chart windows when the trailing year crosses a
 * `missing_data` gap, or null when it doesn't — the charts then use the API's
 * own trailing year, gap bands and all, exactly like before. Nothing here is
 * hardcoded: both windows come from `/coverage`, so a filled gap removes the
 * split on the next coverage refresh.
 */
export function overviewWindows(
  coverage: CoverageWindow | undefined,
): OverviewWindows | null {
  if (!coverage?.from || !coverage.to) return null;
  const { from, to, gaps } = coverage;

  const fullYear = defaultRangeAvoidingGaps(to, from, gaps);
  if (fullYear.end === to) return null;

  const gap = gaps
    .filter((entry) => entry.kind === 'missing_data' && entry.to < to)
    .reduce<DataGap | null>((latest, entry) => (!latest || entry.to > latest.to ? entry : latest), null);
  if (!gap) return null;

  const recent = { start: firstSessionAfterGap(gap), end: to };
  return {
    fullYear,
    recent,
    gap,
    defaultView:
      weekdaysBetween(recent.start, recent.end) >= MIN_RECENT_WEEKDAYS
        ? 'recent'
        : 'fullYear',
  };
}

/**
 * "2025" when the window is that whole calendar year, otherwise
 * "Mar 3, 2025 – Mar 2, 2026". A window counts as the whole year when it
 * starts on Jan 1 and reaches the year's last weekday (Dec 29–31: the window
 * ends on a session, so a weekend Dec 31 pulls it back to the Friday).
 */
export function windowLabel(window: DefaultRange, locale: string): string {
  const year = window.start.slice(0, 4);
  const wholeYear =
    window.start === `${year}-01-01` &&
    window.end >= `${year}-12-29` &&
    window.end <= `${year}-12-31`;
  if (wholeYear) return year;
  return `${formatGapBoundary(window.start, locale)} – ${formatGapBoundary(window.end, locale)}`;
}

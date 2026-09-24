import { describe, expect, it } from 'vitest';
import {
  DataGap,
  backtestDateGap,
  crossingDataGaps,
  dateInGapMessage,
  defaultRangeAvoidingGaps,
  firstSessionAfterGap,
  formatGapBoundary,
  formatGapDateRange,
  formatGapLabel,
  formatGapProseRange,
  gapContaining,
  gapRuns,
  gapsWithin,
  isBacktestDateUnavailable,
  lastSessionBeforeGap,
  snapOutOfDataGap,
  withGapSlots,
} from './data-gaps';

const missingData2026: DataGap = {
  from: '2026-01-01',
  to: '2026-06-12',
  sessions: 117,
  kind: 'missing_data',
};

const covidClosure: DataGap = {
  from: '2020-03-23',
  to: '2020-05-08',
  sessions: 33,
  kind: 'market_closed',
  label: 'CSE closed (COVID-19)',
};

interface Point {
  date: string;
  periodEnd?: string;
  close: number | null;
  gap?: DataGap;
}

function point(date: string, close: number): Point {
  return { date, close };
}

function makeSlot(date: string, periodEnd: string | undefined, gap: DataGap): Point {
  return { date, periodEnd, close: null, gap };
}

describe('gapsWithin', () => {
  it('returns gaps that overlap the range at all', () => {
    expect(gapsWithin([missingData2026], '2025-12-01', '2026-01-15')).toEqual([
      missingData2026,
    ]);
    expect(gapsWithin([missingData2026], '2026-07-01', '2026-08-01')).toEqual([]);
  });

  it('includes a gap the range sits entirely inside', () => {
    expect(gapsWithin([missingData2026], '2026-03-01', '2026-03-02')).toEqual([
      missingData2026,
    ]);
  });
});

describe('gapContaining', () => {
  it('finds the gap a date falls in', () => {
    expect(gapContaining([missingData2026, covidClosure], '2026-03-15')).toEqual(
      missingData2026,
    );
    expect(gapContaining([missingData2026, covidClosure], '2020-04-01')).toEqual(
      covidClosure,
    );
  });

  it('returns undefined for a date outside every gap', () => {
    expect(gapContaining([missingData2026], '2025-06-01')).toBeUndefined();
  });
});

describe('withGapSlots — daily', () => {
  it('inserts one slot per weekday strictly inside a gap between two real points', () => {
    const points = [point('2025-12-31', 100), point('2026-06-15', 105)];
    const slotted = withGapSlots(points, [missingData2026], 'daily', makeSlot);

    expect(slotted[0]).toEqual(points[0]);
    expect(slotted[slotted.length - 1]).toEqual(points[1]);
    const slots = slotted.filter((p) => p.gap);
    expect(slots).toHaveLength(117);
    expect(slots[0].date).toBe('2026-01-01');
    expect(slots[slots.length - 1].date).toBe('2026-06-12');
    // Every slot carries null price fields and the gap it belongs to.
    expect(slots.every((slot) => slot.close === null)).toBe(true);
    expect(slots.every((slot) => slot.gap === missingData2026)).toBe(true);
  });

  it('skips weekends: no slot lands on a Saturday or Sunday', () => {
    const points = [point('2025-12-31', 100), point('2026-06-15', 105)];
    const slotted = withGapSlots(points, [missingData2026], 'daily', makeSlot);
    const weekendSlot = slotted
      .filter((p) => p.gap)
      .find((slot) => {
        const day = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
        return day === 0 || day === 6;
      });
    expect(weekendSlot).toBeUndefined();
  });

  it('never pads a gap before the first point or after the last', () => {
    // The series starts inside the gap: 2026-01-01..2026-06-12 is only
    // partially covered (from 2026-03-01 onward), so nothing should be
    // padded before this series' own first point.
    const points = [point('2026-03-01', 100), point('2026-07-01', 105)];
    const slotted = withGapSlots(points, [missingData2026], 'daily', makeSlot);
    expect(slotted).toEqual(points);
  });

  it('ignores a gap the series never reaches', () => {
    const points = [point('2025-01-02', 100), point('2025-01-03', 101)];
    const slotted = withGapSlots(points, [missingData2026], 'daily', makeSlot);
    expect(slotted).toEqual(points);
  });

  it('returns the input unchanged for an empty gap list', () => {
    const points = [point('2025-01-02', 100), point('2025-01-03', 101)];
    expect(withGapSlots(points, [], 'daily', makeSlot)).toEqual(points);
  });
});

describe('withGapSlots — weekly', () => {
  it('inserts one slot per ISO week lying entirely inside the gap', () => {
    // A short gap spanning exactly two full weeks with real bars either
    // side, each real bar already a week-start (Monday) per the app's own
    // weekly resampling convention.
    const shortGap: DataGap = {
      from: '2026-01-05', // Monday
      to: '2026-01-18', // Sunday, two weeks later
      sessions: 10,
      kind: 'missing_data',
    };
    const points: Point[] = [
      { date: '2025-12-29', periodEnd: '2026-01-02', close: 100 },
      { date: '2026-01-19', periodEnd: '2026-01-23', close: 108 },
    ];
    const slotted = withGapSlots(points, [shortGap], 'weekly', makeSlot);
    const slots = slotted.filter((p) => p.gap);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.date)).toEqual(['2026-01-05', '2026-01-12']);
    // periodEnd lands on the Friday of each week, not the calendar Sunday:
    // weekends never carry data, so a real weekly bar's period_end would
    // never land there either.
    expect(slots.map((s) => s.periodEnd)).toEqual(['2026-01-09', '2026-01-16']);
  });

  it('does not slot a week the gap only partially covers', () => {
    // The gap starts mid-week (Wednesday), so that week kept a real
    // session on Monday/Tuesday and must already have a real bar — no slot.
    const partialGap: DataGap = {
      from: '2026-01-07', // Wednesday
      to: '2026-01-16', // Friday of the following week
      sessions: 8,
      kind: 'missing_data',
    };
    const points: Point[] = [
      { date: '2026-01-05', periodEnd: '2026-01-06', close: 100 },
      { date: '2026-01-19', periodEnd: '2026-01-23', close: 108 },
    ];
    const slotted = withGapSlots(points, [partialGap], 'weekly', makeSlot);
    const slots = slotted.filter((p) => p.gap);

    // Only the one full week (Mon 2026-01-12..Fri 2026-01-16) inside the gap
    // gets a slot; the straddling first week (containing 01-05/01-06, real
    // data) does not.
    expect(slots).toHaveLength(1);
    expect(slots[0].date).toBe('2026-01-12');
    expect(slots[0].periodEnd).toBe('2026-01-16');
  });
});

describe('withGapSlots — monthly', () => {
  it('inserts one slot per calendar month lying entirely inside the gap', () => {
    const points: Point[] = [
      { date: '2025-12-01', periodEnd: '2025-12-31', close: 100 },
      { date: '2026-07-01', periodEnd: '2026-07-31', close: 110 },
    ];
    const slotted = withGapSlots(
      points,
      [missingData2026],
      'monthly',
      makeSlot,
    );
    const slots = slotted.filter((p) => p.gap);

    // Jan..Jun 2026 are each entirely inside 2026-01-01..2026-06-12? June is
    // only partially inside (gap ends 06-12), so June is NOT a full month
    // and gets no slot — only Jan..May do.
    expect(slots.map((s) => s.date)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
    // Each end lands on that month's last weekday, e.g. Jan 31 2026 is a
    // Saturday so January's slot ends the 30th, and 2026-02-28 is a Saturday
    // so February's ends the 27th.
    expect(slots.map((s) => s.periodEnd)).toEqual([
      '2026-01-30',
      '2026-02-27',
      '2026-03-31',
      '2026-04-30',
      '2026-05-29',
    ]);
  });
});

describe('gapRuns', () => {
  it('groups consecutive slots from the same gap into one run', () => {
    const points = [
      point('2025-12-31', 100),
      makeSlot('2026-01-01', undefined, missingData2026),
      makeSlot('2026-01-02', undefined, missingData2026),
      point('2026-01-05', 101),
    ];
    const runs = gapRuns(points);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      startIndex: 1,
      endIndex: 2,
      from: '2026-01-01',
      to: '2026-01-02',
      gap: missingData2026,
    });
  });

  it('keeps separate runs for two different gaps', () => {
    const points = [
      makeSlot('2020-03-23', undefined, covidClosure),
      point('2020-05-11', 90),
      makeSlot('2026-01-01', undefined, missingData2026),
    ];
    const runs = gapRuns(points);
    expect(runs).toHaveLength(2);
    expect(runs[0].gap).toBe(covidClosure);
    expect(runs[1].gap).toBe(missingData2026);
  });

  it('returns no runs when there are no slots', () => {
    expect(gapRuns([point('2026-01-01', 100)])).toEqual([]);
  });
});

describe('formatGapBoundary', () => {
  it('always carries the year', () => {
    expect(formatGapBoundary('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });
});

describe('formatGapDateRange', () => {
  it('drops the year from the start when both ends share one', () => {
    expect(formatGapDateRange(missingData2026, 'en-US')).toBe(
      'Jan 1 – Jun 12, 2026',
    );
  });

  it('keeps both years when the gap crosses a year boundary', () => {
    const crossing: DataGap = {
      from: '2025-12-20',
      to: '2026-01-05',
      sessions: 10,
      kind: 'missing_data',
    };
    expect(formatGapDateRange(crossing, 'en-US')).toBe(
      'Dec 20, 2025 – Jan 5, 2026',
    );
  });
});

describe('defaultRangeAvoidingGaps', () => {
  const firstDate = '2017-01-02';

  it('keeps the plain trailing year when no gap overlaps it', () => {
    expect(defaultRangeAvoidingGaps('2026-09-23', firstDate, [])).toEqual({
      start: '2025-09-24',
      end: '2026-09-23',
    });
  });

  it('ignores a market_closed gap entirely', () => {
    const closure: DataGap = {
      from: '2026-06-01',
      to: '2026-06-05',
      sessions: 5,
      kind: 'market_closed',
      label: 'Curated closure',
    };
    expect(defaultRangeAvoidingGaps('2026-09-23', firstDate, [closure])).toEqual({
      start: '2025-09-24',
      end: '2026-09-23',
    });
  });

  it("pulls the window back to the year the gap started, today's real 2026 case", () => {
    const openEndedGap: DataGap = {
      from: '2026-01-01',
      to: '2026-12-31',
      sessions: 300,
      kind: 'missing_data',
    };
    expect(
      defaultRangeAvoidingGaps('2026-09-23', firstDate, [openEndedGap]),
    ).toEqual({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('rolls back over a weekend when the gap starts on a Monday, landing on the preceding Friday', () => {
    const gap: DataGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data',
    };
    expect(defaultRangeAvoidingGaps('2026-06-20', firstDate, [gap])).toEqual({
      start: '2025-06-06',
      end: '2026-06-05', // the Friday before the gap's Monday start
    });
  });

  it('dodges two gaps in turn, re-checking the shortened window each time', () => {
    const laterGap: DataGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data',
    };
    const earlierGap: DataGap = {
      from: '2025-08-01', // Friday
      to: '2025-08-05',
      sessions: 5,
      kind: 'missing_data',
    };
    expect(
      defaultRangeAvoidingGaps('2026-06-20', firstDate, [
        laterGap,
        earlierGap,
      ]),
    ).toEqual({ start: '2024-08-01', end: '2025-07-31' });
  });

  it('clamps start to the data\'s first date once a pull-back would go earlier', () => {
    const almostWholeYear: DataGap = {
      from: '2025-02-01',
      to: '2026-09-01',
      sessions: 400,
      kind: 'missing_data',
    };
    expect(
      defaultRangeAvoidingGaps('2026-09-23', '2025-01-01', [
        almostWholeYear,
      ]),
    ).toEqual({ start: '2025-01-01', end: '2025-01-31' });
  });
});

describe('formatGapLabel', () => {
  const labels = { missingData: 'Data gap', marketClosed: 'Market closed' };

  it('prefixes a missing_data gap with "Data gap"', () => {
    expect(formatGapLabel(missingData2026, 'en-US', labels)).toBe(
      'Data gap · Jan 1 – Jun 12, 2026',
    );
  });

  it('prefixes a market_closed gap with "Market closed"', () => {
    expect(formatGapLabel(covidClosure, 'en-US', labels)).toBe(
      'Market closed · Mar 23 – May 8, 2020',
    );
  });
});

describe('formatGapProseRange', () => {
  it('drops the shared year and joins with "to" instead of an en dash', () => {
    expect(formatGapProseRange(missingData2026, 'en-US')).toBe('Jan 1 to Jun 12, 2026');
  });

  it('keeps both years when the gap crosses a year boundary', () => {
    const crossing: DataGap = {
      from: '2025-12-20',
      to: '2026-01-05',
      sessions: 10,
      kind: 'missing_data',
    };
    expect(formatGapProseRange(crossing, 'en-US')).toBe('Dec 20, 2025 to Jan 5, 2026');
  });
});

describe('backtestDateGap', () => {
  it('catches a weekday sitting directly inside a missing_data gap', () => {
    expect(backtestDateGap([missingData2026], '2026-03-15', 'start')).toEqual(
      missingData2026,
    );
    expect(backtestDateGap([missingData2026], '2026-03-15', 'end')).toEqual(
      missingData2026,
    );
  });

  it('rolls a weekend start forward before checking, matching the API', () => {
    // 2025-12-31 is a Wednesday, the gap starts 2026-01-01 (Thursday); the
    // weekend directly before it (Jan 3-4, both inside the gap already) is
    // an uninteresting case — use the weekend immediately preceding a gap
    // that starts on a Monday instead.
    const mondayGap: DataGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data',
    };
    // Saturday 2026-06-06 rolls forward to Monday 2026-06-08, the gap's
    // first day, so a start there is blocked exactly like the API blocks it.
    expect(backtestDateGap([mondayGap], '2026-06-06', 'start')).toEqual(mondayGap);
    // The same Saturday rolls backward to Friday 2026-06-05, which is clear.
    expect(backtestDateGap([mondayGap], '2026-06-06', 'end')).toBeUndefined();
  });

  it('rolls a weekend end backward before checking, matching the API', () => {
    // The gap ends Friday 2026-06-12; the following weekend rolls back onto
    // that Friday, so an end there is blocked, but a start there rolls
    // forward clear of the gap onto Monday 2026-06-15.
    expect(backtestDateGap([missingData2026], '2026-06-13', 'end')).toEqual(
      missingData2026,
    );
    expect(backtestDateGap([missingData2026], '2026-06-13', 'start')).toBeUndefined();
  });

  it('never blocks on a market_closed gap', () => {
    expect(backtestDateGap([covidClosure], '2020-04-01', 'start')).toBeUndefined();
  });
});

describe('isBacktestDateUnavailable', () => {
  it('is unavailable for any weekday inside a missing_data gap', () => {
    expect(isBacktestDateUnavailable([missingData2026], '2026-03-15')).toBe(true);
  });

  // The gap runs 2026-01-01 (Thu) to 2026-06-12 (Fri). Sat 06-13/Sun 06-14
  // sit right after it — neither date is *itself* in the gap, so the
  // calendar leaves them clickable even though rolling them backward (the
  // END role) would land back on the gap's last day. A user who picks one
  // as an END still gets caught, just by the role-aware `backtestDateGap`
  // check in `validateBacktestConfig`, not by the calendar refusing the
  // click outright (see PeriodStep.test.tsx).
  it('leaves the weekend immediately after a gap selectable — the calendar defers the role check', () => {
    expect(isBacktestDateUnavailable([missingData2026], '2026-06-13')).toBe(false);
    expect(isBacktestDateUnavailable([missingData2026], '2026-06-14')).toBe(false);
  });

  it('leaves the weekend immediately before a gap that starts on a Monday selectable too', () => {
    const mondayGap: DataGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data',
    };
    // Sat 06-06 / Sun 06-07 roll forward into the gap for a START, but
    // neither date is itself inside it, so the calendar still allows them.
    expect(isBacktestDateUnavailable([mondayGap], '2026-06-06')).toBe(false);
    expect(isBacktestDateUnavailable([mondayGap], '2026-06-07')).toBe(false);
  });

  it('is unavailable for a weekend that falls strictly inside a gap', () => {
    // Sat 2026-01-03 / Sun 2026-01-04 sit inside the 2026-01-01..06-12 gap
    // itself, not just adjacent to it.
    expect(isBacktestDateUnavailable([missingData2026], '2026-01-03')).toBe(true);
    expect(isBacktestDateUnavailable([missingData2026], '2026-01-04')).toBe(true);
  });

  it('leaves an ordinary weekday and an unrelated weekend available', () => {
    expect(isBacktestDateUnavailable([missingData2026], '2025-06-01')).toBe(false);
    expect(isBacktestDateUnavailable([missingData2026], '2025-06-07')).toBe(false);
  });

  it('never restricts a market_closed date', () => {
    expect(isBacktestDateUnavailable([covidClosure], '2020-04-01')).toBe(false);
  });
});

describe('firstSessionAfterGap / lastSessionBeforeGap', () => {
  it('names the first weekday after the gap, rolling over a weekend', () => {
    // The 2026 gap ends on a Friday, so the very next day already works.
    expect(firstSessionAfterGap(missingData2026)).toBe('2026-06-15');
  });

  it('rolls a Saturday-after-gap forward to the following Monday', () => {
    const fridayEndingBeforeWeekend: DataGap = {
      from: '2026-06-01',
      to: '2026-06-05', // Friday
      sessions: 5,
      kind: 'missing_data',
    };
    expect(firstSessionAfterGap(fridayEndingBeforeWeekend)).toBe('2026-06-08');
  });

  it('names the last weekday before the gap, rolling back over a weekend', () => {
    const mondayGap: DataGap = {
      from: '2026-06-08', // Monday
      to: '2026-06-12',
      sessions: 5,
      kind: 'missing_data',
    };
    expect(lastSessionBeforeGap(mondayGap)).toBe('2026-06-05'); // the preceding Friday
  });
});

describe('snapOutOfDataGap', () => {
  it('moves a start inside the gap to the first session after it', () => {
    expect(snapOutOfDataGap([missingData2026], '2026-03-15', 'start')).toBe('2026-06-15');
  });

  it('moves an end inside the gap to the last session before it', () => {
    expect(snapOutOfDataGap([missingData2026], '2026-03-15', 'end')).toBe('2025-12-31');
  });

  it('leaves a date untouched when it is not in a gap', () => {
    expect(snapOutOfDataGap([missingData2026], '2025-06-01', 'start')).toBe('2025-06-01');
  });
});

describe('crossingDataGaps', () => {
  it('finds a missing_data gap strictly between two cleared endpoints', () => {
    expect(crossingDataGaps([missingData2026], '2025-06-01', '2026-08-01')).toEqual([
      missingData2026,
    ]);
  });

  it('ignores a market_closed gap', () => {
    expect(crossingDataGaps([covidClosure], '2020-01-01', '2020-12-31')).toEqual([]);
  });

  it('returns nothing for a range that never reaches a gap', () => {
    expect(crossingDataGaps([missingData2026], '2024-01-01', '2024-12-31')).toEqual([]);
  });

  it('includes a market_closed gap when explicitly asked for it via kinds', () => {
    expect(
      crossingDataGaps([covidClosure], '2020-01-01', '2020-12-31', [
        'missing_data',
        'market_closed',
      ]),
    ).toEqual([covidClosure]);
  });

  it('still ignores missing_data when kinds asks for market_closed only', () => {
    expect(
      crossingDataGaps([missingData2026], '2025-06-01', '2026-08-01', ['market_closed']),
    ).toEqual([]);
  });
});

describe('dateInGapMessage', () => {
  it('matches the API\'s own DATE_IN_DATA_GAP message text', () => {
    expect(dateInGapMessage(missingData2026)).toBe(
      'No market data from 2026-01-01 to 2026-06-12. Choose a date outside this period.',
    );
  });
});

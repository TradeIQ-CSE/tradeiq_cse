import { detectGaps } from './detect-gaps';
import { KNOWN_MARKET_CLOSURES } from './known-market-closures';

// Every trading day from 2025-12-01 to 2025-12-31, skipping weekends — used
// as a base sequence that the holiday-run tests punch short gaps out of.
function weekdaysBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  for (
    let ts = Date.UTC(fy, fm - 1, fd);
    ts <= Date.UTC(ty, tm - 1, td);
    ts += 24 * 60 * 60 * 1000
  ) {
    const day = new Date(ts).getUTCDay();
    if (day !== 0 && day !== 6) {
      const date = new Date(ts);
      const y = date.getUTCFullYear();
      const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
      const d = `${date.getUTCDate()}`.padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
  }
  return dates;
}

describe('detectGaps', () => {
  it('returns no gaps for an empty or single-date input', () => {
    expect(detectGaps([])).toEqual([]);
    expect(detectGaps(['2025-01-02'])).toEqual([]);
  });

  it('ignores an ordinary weekend (two missing calendar days, zero weekdays)', () => {
    // Friday to Monday: nothing strictly between them is a weekday.
    expect(detectGaps(['2025-01-03', '2025-01-06'])).toEqual([]);
  });

  it.each([1, 2, 3])('ignores a %i-weekday holiday run', (weekdayCount) => {
    // Start on a Monday so the run of missing weekdays never itself lands
    // on a weekend.
    const start = new Date(Date.UTC(2025, 0, 6)); // Monday 2025-01-06
    const missingStart = new Date(start);
    missingStart.setUTCDate(missingStart.getUTCDate() + 1);
    const missingEnd = new Date(missingStart);
    missingEnd.setUTCDate(missingEnd.getUTCDate() + weekdayCount - 1);
    const after = new Date(missingEnd);
    after.setUTCDate(after.getUTCDate() + 1);

    const iso = (d: Date) =>
      `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, '0')}-${`${d.getUTCDate()}`.padStart(2, '0')}`;

    expect(detectGaps([iso(start), iso(after)])).toEqual([]);
  });

  it('emits a missing_data gap once the run reaches minWeekdays', () => {
    // Mon 2025-01-06 .. Mon 2025-01-13: Tue-Fri (7-10 Jan) is 4 missing
    // weekdays, right at the default threshold.
    const gaps = detectGaps(['2025-01-06', '2025-01-13']);
    expect(gaps).toEqual([
      {
        from: '2025-01-07',
        to: '2025-01-10',
        sessions: 4,
        kind: 'missing_data',
      },
    ]);
  });

  it('classifies the 2020 closure as market_closed with its curated label', () => {
    const presentDates = ['2020-03-20', '2020-05-11'];
    const gaps = detectGaps(presentDates, KNOWN_MARKET_CLOSURES);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      kind: 'market_closed',
      label: 'CSE closed (COVID-19)',
    });
    // The gap is the missing *weekdays*, not the closure's own curated
    // bounds — here they happen to coincide with the curated range.
    expect(gaps[0].from).toBe('2020-03-23');
    expect(gaps[0].to).toBe('2020-05-08');
  });

  it('classifies the 2022 closure as market_closed', () => {
    const presentDates = ['2022-04-08', '2022-04-25'];
    const gaps = detectGaps(presentDates, KNOWN_MARKET_CLOSURES);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      kind: 'market_closed',
      label: 'CSE closed: holidays and crisis trading halt',
    });
  });

  it('detects the 2026-style gap as missing_data with 117 sessions', () => {
    const gaps = detectGaps(
      ['2025-12-31', '2026-06-15'],
      KNOWN_MARKET_CLOSURES,
    );

    expect(gaps).toEqual([
      {
        from: '2026-01-01',
        to: '2026-06-12',
        sessions: 117,
        kind: 'missing_data',
      },
    ]);
  });

  it('sorts and de-duplicates unsorted, repeated input before walking it', () => {
    const shuffled = [
      '2025-01-13',
      '2025-01-06',
      '2025-01-06', // duplicate
      '2025-01-13', // duplicate
    ];

    expect(detectGaps(shuffled)).toEqual([
      {
        from: '2025-01-07',
        to: '2025-01-10',
        sessions: 4,
        kind: 'missing_data',
      },
    ]);
  });

  it('only reports gaps strictly between the first and last present date', () => {
    // A long holiday-free run of trading days: no leading/trailing gap can
    // exist because there is nothing before the first or after the last
    // date to compare against.
    const dates = weekdaysBetween('2025-12-01', '2025-12-31');
    expect(detectGaps(dates)).toEqual([]);
  });

  it('respects a custom minWeekdays threshold', () => {
    // The same 4-weekday run that is a gap at the default threshold is not
    // one once the threshold is raised past it.
    expect(detectGaps(['2025-01-06', '2025-01-13'], [], 5)).toEqual([]);
  });
});

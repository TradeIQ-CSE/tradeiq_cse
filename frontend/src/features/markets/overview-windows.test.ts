import { describe, expect, it } from 'vitest';
import { DataGap } from '../../lib/data-gaps';
import { overviewWindows, windowLabel } from './overview-windows';

const gap: DataGap = {
  from: '2026-01-01',
  to: '2026-09-08',
  sessions: 179,
  kind: 'missing_data',
};

describe('overviewWindows', () => {
  it('returns null when the trailing year has no missing_data gap', () => {
    expect(
      overviewWindows({ from: '2017-01-02', to: '2026-09-23', gaps: [] }),
    ).toBeNull();
  });

  it('returns null while coverage is unknown', () => {
    expect(overviewWindows(undefined)).toBeNull();
    expect(overviewWindows({ from: null, to: null, gaps: [] })).toBeNull();
  });

  it('splits either side of the gap and opens on the full year while the recent run is short', () => {
    expect(
      overviewWindows({ from: '2017-01-02', to: '2026-09-23', gaps: [gap] }),
    ).toEqual({
      fullYear: { start: '2025-01-01', end: '2025-12-31' },
      recent: { start: '2026-09-09', end: '2026-09-23' },
      gap,
      defaultView: 'fullYear',
    });
  });

  it('opens on the recent run once it holds about three months of sessions', () => {
    const windows = overviewWindows({
      from: '2017-01-02',
      to: '2026-12-04',
      gaps: [gap],
    });
    expect(windows?.recent).toEqual({ start: '2026-09-09', end: '2026-12-04' });
    expect(windows?.defaultView).toBe('recent');
  });

  it('ignores a market closure', () => {
    expect(
      overviewWindows({
        from: '2017-01-02',
        to: '2026-09-23',
        gaps: [{ ...gap, kind: 'market_closed' }],
      }),
    ).toBeNull();
  });
});

describe('windowLabel', () => {
  it('names a whole calendar year by the year alone', () => {
    expect(windowLabel({ start: '2025-01-01', end: '2025-12-31' }, 'en-LK')).toBe('2025');
    // Dec 31 on a weekend: the window ends on the Friday before.
    expect(windowLabel({ start: '2022-01-01', end: '2022-12-30' }, 'en-LK')).toBe('2022');
  });

  it('shows both dates for a window that starts on Jan 1 but stops early', () => {
    expect(windowLabel({ start: '2025-01-01', end: '2025-01-31' }, 'en-LK')).not.toBe('2025');
    expect(windowLabel({ start: '2025-01-01', end: '2025-01-31' }, 'en-LK')).toContain('–');
  });
});

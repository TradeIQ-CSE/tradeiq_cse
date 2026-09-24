import { DataCoverage } from '../../features/markets/useDataCoverage';
import { DataGap } from '../../lib/data-gaps';

// A default fixture with no gaps: most tests don't care about coverage at
// all, and useDataCoverage must never block a chart, so the default handler
// keeps existing page tests unaffected. Tests that specifically exercise gap
// rendering override this with `server.use(...)`.
export const dataCoverageFixture: DataCoverage = {
  prices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
  indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
};

// The real 2026 price gap from docs/plans/data-gap-handling.md — no market
// data from 1 Jan to 12 Jun 2026 (trading resumes 15 Jun, a Monday). Used by
// backtest-period tests (PR 3): unavailable calendar dates, the crossing
// notice, gap-aware presets/validation and the results equity-curve band.
export const priceGap2026: DataGap = {
  from: '2026-01-01',
  to: '2026-06-12',
  sessions: 117,
  kind: 'missing_data',
};

export const dataCoverageWithGapFixture: DataCoverage = {
  prices: { from: '2017-01-02', to: '2026-09-23', gaps: [priceGap2026] },
  indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
};

// A curated market closure (real trading holiday, not a missing_data gap) —
// the CSE's COVID-19 closure. Used by the equity-curve band tests: a
// market_closed gap gets a band too, but never the missing-sessions caption
// or the period-picker's crossing notice (docs/plans/data-gap-handling.md
// §6) since it's real market history, not something the engine skips.
export const marketClosureCovid: DataGap = {
  from: '2020-03-23',
  to: '2020-05-08',
  sessions: 33,
  kind: 'market_closed',
  label: 'CSE closed (COVID-19)',
};

export const dataCoverageWithClosureFixture: DataCoverage = {
  prices: { from: '2017-01-02', to: '2026-09-23', gaps: [marketClosureCovid] },
  indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
};

export const dataCoverageWithBothGapsFixture: DataCoverage = {
  prices: {
    from: '2017-01-02',
    to: '2026-09-23',
    gaps: [marketClosureCovid, priceGap2026],
  },
  indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
};

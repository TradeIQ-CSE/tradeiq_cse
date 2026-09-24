import { DataCoverage } from '../../features/markets/useDataCoverage';

// A default fixture with no gaps: most tests don't care about coverage at
// all, and useDataCoverage must never block a chart, so the default handler
// keeps existing page tests unaffected. Tests that specifically exercise gap
// rendering override this with `server.use(...)`.
export const dataCoverageFixture: DataCoverage = {
  prices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
  indices: { from: '2017-01-02', to: '2026-09-23', gaps: [] },
};

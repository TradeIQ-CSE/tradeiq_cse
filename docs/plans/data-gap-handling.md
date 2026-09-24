# Data gap handling implementation plan

Saved on 2026-09-24 before implementation. Charts and backtests currently treat
a stretch of missing sessions as if it did not exist: bars are placed by index,
so 31 Dec 2025 and 15 Jun 2026 sit side by side, and a backtest silently starts
on the first bar it finds. This plan makes gaps visible and keeps backtests on
dates the platform actually has.

## Decisions

- **Charts:** option A. The line or candles stop at the last real bar, the
  missing stretch keeps its width on the time axis as a grey band with a label,
  and they resume at the first real bar. No value is ever drawn for a missing
  session: no zeros, no carried-forward prices.
- **Backtests:** start and end dates cannot fall in a missing-data gap (the
  calendar disables them). A range whose two ends have data but which crosses a
  gap is allowed, with a plain notice under the picker before the run. No
  confirmation step.
- **Keep it simple:** no new database tables, no migration, no change to the
  simulation engine's arithmetic.

## What counts as a gap

Measured on production data (2017-01-02 to 2026-09-23), the runs of four or
more weekdays with no rows are:

| Period | Prices | Indices | Cause | Kind |
|---|---|---|---|---|
| 23 Mar – 8 May 2020 | yes | yes | CSE closed (COVID-19) | `market_closed` |
| 11 – 22 Apr 2022 | yes | yes | CSE closed (holidays and crisis halt) | `market_closed` |
| 1 Jan – 12 Jun 2026 | yes | — | Not in the dataset | `missing_data` |
| 1 Jan – 8 Sep 2026 | — | yes | Not in the dataset | `missing_data` |

Two kinds, treated differently:

- **`missing_data`:** trading happened but we do not have it. Detected
  automatically, so a future pipeline outage appears without code changes and a
  back-filled period disappears on its own once CSE data arrives.
- **`market_closed`:** no trading happened. Kept in a short curated list in the
  backend, with its source, because a gap in the data alone cannot tell a
  closure from an outage. Charts label it "Market closed". Backtests are not
  restricted or warned for it: it is part of the real history, like a weekend.

Not gaps (unchanged behaviour, same as yfinance and TradingView):

- **Weekends and holidays:** only runs of four or more weekdays count. Sri
  Lankan holidays never close more than three consecutive weekdays.
- **Days a single security did not trade** (illiquid stocks, suspensions such as
  JKH on 29 Oct – 5 Nov 2024): the market was open and the dataset is complete
  for that day, so it is a no-trade day, not missing data. Gaps are measured
  market-wide, not per security.

Prices and indices are measured separately because their coverage differs
(index values for 2026 begin on 9 Sep, prices on 15 Jun).

## 1. Backend: coverage endpoint (`market-trading`)

New module `src/data-coverage/`.

- `detectGaps(presentDates, closures, minWeekdays = 4)`: a pure function. It
  walks the sorted distinct dates, counts the weekdays strictly between each
  consecutive pair, and emits a gap when that count is at least `minWeekdays`.
  Any gap overlapping a curated closure is emitted as `market_closed` with the
  closure's label; otherwise it is `missing_data`. Gaps are expressed as the
  first and last missing weekday (`from`, `to`) plus `sessions` (weekday count).
- `known-market-closures.ts`: the two curated closures above, each with a
  one-line source note.
- `DataCoverageService.get()`: runs `SELECT DISTINCT trade_date` over
  `market_data.daily_prices` and over `market_data.index_values` (about 2,100
  dates each), calls `detectGaps` for both, and memoises the result. The memo is
  cleared by the EOD and index ingestion services after a successful write, and
  otherwise expires after 10 minutes, so a backfill loaded outside the API (seed
  loader, direct import) also shows up without a restart.
- `GET /api/market/coverage` (public, same envelope as the other market routes):

  ```json
  {
    "data": {
      "prices":  { "from": "2017-01-02", "to": "2026-09-23",
                   "gaps": [{ "from": "2026-01-01", "to": "2026-06-12",
                              "sessions": 117, "kind": "missing_data" }] },
      "indices": { "from": "2017-01-02", "to": "2026-09-23", "gaps": [ ... ] }
    }
  }
  ```

Tests: unit tests for `detectGaps` (holiday runs ignored, the 2020 closure
classified, the 2026 gap detected, a gap at either end of the range, empty
input), a service test with a mocked query, and a controller test for the
envelope.

## 2. Backend: backtest validation

In `BacktestRunsService.create`, before the price lookup:

- If `startDate` or `endDate` falls inside a `missing_data` price gap, reject
  with `422 DATE_IN_DATA_GAP`. The message names the gap
  ("No market data from 2026-01-01 to 2026-06-12. Choose a date outside this
  period."), and `details` carries the gap's `from` and `to`.
- A range that crosses a gap is accepted unchanged.

This only matters for callers that bypass the website's calendar (the public
API), but it stops the silent late start. The engine itself does not change:
holding through a gap and filling a stop at the next open is already the
realistic behaviour.

Tests: service specs for a start in a gap, an end in a gap, a crossing range
(accepted), and a range touching the gap's edges (accepted).

## 3. Frontend: shared gap helpers

- `features/markets/useDataCoverage.ts`: a React Query hook for
  `/coverage` with a long `staleTime` (coverage changes once a day).
- `lib/data-gaps.ts`, pure functions with Vitest coverage:
  - `gapsWithin(gaps, from, to)`: gaps overlapping a range.
  - `gapContaining(gaps, date)`: the gap a date falls in, if any.
  - `withGapSlots(points, gaps, timeframe)`: inserts placeholder points into a
    chart series. Daily: one slot per weekday in the gap. Weekly and monthly:
    one slot per week or month lying *entirely* inside the gap; a period with
    any real session keeps its real bar. Each slot carries `gap` (from, to,
    kind) and `null` price fields, so it takes one bar's width, which keeps the
    missing stretch proportional to the time it covers.

## 4. Frontend: charts

`CandlestickChart` and `IndexLineChart` accept `gaps` and run their data through
`withGapSlots`. In both:

- **Line mode:** `close` is `null` in slots, so the Recharts line breaks there
  (`connectNulls` stays off).
- **Candles and volume:** slots render nothing.
- **Band:** a `ReferenceArea` spans each run of slots in the visible window,
  across the price and volume panels, filled with a new `chartPalette.gap` token
  (grey, both themes). It is labelled "No data · 1 Jan – 12 Jun 2026" or
  "Market closed · 23 Mar – 8 May 2020" when there is room; narrow bands rely
  on the tooltip.
- **Tooltip:** hovering a slot shows the same label instead of prices.
- **Price axis:** `windowDomain` ignores slots. A window made up entirely of
  slots uses the nearest real bars on either side, so the axis never collapses
  to 0–1.
- **Pan and zoom:** unchanged. Slots are ordinary bars to `useChartWindow`, so
  zoomed out the gap is a wide band, and zoomed in each missing session is its
  own grey column.
- **Screen readers:** the hidden data table gets one row per gap ("No data,
  1 Jan 2026 to 12 Jun 2026") instead of one row per slot.

Pages: `SecurityDetailPage` passes the price gaps. `IndexDetailPage` and
`IndexOverview` pass the index gaps (after `resampleIndexValues` for
weekly/monthly).

Tests: extend `CandlestickChart.test.tsx` and `chart-window.test.ts`, and add an
`IndexLineChart` test. Cover the slots, the line break, the band label, the
tooltip, a domain with an all-gap window, and weekly/monthly slotting.

## 5. Frontend: backtest period

`PeriodStep` (used by both the full and the simple wizard):

- **Calendar:** `isDateUnavailable` greys out every date inside a
  `missing_data` gap, alongside the existing min/max bounds. Market closures are
  left alone, like weekends.
- **Crossing notice:** when the chosen range crosses one or more gaps, an
  `AppNotice` under the picker reads: "No market data from 1 Jan to 12 Jun 2026
  in this range. The backtest skips it: an open position is held through it, and
  stop-loss and take-profit rules can't act until 15 Jun 2026."
- **Presets and the default period:** if a start date falls in a gap, it moves
  to the first session after the gap; if an end date does, it moves to the last
  session before it. This applies to `buildPresets` and
  `defaultBacktestPeriod`. The default stays "the most recent year", which
  today crosses the 2026 gap and so shows the notice.
- **Validation:** `validateBacktestConfig` gains a start-in-gap and end-in-gap
  error (the same text as the API), so a typed or restored draft cannot slip
  through.
- **Review step:** repeats the crossing notice, so it is visible just before
  the run.

## 6. Frontend: backtest results

`StatusStep`'s `EquityCurvePreview`:

- **Equity line:** splits into separate segments wherever consecutive equity
  points straddle a gap.
- **Grey rectangle:** covers the gap's share of the x-axis. The axis becomes
  date-proportional rather than index-proportional, so the gap has width.
- **Caption:** gains "Includes 117 sessions without market data" when the run
  crossed a gap.

## Delivery

Three PRs against `dev`, each deployable on its own:

1. **Backend:** coverage endpoint and backtest validation (sections 1–2).
   Nothing in the UI changes yet.
2. **Charts:** gap helpers and chart rendering (sections 3–4).
3. **Backtests:** period picker, validation and results (sections 5–6).

Verification for each PR: service and frontend test suites, typecheck and lint;
then run the app locally against a seeded database and check by eye:

- JKH daily, weekly and monthly across 2025–2026
- ASPI on the Markets page and the index page
- the 2020 closure band
- a backtest from 2025-06-01 to 2026-08-01 (notice shown)
- a start date inside the gap (not selectable, and rejected by the API)

After deploy, repeat the same checks on tradeiqcse.tech and confirm that
`/api/market/coverage` returns the gaps listed above.

## Out of scope

- Filling the gap. When CSE's data or the recovered SMD/CBSL index values are
  loaded, the detected gaps shrink automatically; nothing here needs changing.
- Marking per-security suspensions.
- A holiday calendar before 2026.
- Warmup windows that reach back across a gap. They count sessions, which stays
  correct; they just span more calendar time.

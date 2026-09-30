# Backtesting through 31 December 2025

Status: implemented; independent adversarial review and consolidated corrections complete. Local validation passed; remote CI and CodeRabbit verification tracked in the pull request.
Date: 2026-09-30.

## Product decision

New backtests, including guest previews and authenticated saved runs, may use
dates only through **2025-12-31 inclusive for now**. This is a temporary,
explicitly controlled backtesting product limit, independent of subsequent daily
ingestion. It must be easy to extend when additional historical coverage is ready,
without changing the simulation engine or scattering new dates across the UI.
The existing historical lower limit and security-specific availability checks
remain in place. Additional 2025 rows are already within the supported period;
extending beyond it requires updating the supported-date policy.

Paper trading, Markets charts, developer market-data endpoints, ingestion,
stored prices, and the global coverage endpoint keep their current behavior.

## Verified context

- PR #181 is merged into `dev` at `f16d8a5`. The current checkout's tracked tree
  matches that branch; unrelated untracked plans and visual tooling were left alone.
- Production `GET /api/market/coverage` reports price history through 2026-09-29,
  with a `missing_data` gap from 2026-01-01 through 2026-06-12: 117 weekday sessions.
- Production COMB.N0000 reports `data_to: 2026-09-29`. Its OHLCV endpoint also
  returns an actual 2025-12-31 bar, confirming data at the proposed cutoff.
- Production coverage also reports missing prices on 2020-03-16 through
  2020-03-19, plus real market closures in 2020 and 2022. These earlier gaps and
  closures must continue to display accurately in applicable backtests.
- The local saved database contains 2017–2025 prices only, ending 2025-12-31,
  and no backtest runs beyond the proposed cutoff. These observations describe
  the local database, not production saved-run counts.
- ADR 0007 originally established a 2017–2025 seed window. Its September 24
  update explicitly removed the backtesting ceiling to follow ingestion.

### Current code paths

| Concern | Current behavior | Main files |
|---|---|---|
| Defaults | Latest trailing year follows a company's `dataTo`; 2025-12-31 is only a fallback | `frontend/src/features/backtesting/domain/defaults.ts`, `draft.ts` |
| Calendar and quick picks | Maximum follows company coverage, including 2026; 1/2/5 years and All dates use it | `components/PeriodStep.tsx` |
| Simple and Advanced | Both use the same period component and domain defaults | `components/SimpleBacktestSteps.tsx`, `BacktestWizard.tsx` |
| Company history summary | Backtesting passes the raw `dataTo` to a component also used by paper trading | `components/SecurityStep.tsx`, `frontend/src/features/markets/SelectedCompany.tsx` |
| Client validation | Enforces lower bound, company availability, and gap boundaries; no fixed upper bound | `domain/validation.ts`, `context/BacktestContext.tsx` |
| API validation | Saved runs and guest previews share `prepareRun`; no fixed upper bound | `services/market-trading/src/backtest-runs/backtest-runs.service.ts` |
| Simulation | Price query and engine already restrict observations to the requested start/end | `backtest-runs.repository.ts`, `backtesting/engine/runBacktest.ts` |
| Results charts | Equity curve range comes from actual returned points; only gaps straddled by those points render | `components/StatusStep.tsx`, `BacktestPreviewPage.tsx` |
| Run animation | Short fixed decorative intro has no dates or coverage data | `components/RunReveal.tsx`, `useRunReveal.ts` |
| Restored drafts | Session storage preserves manually chosen dates, including old 2026 dates | `domain/draft.ts`, `context/BacktestContext.tsx` |

## Implementation plan

### 1. Define and enforce the backtesting limit

- Define a validated backend `BACKTEST_MAX_DATE` setting, initially defaulting to
  `2025-12-31`. Keep it separate from global coverage, market dates, and dataset
  ingestion policy. Read it through the service's existing configuration pattern.
- Expose that value through a small, unauthenticated, backtesting-specific policy
  response so guest and signed-in wizards use the same authoritative maximum as
  the backend. Do not modify the shared market coverage response. Ensure any
  static policy route cannot be mistaken for a saved run ID.
- Use `2025-12-31` as the conservative frontend fallback if policy loading fails;
  distinguish that fallback from an authoritative loaded value. Avoid hardcoding
  the date in validation messages, presets, summaries, or request checks.
- Centralize frontend bounds: maximum is the earlier of valid company `dataTo`
  and the product cutoff; minimum retains the existing lower and company bounds.
- Treat a company whose available history begins after the cutoff as having no
  eligible backtesting period. Show that explanation and prevent submission;
  do not fabricate a fallback period for that company.
- Add an early check in backend `prepareRun`, after calendar-date validation and
  before coverage queries, price loading, persistence, or execution. Reject
  either date above the cutoff even when 2026 prices exist.
- Use the existing `400 INVALID_DATE_RANGE` error shape, with
  `details: { field, maxDate }` using the configured policy and a clear message:
  “Backtesting is available through 31 December 2025. Choose an earlier date.”
  Format the date from the current setting rather than fixing it in the text.
- Map that structured error onto the relevant period field in the wizard.
- Do not silently truncate API requests. Keep the engine's financial arithmetic
  and its generic date support unchanged; enforce the product policy at the
  application's shared submission boundary.

### 2. Make every backtesting date choice consistent

- Apply the bounds helper to fresh defaults, company selection, delayed coverage
  updates, both wizard modes, calendar limits, quick picks, and All dates.
- For a company with history through the cutoff, the default becomes
  2025-01-01 through 2025-12-31, subject to its shorter history and existing
  gap-boundary snapping. A company ending earlier keeps that earlier ceiling.
- Cap only backtesting's history summary props; do not alter the shared
  `SelectedCompany` component or the raw market response. In the dates section,
  call this the available backtesting period rather than implying all market
  data ends in 2025.
- Replace “latest year of prices” / “latest day with prices” explanations with
  wording about the available backtesting period. Show a compact statement
  “Backtesting is available through 31 December 2025.”
- Retain custom dates that are already valid. Recompute drafts marked as using
  coverage defaults under the new limit. For restored custom 2026 dates, show an
  immediate period error and an action to use the eligible suggested period,
  keeping company, rules, capital, and execution settings. Do not silently
  change a manually configured investment period.
- Ensure gap snapping cannot push a generated start beyond the cutoff or invert
  the eligible range. An empty eligible window becomes an unavailable state.

### Extending the period later

- Import and verify the additional historical prices using the existing ingestion
  process. No price deletion or migration is needed for the temporary restriction.
- Raise `BACKTEST_MAX_DATE` to the newly supported end date and reload/redeploy
  the backend configuration as required by the existing deployment process.
- The website reads the updated policy and derives its bounds, defaults, presets,
  and messages from it. No engine change or separate frontend date edit is needed.
- Retain date-gap validation and rendering within the newly supported period.
  A later coverage end date alone does not prove that intervening history exists.
- Test policy loading and refresh, conservative fallback, backend rejection at
  the configured boundary, and extension to a later date without code edits.

### 3. Keep results and animations honest

- New accepted runs cannot query or simulate 2026 bars. Verify trades and equity
  points are all dated on or before 2025-12-31.
- Use the current equity-curve range and gap intersection logic: the 2026 gap
  should naturally disappear from new previews and saved-run results when their
  last observation is in 2025. Add a regression test with the complete production
  gap list, including 2026, and a 2025 result series.
- Keep earlier real gaps and market closures visible. Do not remove bands or
  globally filter the coverage response to make the charts look continuous.
- Keep the decorative run intro as is; it already has no 2026 timeline or gap.
- Preserve previously saved results and guest preview records as originally
  calculated. Do not delete runs or crop their displayed equity/trades while
  leaving their metrics unchanged. If a pre-change record contains 2026, mark it
  as a result from the previous supported period; saving/rerunning it must first
  use a valid period. Check production existence through an authorized read if
  needed during implementation; local counts cannot establish production state.

### 4. Update affected tests and documentation

- Update frontend tests that currently accept 2026 and backend service/API happy
  paths built around August 2026. Move backtesting-specific gap fixtures to a
  year at or before 2025 while preserving weekday/weekend boundary semantics.
- Keep shared Markets fixtures and global gap-detection tests covering 2026;
  create backtesting-specific fixtures instead of changing shared coverage.
- Update ADR 0007 with the new decision and annotate the backtesting portion of
  `docs/plans/data-gap-handling.md`; retain its Markets decisions. Document the
  backtest limit and error contract alongside the existing endpoint/error docs.

## Validation and acceptance

1. Accept a valid period ending 2025-12-31. Reject 2026-01-01 and later dates on
   both authenticated creation and guest preview, including ranges whose start
   is in 2025 and end is in 2026, and wholly post-cutoff ranges with real bars.
2. Assert rejected requests create no run and never query prices or execute the
   engine. Test cutoff error details through the HTTP exception filter.
3. Test defaults, 1/2/5-year picks, All dates, company selection, typed dates,
   restored drafts, both workflow modes, delayed/missing coverage, shorter
   histories, and companies whose history starts after the cutoff.
4. Render previews and saved results with 2025 observations plus the production
   2026 gap metadata: no 2026 axis date, gap band, gap warning, or missing-session
   count. Preserve pre-2026 gap and closure behavior and reduced-motion support.
5. Use isolated API fixtures/database data containing both 2025 and 2026 bars,
   because the local saved dataset alone cannot reproduce production coverage.
6. Run relevant frontend/backend suites, lint, typechecks, builds, and the full
   Compose smoke test. Check the emitted service entry point and startup as well
   as compilation. Verify CI through completion before delivery.
7. Browser-check guest and signed-in Simple/Advanced workflows at desktop and
   mobile widths, including stale custom drafts and completed result views.
8. Verify paper-trading bounds still follow their existing source and Markets
   still shows its unchanged 2026 data gap. No changes to shared market date
   helpers, market coverage endpoints, ingestion, or saved price data are needed.

No database migration, production data deletion, engine redesign, or change to
paper-trading behavior is part of this plan.

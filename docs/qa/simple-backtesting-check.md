# Simple/Advanced backtesting validation

Date: 15 September 2026

Worktree: `tradeiq-frontend-qa`

Branch: `nimesh/frontend-quality-assurance`

State: uncommitted working-tree implementation, not a published commit or CI result.

## Scope

Simple backtesting has three pages; Advanced retains seven. Both share the existing
configuration, validator, mapper, API and results. Backend services, algorithms,
calculations, contracts, lockfile and Compose definitions were not changed.
Paper-trading mode presentation is not implemented by this increment.

## Automated checks

Under Node 20.20.2 and repository-pinned pnpm 9.15.0:

| Check | Result |
| --- | --- |
| Frontend ESLint | Passed, zero warnings |
| Frontend TypeScript | Passed |
| Full frontend Vitest | 52 files, 329 tests passed |
| New Simple workflow tests | 19 passed, included in the full suite |
| Production build | Passed |
| Isolated frontend Docker build | Passed |
| `git diff --check` | Passed |
| Backend/pipeline/Compose/lockfile diff | Empty |

New workflow tests cover fresh entry and automatic defaults, two Continue actions
plus Run, grouped validation, hidden invalid rules/sizing/fees, custom indicators,
request equality, mode switching for all seven Advanced steps, reload, browser
history, keyboard disclosures, direct review repair links, duplicate submission,
submission-time mode blocking and retry.

Retained warnings: React Router v7 future-flag notices; Recharts zero-size warnings
in jsdom; Vite's existing entry-chunk size warning (approximately 585.5 kB minified).
These are not claims of production performance or real chart-layout validation.

## Targeted Chromium observations

App: `http://localhost:55183`, compiled frontend with isolated backend ports
53101/53102/58101 and database 55442. Only the frontend container was rebuilt.
The stack uses six securities and a short January 2025 smoke fixture, not the full
historical dataset.

- A disposable local QA account was created and used. No user account, shared
  database, backend code or non-QA container was modified.
- Generic backtest entry correctly returned to Simple after sign-in.
- Selecting COMB automatically selected 2025-01-02 through 2025-01-10, its reported
  fixture coverage. No calendar configuration was required.
- The idea page showed filled-in example exit thresholds, virtual capital,
  trade size and the combined simulation charge with detailed panels closed.
- Two Continue actions followed by Run reached the existing status/results page.
  Run `fd21defe-d1ea-47d2-b41f-9638a2710a31` completed and showed persisted API
  output, including seven equity observations and two executions.
- Changing virtual capital to LKR 500,000 survived Simple-to-Advanced navigation,
  the Advanced capital page, switching back and reload.
- Light desktop and 375px mobile checks, plus 320px dark checks, showed responsive
  stacked controls. DOM width checks at 375px and 320px reported matching page/main
  widths; the step strip intentionally has contained horizontal overflow.
- The 320px check caught a clipped trade-configuration label. It was shortened to
  `Configure trade settings`; the final build's expanded `Hide trade settings`
  control fit and the sizing panel was usable.
- Page transitions initially preserved an inconvenient bottom scroll position.
  The final implementation focuses and scrolls to the new page heading, confirmed
  on the Advanced capital and Simple mobile review pages.

## Still required

Full 360/768/1024/1440 theme matrix; all supported rule/sizing/fee combinations
against the real dataset; complete keyboard/screen-reader audit; cross-browser
testing; measured usability and production-build Lighthouse gates. Targeted
Chromium checks and unit tests do not establish those passes.

Next implementation increment: Simple/Advanced paper-trading ticket presentation,
preserving the existing review/estimate and explicit confirmation safeguards.

# TradeIQ Frontend Quality Assurance Plan

Status: Phases 0 and 1 completed; Phase 2 is next

Target baseline: `dev` after PR #131 (`refactor: unify frontend design language`)

Primary tracking issue: GitHub #105, Front-end quality pass for the advisor review

Beginner-journey refinement: [Paper trading and backtesting UX plan](beginner-trading-ux.md)

Progress update, 16 September 2026: lint, typecheck, 347 frontend tests, V8
coverage, the production build and a fresh isolated cross-service Compose smoke
pass for the current local worktree. Phase 1 is complete; browser and quality
matrices remain outstanding.

Phase 0 evidence:

- `docs/qa/frontend-quality-baseline.md`
- `docs/qa/frontend-route-state-checklist.md`

Phase 1 evidence:

- `docs/qa/frontend-automated-baseline.md`

## Objective

Prove that the refreshed TradeIQ frontend is reliable, understandable, accessible,
responsive, and performant with the real application stack. The quality pass must
test product behavior as well as appearance and must produce evidence that another
team member can review.

This is a feature-freeze activity. It may fix defects, improve test coverage, and
add QA infrastructure, but it must not introduce unsupported product capabilities
or fabricated data.

## Quality gates

The frontend is ready for the advisor review only when all of the following are
true:

- every critical user journey passes against healthy local backend services;
- no open severity P0 or P1 defect remains in an evaluation-critical journey;
- every real route is usable at 360, 768, 1024, and 1440 pixels;
- the page itself has no unintended horizontal overflow; deliberately scrollable
  tables and candlestick plots remain contained within their own labelled region;
- light and dark themes have readable text, controls, charts, financial direction
  colours, focus indicators, and disabled states;
- public-route Lighthouse performance, accessibility, best-practices, and SEO
  scores are each at least 95 in the agreed production-like environment;
- no serious or critical automated accessibility violation remains;
- authentication, session restoration, logout, and protected-route behavior pass;
- the standard user is denied access to administrator-only content;
- browser consoles contain no uncaught exceptions during the critical journeys;
- current lint, typecheck, unit/integration tests, production build, and Compose
  smoke test pass from a clean checkout.

## Current baseline

The repository currently provides:

- ESLint, TypeScript typechecking, Vite production builds, and Vitest with jsdom;
- MSW-backed frontend API tests;
- 50 frontend test files covering 366 `describe`/`it` declarations in the current
  source inventory;
- API, migration, seed, and isolated Docker Compose smoke checks in GitHub Actions;
- route-level lazy loading and application error/loading/empty-state primitives;
- no checked-in Playwright suite, automated axe scan, or Lighthouse CI gate.

The baseline numbers are inventory, not a pass claim. Phase 1 must execute the
tests again from the current `dev` head and record the exact results.

## Test environments

### Required environment

- Fresh worktree and QA branch from the latest `origin/dev`.
- Repository-pinned Node 20 and pnpm 9.15.0.
- Full Docker Compose stack with migrations and the validated sample market data.
- Frontend production build served through `vite preview` or the production NGINX
  container for performance measurements.
- Chromium for the complete test matrix.

### Browser coverage

- Chromium: complete functional, responsive, accessibility, and performance pass.
- Firefox: smoke the critical public and authenticated journeys.
- WebKit or macOS Safari: smoke navigation, authentication, date pickers, menus,
  chart scrolling, and order confirmation.

Browser differences become defects only when they affect supported behavior. Minor
rendering differences that preserve hierarchy, readability, and interaction are
not defects.

### Test identities and data

Prepare reproducible, non-production QA data:

1. Anonymous visitor with no cookies or local storage.
2. New standard account with no portfolios or orders.
3. Standard account with a portfolio, cash activity, positions, filled/rejected
   orders, and at least one completed backtest when the APIs support that state.
4. Administrator account only if a real backend role/claim contract exists.

Record how each account is created or reset. Never place credentials or secrets in
the repository, screenshots, test reports, or browser recordings.

## Route inventory

### Public routes

| Route | Primary checks |
| --- | --- |
| `/` | hero video fallback/autoplay behavior, navigation, themes, CTAs, no landing API wait, reduced motion, metadata |
| `/how-it-works` | readable educational hierarchy, anchors/navigation, mobile layout, metadata |
| `/login` | validation, password visibility, keyboard completion, failures, redirect, metadata |
| `/signup` | validation, keyboard completion, duplicate/invalid account states, redirect, metadata |
| `/markets` | search, sector/sort filters, pagination, table overflow, data date, Top Movers, API states |
| `/markets/index/:code` | valid/unknown index, range controls, chart states, responsive layout |
| `/markets/:symbol` | valid/canonical/unknown symbol, security data, ratios, all chart ranges |

FAQ and About are mentioned in prior SEO expectations but are not current routes.
QA should record whether existing How It Works content satisfies that requirement or
whether separate routes are an approved follow-up. Do not add pages during testing
without a product decision.

### Authenticated routes

| Route | Primary checks |
| --- | --- |
| `/dashboard` | populated/empty/error summaries, safe dates, navigation actions |
| `/watchlist` | honest empty/local-only behavior, no false persistence claim |
| `/portfolio` | create/select/delete, summaries, positions, ledger, as-of behavior |
| `/paper-trading` | symbol selection, estimate, confirm, accepted/rejected states, idempotency |
| `/orders` | filtering, pagination, statuses, details drawer, empty/error states |
| `/analytics` | honest capability/planned presentation without invented metrics |
| `/ai-insights` | planned-state accuracy and direct-link behavior |
| `/reports` | planned-state accuracy and direct-link behavior |
| `/admin` | ordinary-user denial; admin behavior only with a real authorization contract |
| `/backtests/new/:step` | all seven wizard steps, validation, URL/direct navigation, advanced controls |
| `/backtests/:runId/status` | queued/running/completed/failed/unknown states and persisted results |

The backtest steps are Security, Period, Rules, Execution, Capital, Metrics, and
Review.

## Test passes

### Phase 0: Prepare and freeze the baseline

- Fetch current `origin/dev` and create a dedicated QA worktree/branch.
- Capture commit SHA, Node/pnpm versions, browser versions, OS, Compose image IDs,
  and sample dataset version.
- Confirm the expected frontend and API origins.
- Start with clean browser storage and a reproducible database state.
- Create a route-and-state checklist from the inventory above.
- Reconcile open issues #105, #116–#120, #134, and #135 with the merged code; do
  not close an issue merely because its source appears changed.

Deliverable: baseline section in the QA report and a confirmed test-data procedure.

### Phase 1: Automated regression baseline

Run from a clean dependency installation:

```text
pnpm --filter @tradeiq/frontend run lint
pnpm --filter @tradeiq/frontend run typecheck
pnpm --filter @tradeiq/frontend run test
pnpm --filter @tradeiq/frontend run build
pnpm run smoke:compose
```

Record command, commit, duration, pass/fail, and any warnings. Warnings must be
classified rather than ignored; known harmless jsdom or chart-layout warnings may
be documented, while uncaught exceptions and unhandled promises must be fixed.

Generate a coverage report once to identify untested high-risk logic. Coverage is
diagnostic rather than a vanity target: prioritize authentication transitions,
API error mapping, financial formatting, date aggregation, order idempotency, and
backtest validation over presentation-only line coverage.

Deliverable: repeatable automated baseline with no unexplained failures.

### Phase 2: Public-route browser, responsive, and SEO pass

For each public route:

- test 360x800, 768x1024, 1024x768, and 1440x900 viewports;
- test light and dark themes, plus persisted and system theme selection;
- tab through every interactive control and verify visible focus and sensible order;
- inspect the browser console, failed network requests, layout overflow, clipped
  text, and overlapping popovers;
- test direct navigation, reload, browser back/forward, and unknown routes;
- verify loading, empty, 4xx, 5xx, timeout, and backend-unavailable states where
  the route makes requests;
- verify unique title, description, canonical URL, Open Graph, and Twitter metadata;
- capture representative desktop/mobile screenshots in both themes.

Use a production build for Lighthouse. Run at least three mobile measurements and
one desktop measurement per representative public page, report the median mobile
result, and retain the reports. Do not measure with browser extensions or DevTools
panels that change page performance.

Deliverable: public route matrix, screenshots, Lighthouse reports, and filed defects.

### Phase 3: Authentication and session reliability pass

Test:

- successful and unsuccessful signup/login;
- keyboard-only completion and clear validation/error association;
- refresh-cookie session restoration after a hard reload;
- direct loading of every protected URL in a fresh tab;
- repeated sidebar navigation without an unexpected logout;
- simultaneous authenticated requests receiving 401 responses, ensuring refresh
  is coordinated and requests are retried safely;
- expired/invalid refresh session behavior;
- logout, back-button behavior, and storage/cookie cleanup;
- anonymous redirect from protected routes without a console-shell flash;
- ordinary-user access to `/admin`, including direct URL entry and refresh;
- session behavior in two tabs.

Run a deliberate reproduction campaign for #118 instead of treating one successful
login as proof. A standard user reaching administrator content is a release blocker.

Deliverable: authentication state-transition log and evidence for #118/#119.

### Phase 4: Authenticated critical journeys

#### Research journey

1. Browse Markets and identify the displayed `as_of` date.
2. Search and filter by sector, including the unclassified-company case.
3. Open a security and change timeframe/date range.
4. Verify the unknown-symbol error state and recovery action.
5. Open an index and validate range/error behavior.

#### Backtesting journey

1. Complete all seven steps with the default beginner path.
2. Confirm optional execution/sizing inputs remain subordinate or collapsed.
3. Exercise required-field and incompatible-rule validation.
4. Submit once and verify queued, running, and completed transitions.
5. Reload the status URL and confirm the run/result remains available.
6. Exercise a failed run and verify the failure reason when the API exposes it.
7. Confirm historical results are never described as predictions or advice.

#### Paper-trading journey

1. Create and select a portfolio.
2. Search for a security using the market-trading origin.
3. Estimate and confirm a valid buy.
4. Repeat/reload around confirmation to validate idempotency.
5. Verify the order, fill/status, cash effect, positions, and portfolio summary agree.
6. Exercise insufficient cash, invalid quantity, stale estimate, rejection, and
   unavailable-service states.
7. Exercise a sell only when a valid holding exists.
8. Verify order filtering, pagination, and detail drawer behavior.

For every journey, repeat the essential path at 360px and 1440px in both themes.

Deliverable: journey evidence with request/response identifiers where safe and no
unexplained mismatch between screens.

### Phase 5: Chart and financial-data QA

#### Candlestick matrix

Test daily, weekly, and monthly intervals with:

- one or very few returned bars;
- approximately 15 bars;
- more than 15 bars;
- the default range;
- a short custom range;
- a long custom range;
- a range containing weekends/market holidays;
- a valid range with no returned observations;
- malformed or incomplete OHLCV data through a controlled test/mock.

Verify:

- candles retain a stable minimum readable width;
- more than approximately 15 candles creates horizontal chart scrolling instead
  of compressing every candle;
- the volume bar and date label align with the corresponding candle at every
  timeframe and after scrolling;
- open/high/low/close tooltip values refer to the hovered/focused candle;
- bullish and bearish candles remain distinguishable in both themes without relying
  only on colour;
- weekly/monthly aggregation uses correct open, high, low, close, volume, and date;
- scroll position, resize, theme switch, and range switch do not corrupt alignment;
- date formatting is valid in the Sri Lankan locale/timezone and never crashes a page.

#### Financial consistency

- Reconcile order estimate, confirmed order, cash ledger, position cost, and summary.
- Verify currency, percentage, quantity, signed-value, and unavailable-value formats.
- Confirm positive/negative colours have consistent semantics across Markets,
  portfolio, orders, charts, and backtests.
- Verify all market and valuation timestamps state whether data is delayed, EOD,
  historical, estimated, or unavailable.

Deliverable: chart matrix and at least one recorded reconciliation example.

### Phase 6: Accessibility and interaction audit

Add an automated accessibility scan to representative routes and manually verify:

- one useful page-level heading and logical heading order;
- landmarks, skip/navigation behavior, and current-page indication;
- names and descriptions for inputs, icon buttons, charts, tables, and status regions;
- keyboard access to menus, drawers, dialogs, tooltips, selects, date pickers, tables,
  pagination, and the complete backtest wizard;
- focus trapping/restoration for dialogs and drawers;
- Escape dismissal where expected;
- errors announced and associated with the relevant field;
- loading/status updates announced without excessive interruption;
- colour contrast for text, controls, focus, chart marks, and financial values;
- 200% zoom/reflow and browser text enlargement;
- `prefers-reduced-motion` behavior and a useful poster/fallback for the landing video.

Automated scans complement rather than replace keyboard, screen-reader, zoom, and
contrast review.

Deliverable: automated results plus a manual accessibility checklist.

### Phase 7: Cross-browser regression and sign-off

- Re-run the critical journeys in Firefox and WebKit/Safari.
- Re-run every fixed defect at its original viewport/theme/state.
- Re-run the automated baseline and representative Lighthouse pages.
- Confirm GitHub Actions, including Docker Compose smoke, passes on the final commit.
- Verify no temporary credentials, screenshots containing personal data, debug
  logging, or QA-only fixture behavior is included in the product build.
- Produce the final report and update/close issues with evidence.

Deliverable: signed-off QA report tied to an exact commit SHA.

## Automation strategy

Keep the existing Vitest/MSW suite for component, hook, formatting, validation, and
API-contract behavior. Add browser automation only for workflows where a real browser
provides materially different evidence:

- public navigation and responsive shell;
- login/session restoration/protected routes;
- Markets to security-detail navigation;
- one backtest happy path plus a failed status;
- one paper-order happy path plus a rejected path;
- chart overflow/alignment at short and long ranges;
- ordinary-user denial from `/admin`;
- automated accessibility scans on representative public/authenticated routes.

Prefer semantic roles and stable product labels over CSS selectors. Avoid broad pixel
snapshots; use a small set of deliberate screenshots for visual review and assertions
for overflow, visibility, focus, text, URL, state, and network behavior.

Do not make Lighthouse a blocking CI job until its production-server setup is stable
and repeated runs show a low false-failure rate. Initially store reports as QA evidence;
then adopt budgets for the representative public pages.

## Defect severity and handling

| Severity | Definition | Examples | Release rule |
| --- | --- | --- | --- |
| P0 | Security, data-integrity, or total critical-flow failure | ordinary user receives admin capability; wrong-account data; order duplicated | Stop testing the affected flow and fix immediately |
| P1 | Critical journey unusable or unreliable | random logout; blank screen; cannot submit backtest/order; mobile control inaccessible | Must be fixed before advisor build |
| P2 | Important degradation with a workaround | one browser layout problem; misleading state; non-critical keyboard failure | Fix before review where feasible; otherwise explicitly accepted |
| P3 | Cosmetic or low-impact inconsistency | minor spacing/radius mismatch without usability impact | Record and batch after higher risks |

Every defect must include:

- exact commit/environment;
- route, account state, viewport, browser, and theme;
- reproducible steps;
- expected and actual behavior;
- screenshot/video and relevant console/network evidence;
- severity rationale;
- regression test or explicit reason automation is unsuitable.

## Evidence and reporting

Store generated evidence outside the product bundle. The final QA report should link
or attach:

- exact tested commit and environment inventory;
- automated command results and GitHub Actions run;
- route/viewport/theme matrix;
- critical-journey results;
- accessibility findings;
- Lighthouse JSON/HTML reports and median scores;
- representative screenshots;
- defect list with current status;
- deferred risks and named owner/decision;
- final go/no-go conclusion.

Do not commit browser profiles, credentials, cookies, raw personal information, large
temporary videos, or generated dependency/build directories.

## Recommended execution order

1. Establish the clean automated baseline and QA accounts.
2. Reproduce security/session blockers #118 and #119 first.
3. Complete public-route responsive, accessibility, metadata, and Lighthouse checks.
4. Complete authenticated research, backtesting, and paper-trading journeys.
5. Run the dedicated chart/financial reconciliation matrix.
6. Fix defects in severity order and add focused regression coverage.
7. Run cross-browser regression and issue a commit-specific QA report.

## Definition of done

Quality testing is complete only when the quality gates are met and the evidence is
reviewable. Passing unit tests alone is not completion; neither is a visual review of
only the landing page. Any untested route, browser class, protected-state transition,
or critical API journey must be explicitly recorded as a remaining risk rather than
silently treated as passing.

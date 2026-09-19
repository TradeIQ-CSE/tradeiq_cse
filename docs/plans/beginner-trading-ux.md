# Beginner-first paper trading and backtesting

Status: defaults foundation and Simple/Advanced backtesting and paper trading implemented on 15 September 2026; integrated QA remains

Branch: `nimesh/frontend-quality-assurance`

Related plan: [Frontend quality assurance](frontend-quality-assurance.md)

## Purpose and boundaries

Apply the 12 September mentor feedback: show the decisions a beginner needs,
provide sensible and disclosed simulation defaults, and reveal additional controls
only when the user asks to configure them. Reduce unnecessary navigation, not
financial safeguards or understanding.

This is refinement of existing capabilities during feature freeze. Do not introduce
new order types, indicators, strategy engines, calculated metrics, or account setup
side effects. This document extracts actionable UX requirements, not the private
meeting transcript. Do not publish the transcript or participant details.

Explicit implementation boundary: do not modify backend algorithms, services,
execution rules, calculations or API contracts. Simple mode must populate existing
frontend-supported defaults automatically; users do not have to fill optional
configuration to get a complete request. Account creation and submission remain
explicit actions.

### First increment: shared defaults foundation

- Fresh backtest drafts have complete existing rule, sizing, charge, capital and
  analysis-focus defaults. Suggested dates follow the selected company's latest
  year, clipped to its reported coverage, until the user configures dates explicitly.
- Draft restoration fills missing sections/nested defaults while preserving saved
  custom values. Legacy dates are not replaced. Automatic-period intent survives
  reload; it is separate frontend metadata and is not sent to the API.
- Paper-trading account creation starts with editable `Practice portfolio` and
  LKR 1,000,000. It sends no creation request until the user submits. Portfolio
  management elsewhere retains its existing blank setup fields.
- The seven-step UI remains available as Advanced. The following increment adds
  the three-page backtest flow; detailed/simple paper-trading tickets remain next.

### Second increment: Simple/Advanced backtesting

- Generic entry points open Simple: company/period, idea/cash, review/run.
  Existing explicit step URLs without a mode retain the seven-page Advanced UI.
- A BoardUI segmented selector changes presentation only. Mode, page and targeted
  edit section are URL-owned, preserving reload and browser history. All modes
  use the existing draft, validator, request mapper, API and status/results route.
- Simple shows actual rule, exact-date, trade-size and combined-charge summaries.
  Named configuration panels reveal the existing calendar, rules, sizing, charges
  and optional analysis focus; custom configurations are labelled and preserved.
- Page validation checks every underlying section in that page. Invalid settings
  open their panels; review offers direct repair links. Normal page transitions
  focus and scroll to the new heading. Submission blocks workflow navigation and
  uses a synchronous duplicate-request guard.
- Frontend lint, typecheck, production/Docker builds and 329 tests across 52 files
  pass. Targeted Chromium checks include a completed real fixture backtest,
  custom-cash preservation across modes, and light/dark narrow-mobile checks.
  This does not complete the full responsive, accessibility, cross-browser or
  performance matrix. See [validation evidence](../qa/simple-backtesting-check.md).

## Two workflows, one underlying configuration

### Third increment: Simple/Advanced paper trading

- Generic paper-trading entry defaults to Simple; `?mode=advanced` exposes the
  existing detailed ticket. Mode is URL-owned and changing it does not remount the
  ticket or account-creation form, reset inputs/estimates, or send an order request.
- Simple keeps company, Buy/Sell and share count visible. Account creation displays
  its name and virtual-cash defaults before an explicit Create action; configuration
  is optional. Multiple accounts remain easy to switch; New is under Manage.
- Review is the initial primary action, including keyboard Enter. Confirmation
  appears after a matching estimate, below its cash impact and visible total charges.
  Individual API fees and settlement information are optional disclosures. Advanced
  retains the existing full estimate, account controls, preview and confirmation.
- The matching gate includes the portfolio and an edit revision so changing away
  and back cannot resurrect an invalid preview. Late responses stay stale. Review
  and confirmation have synchronous duplicate guards; refresh blocks confirmation,
  pending requests lock account/mode controls, and unchanged retries retain their key.
- Hidden invalid setup fields reveal and receive focus. Review and order results
  receive focus/scroll so mobile and keyboard users do not have to find new content.
- Backend services, algorithms, contracts, fee calculations and dependency versions
  are unchanged. Figures are formatted from the API, never recalculated in the UI.
- Follow-up usability polish: the empty Simple ticket is centered and constrained
  to 672px; a review widens the layout up to 1152px, with two columns only on
  desktop. A non-interactive Choose / Review / Confirm guide shows the current
  stage without adding clicks. Missing-input guidance explains the disabled Review
  button. The selected company name uses existing search data, with no extra fetch.
  Optional help is below the Simple action; Advanced retains its original order.
- Validation: 18 workflow tests, 347 frontend tests across 53 files; lint,
  typecheck and production/Docker builds pass. Targeted Chromium observations include
  explicit default setup, real fixture-backed simulated buy/sell and cash updates,
  preserved mode switching and narrow light/dark checks. Full QA is not signed off.
  See [paper-trading evidence](../qa/simple-paper-trading-check.md).

Updated direction, 15 September: retain two presentation workflows instead of
replacing the existing advanced flow.

- **Simple** is the default for a fresh journey: `Fewer steps, with settings you can change`.
- **Advanced** is an explicit alternative: `Walk through every available setting`.
- Use a clearly labelled BoardUI segmented selector near the page heading, not a
  mandatory mode-selection screen. Do not classify users by expertise or lock
  advanced controls behind an account setting.
- Both modes share the same draft, validation, request mapper, API and results.
  Mode controls presentation and navigation only, never execution semantics.
- Switching preserves all inputs, including settings not currently expanded.
  Simple mode shows summaries and `Custom` indicators for advanced edits; it does
  not silently convert a custom strategy back to defaults.
- Mode switching performs no API mutation and is unavailable while submission is
  in flight. Do not switch between workflows after a confirmed submission.
- Preserve mode on reload within the journey. Existing explicit seven-step URLs
  continue to open the advanced workflow; fresh generic entry points default to
  Simple. Represent mode in the URL so browser history and shared links are clear.
- Map corresponding sections when switching: advanced Security/Period to simple
  page 1; Rules/Execution/Capital to page 2; Metrics/Review to page 3. Simple-to-
  advanced switching opens Security, Rules or Review respectively, with direct
  configuration links able to target a more specific advanced section.

Keep named configuration disclosures in Simple mode for small edits. Switching to
Advanced is for users who want the complete step-by-step process, not a requirement
for changing one threshold.

## Current branch progress and remaining work

- The QA worktree is based on `3ec30401803e4caa499bd5b246795a91342720dc`,
  the merged frontend improvements baseline. The design migration was completed
  before this branch; it does not need to be repeated.
- Phase 0 inventory and route/state checklists are complete. They are currently
  uncommitted QA artifacts, not completed browser testing.
- On 16 September a fresh disposable Compose project passed service readiness,
  frontend assets, CORS, a seeded public journey and an authenticated cross-service
  journey, then cleaned itself up. It used the small smoke fixture, not the full
  historical market dataset. The saved canonical QA project remains stopped and
  preserved.
- Phase 1 is complete for the current local worktree: lint, typecheck, 347 tests,
  V8 coverage execution, the production build and the isolated Compose smoke pass.
  This is still not proof of the browser journey matrix; see
  `docs/qa/frontend-automated-baseline.md`.
- Still required: public responsive/SEO/performance checks; session and role
  reliability; authenticated paper-trading/backtest journeys; chart alignment,
  scrolling and colour checks; accessibility; cross-browser regression and sign-off.
- The shared candlestick component still sizes both charts to the container and
  hides overflow. The mentor's minimum-readable-width and contained horizontal
  scrolling requirement remains an implementation task, followed by daily/weekly/
  monthly and custom-range QA. Colour mapping already exists; verify actual
  contrast and missing-open behavior rather than assume colours are unimplemented.
- Base Open Graph/Twitter metadata and a social image already exist. Per-public-
  route metadata, crawler-visible previews, production URLs, and measured scores
  still need validation. Do not claim the >=95 gates without retained measurements.
- Backend result persistence already exists in the current backtest service.
  Identical-query reuse across users is a separate backend caching investigation,
  not part of this frontend plan. AWS/NGINX deployment is also separate.

## Interaction principles

1. Keep company, action, quantity/strategy, period, virtual cash, total cost and
   data-date context understandable without opening help.
2. Use named actions such as `Configure trade size`, `Configure charges`, and
   `Change starting cash`, not an unexplained cog. A workflow selector complements
   these actions; users should not need to switch mode for every small edit.
3. Use BoardUI disclosure/accordion patterns for inline configuration; use selects
   for short mutually exclusive choices. Do not put multi-field forms in tiny menus.
4. Keep a compact summary visible when a panel is closed. Modified settings show
   a `Custom` indicator. Closing a panel never resets values.
5. Reveal errors inside closed panels automatically and focus the relevant field.
   Hidden invalid settings must not create a disabled button with no explanation.
6. Preserve values on back/forward, edits, retry and reload where supported.
   Defaults apply to fresh drafts only; never overwrite restored custom drafts.
7. Support keyboard, touch and screen readers. Help and configuration cannot be
   hover-only. Use the existing themes, typography, financial tones and radius scale.
8. Never conceal material simulation assumptions, call defaults investment advice,
   fabricate results, or add artificial delay to make computation appear substantial.

## Source findings: backtesting

| Current control | Problem | Proposed treatment |
| --- | --- | --- |
| Seven mandatory wizard screens | Execution, capital and metrics require navigation even if the defaults are acceptable | Default three-screen Simple journey; retain the full seven-screen Advanced journey |
| Company search and period picker on separate screens | Adds a transition for two closely related decisions | Combine into `Choose a company and period` |
| Three entry choices and four exit choices displayed as cards | Exposes the full rule vocabulary immediately | Compact sentence-based rule summary with named configuration disclosures |
| Rule parameter fields | Already appear only for applicable rules | Preserve conditional fields; place next to the selected rule rather than in a separate parameter wall |
| Four position-sizing cards | Beginner must inspect percentage, fixed cash and fixed shares | Visible summary of the current size; `Configure trade size` reveals all existing modes and the selected mode's field |
| Five fee components plus combined rate | Individual components dominate the execution screen even before editing | Show combined simulation charge; `Configure charges` reveals breakdown and existing custom-rate editor |
| Capital input, five presets, explanation and repeated balance | Repeats one concept across a whole screen | One visible `Virtual starting cash (LKR)` field; subordinate change/preset controls, no separate mandatory screen |
| Seven metric selections | `mapToBacktestRequest` does not send these selections; they do not alter the run | Optional review disclosure in Simple; retain the analysis-focus screen in Advanced with an honest explanation |
| Six review sections with separate edit navigation | Repeats technical detail and makes correction expensive | Short readable summary with section-level edits and expandable assumptions |
| Unsupported-indicator notice | Prominent list of unavailable acronyms is distracting | One plain-language price-rule limitation; detailed limitations behind `How this simulation works` |

Relevant source: `BacktestWizard.tsx`, `BacktestContext.tsx`, `RulesStep.tsx`,
`PeriodStep.tsx`, `ExecutionStep.tsx`, `PortfolioStep.tsx`, `MetricsStep.tsx`,
`ReviewStep.tsx`, `domain/defaults.ts`, `domain/mapper.ts`, `domain/validation.ts`.

### Target normal journey: three screens

1. **Choose a company and period.** Search by company or code. Show available
   coverage and a short range choice; the existing calendar is available through
   `Choose custom dates`. For a fresh draft, propose the latest year clipped to
   reported coverage, not a hardcoded calendar year. Show exact dates and a clear
   no-data/insufficient-coverage state. Changing company must recheck the range.
2. **Describe the idea.** Display the actual buy/sell rules in simple sentences,
   plus one visible virtual-starting-cash field. `Configure when to buy` and
   `Configure when to sell` reveal existing rule choices and only their applicable
   fields. Show trade-size and combined-charge summaries with optional configuration.
   Retain the existing fresh-draft rules and execution defaults initially; display
   the 10% gain exit, 5% loss exit and end-of-period exit explicitly, not silently.
   They are editable simulation examples, not recommended trading thresholds.
3. **Review and run.** Show company, exact period, buy/sell sentences, starting cash,
   sizing and total charge assumption. State whole-share rounding, relevant same-bar
   precedence, EOD limitations and historical-not-predictive warning in concise
   language. Allow direct section edits without losing the draft. Run once, then use
   the existing real status/results route with its actual progress and failures.

Target: two Continue actions plus Run, down from six Continue actions plus Run,
excluding company search and optional edits. This is a design target, not a measured
usability result. Do not replace seven screens with one enormous scrolling form.

### Advanced journey: preserve seven screens

Security, Period, Rules, Execution, Capital, Analysis focus (the current Metrics
step), and Review remain individually navigable. Reuse existing step components
and preserve all supported controls. Explain that analysis-focus selections do not
change execution or request additional API metrics. Simple and Advanced both use
the existing run status/results route.

### Routing and validation requirements

- Separate the displayed three-step and seven-step journeys from the config/domain model.
  Do not skip validation merely because a former step is no longer displayed.
- Retain existing `/backtests/new/:step` links as Advanced entry/edit points.
  Give Simple pages explicit route/mode identity without overloading existing step
  names. Update indicator, review edits, validation links and browser back behavior
  together; avoid a second independent configuration state.
- Validate grouped sections before Continue and the complete request before Run.
  Map backend errors to their visible field/disclosure, including execution errors.
- Existing rounding and exit precedence are explanations of fixed engine behavior,
  not new editable controls. Do not add warmup/indicator controls in this work.
- Analysis-focus preferences remain local UI preferences. They must not suggest
  that unsupported metrics will be computed or returned.

## Source findings: paper trading

| Current control | Problem | Proposed treatment |
| --- | --- | --- |
| First portfolio requires blank name and starting-cash fields | New user must design an account before trying a trade | Prefill editable `Practice portfolio` and LKR 1,000,000 for a fresh setup; show both in a summary, reveal edits with `Configure practice account` |
| Portfolio selector and New button always have toolbar prominence | Secondary management competes with the ticket | Compact active-account context; when multiple portfolios exist keep switching easy, move New under `Manage practice accounts` |
| Company, Buy/Sell and quantity | These are essential choices, not optional complexity | Keep all visible, with company names, `Number of shares` and one-line action help |
| Preview and Confirm shown together before an estimate exists | Disabled Confirm creates a competing action before the user can use it | Show `Review practice trade` as the primary form action; reveal `Confirm practice buy/sell` only once a matching estimate is available |
| Estimate has four stat cards plus five-row fee table | Component-level fees compete with the total a beginner needs | Promote API price/date, total charges and cash effect; expand `Charge breakdown` for individual rates/amounts and `Settlement details` for settlement date |
| Page notice, ticket guide and estimate explanations | Repeated explanations consume space, especially on mobile | One short persistent virtual-money/EOD notice, contextual field help and optional `How practice trades work` details |

Relevant source: `PaperTradingPage.tsx`, `PortfolioScope.tsx`,
`PortfolioSelector.tsx`, `CreatePortfolioForm.tsx`, `OrderTicket.tsx`,
`SymbolPicker.tsx`, `EstimatePanel.tsx`, `useSelectedPortfolio.ts`, `useOrders.ts`.

### Target normal journey

- Existing account: choose company, choose Buy/Sell if needed, enter share count,
  **Review practice trade**, inspect cost/date/context, **Confirm practice trade**.
- New account: one explicit **Create practice account** action with visible setup
  defaults, then the same trading journey. Never create a portfolio automatically
  on page load, auto-submit a trade, or hide which portfolio receives it.
- Preserve the two API-backed review/confirmation actions. Do not add automatic
  estimate requests on every keystroke just to remove a click in this first pass.
- Keep warnings, stale-estimate status, rejections and insufficient cash/holdings
  errors visible. Explain that a preview is not a guaranteed fill.
- All financial figures come from the API. Collapsing a fee table must not trigger
  browser-side recalculation of totals. Existing server fee rules are not editable
  paper-trading configuration; do not invent such controls.
- After editing company, side, quantity or portfolio, confirmation must be unavailable
  until the estimate matches the active request. Test portfolio switching explicitly.
- Preserve synchronous double-submit guards, idempotency keys and safe retry rules.
  Do not change shared portfolio screens accidentally; use route-specific layout
  options where the compact trading context differs from portfolio management.

### Advanced paper-trading workflow

Use the same Simple/Advanced selector, but do not invent a seven-page order wizard
to mirror backtesting. Paper trading has fewer supported inputs.

- **Simple:** compact account context, company/action/quantity, guided review then
  confirm, optional charge and settlement disclosures, disclosed setup defaults.
- **Advanced:** detailed ticket with portfolio switching/creation readily available,
  explicitly editable name/capital during account creation, the full API-backed
  estimate, individual fees, settlement details, and existing order-history access.
- Advanced does not enable custom order fees, limit/stop orders, leverage or other
  capabilities absent from the current paper-trading contract.
- Both views use the same order state and matching-estimate gate. Merely switching
  mode retains a valid estimate; changing an order input or portfolio invalidates it.
  Neither view bypasses review, confirmation, warnings or retry/idempotency rules.

## Implementation sequence on this QA branch

### A. Establish regression evidence

Automated Phase 1 evidence is complete. The next QA work prepares disposable
beginner/experienced account states and records Simple and Advanced paths at
desktop/mobile sizes. Resolve security, session or data-integrity blockers before
sign-off.

### B. Backtesting progressive disclosure

First compact sizing, charge breakdown and rule configuration within existing
sections. Preserve defaults, restored drafts, request mapping and error visibility.
Add focused tests before changing navigation so behavior regressions are separable.

### C. Backtesting navigation reduction

Add the three-screen Simple path alongside the seven-screen Advanced path, move
Simple metrics to optional review content, and retain existing Advanced links.
Implement the workflow selector, shared-draft switching, grouped validation and
routing tests. Compare requests for equivalent drafts in both workflows.

### D. Paper-trading presentation and onboarding

Add Simple and Advanced ticket presentations over shared order state. Simple uses
disclosed setup defaults, compact account context, guided review/confirm and optional
breakdowns; Advanced exposes the existing details. Preserve API sequence and
submit/retry protections. Update all supported translated labels.

### E. Integrated QA and remaining mentor requirements

Complete the journey matrix, chart scrolling/alignment/contrast, radius hierarchy,
public production-build Lighthouse and metadata validation, accessibility and
cross-browser regression. Keep actual before/after reports for evaluation.

## Acceptance checks

- A fresh beginner draft completes the backtest without opening advanced settings
  or visiting execution/capital/metrics as mandatory screens.
- A user can describe what is bought, when it sells, the date range and virtual cash
  from the visible summary. Existing default thresholds are disclosed and editable.
- Every existing supported rule, sizing mode and fee customization remains reachable.
  Closing/reopening, back/forward and reload preserve custom values.
- Advanced retains all seven backtest pages. Switching either direction preserves
  settings, follows the section mapping, and never requires restarting a draft.
- Mode and step indicators, direct URLs, review edits and back/forward navigation
  agree. A restored custom draft remains custom in Simple mode.
- A hidden invalid value opens the correct panel and receives a useful error/focus.
- Identical configurations produce identical request payloads; UI rearrangement
  does not alter fees, execution semantics, order quantities or results.
- Paper trading retains an explicit review followed by confirmation; double-click,
  double Enter, stale preview, portfolio switch and network retry do not duplicate
  orders or submit using stale context.
- Paper-trading mode switching preserves inputs and estimate state without sending
  requests or creating orders; both modes enforce the same submission safeguards.
- New users create accounts explicitly; changing defaults remains possible within
  current backend bounds. Existing accounts are never renamed or reset.
- Test both themes at 360, 768, 1024 and 1440px; verify touch/keyboard disclosures,
  focus, announcements and no unintended page overflow.
- Run a short beginner walkthrough: ask users to explain the summary before clicking
  Run/Confirm. Record confusion and optional-panel discovery, not just click counts.
- Final branch sign-off still requires the parent QA plan's gates. This plan alone
  does not establish usability, Lighthouse scores or complete QA.

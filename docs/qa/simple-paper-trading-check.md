# Simple/Advanced paper-trading validation

Date: 15 September 2026

Branch: `nimesh/frontend-quality-assurance`, worktree `tradeiq-frontend-qa`.

State: uncommitted working-tree implementation, not published CI evidence.

## Boundaries

Simple and Advanced are presentations of the same ticket state, estimate/submit
hooks and API. Backend services, algorithms, contracts, fee rules, Compose and
lockfile are unchanged. No new order types or automatic account/order creation.

Disclosures use the installed BoardUI Button; the mode and Buy/Sell selectors use
the installed React Aria-based segmented control. Editable children stay mounted
across closing/reopening and mode switching. All new labels use the available
English catalogue; Sinhala/Tamil catalogues are not currently implemented.

## Automated evidence

Node 20.20.2 and pnpm 9.15.0, repository-pinned validation toolchain:

| Check | Result |
| --- | --- |
| Frontend lint | Passed, zero warnings |
| Frontend typecheck | Passed |
| Full frontend Vitest | 53 files, 347 tests passed |
| Simple/Advanced paper-trading tests | 18 passed, included in the full suite |
| Production and isolated frontend Docker build | Passed |
| `git diff --check` | Passed |
| Backend/Compose/lockfile diff | Empty |

The new tests cover explicit review/confirmation and unchanged request shapes,
verbatim API money/fees, keyboard disclosures, mode/input/estimate preservation,
portfolio A/B/A invalidation, the actual multi-account selector, symbol/side/raw
quantity changes, late previews, duplicate keyboard reviews, refresh-time submit
blocking, duplicate confirmation, retry-key preservation across modes, default
account creation without configuration, custom setup preservation, client/server
validation of hidden fields, explicit Advanced URLs, and Simple sell requests.
The two usability follow-up tests cover missing-input accessible descriptions,
non-interactive step progression and stale-review reset, plus selected-company
name preservation across modes and removal when the symbol is edited.
Existing paper-trading tests continue covering fills, rejections, error mapping,
cache invalidation, idempotency conflicts and portfolio/session recovery.

Retained warnings: React Router v7 future flags, Recharts zero-size notices in
jsdom, and Vite's existing entry-chunk warning (approximately 587 kB minified).
These checks do not establish Lighthouse, screen-reader or cross-browser passes.

## Targeted Chromium observations

App: `http://localhost:55183`, compiled frontend and isolated QA backend. Only
the frontend container was rebuilt. The database has six securities and short
January 2025 smoke data, not the full production market history.

- The disposable local QA account had no portfolios. The Simple setup visibly
  offered Practice portfolio and LKR 1,000,000, with optional fields closed.
  One explicit Create action reached the ticket and API-backed account context.
- Company-name search, ArrowDown/Enter selection, and Enter from share count
  reached a real estimate without submitting an order. Focus moved to review.
- COMB buy of 10 shares displayed API price LKR 142.72, date 2025-01-10, total
  charges LKR 15.98 and cash effect LKR -1,443.18. A separate explicit confirmation
  filled it; available virtual cash updated to LKR 998,556.82.
- Switching to Advanced kept the same company, quantity and confirmable estimate
  while showing the full fees/settlement and account controls. Switching back
  retained the estimate, without another preview or submission action.
- A separately reviewed/confirmed COMB sell of five shares filled with API cash
  effect LKR +705.61; account cash updated to LKR 999,262.42. No real money or
  exchange orders were involved. Only this disposable QA account was changed.
- Order history showed exactly those two filled QA orders: COMB Buy 10 and Sell 5.
  Existing tabs required reload after compiled frontend container rebuilds to pick
  up the new hashed route chunks; this stack is not a hot-reloading dev server.
- Dark 320px fee disclosure and light 375px checks showed stacked controls.
  Width observations reported matching page/main widths, without page overflow.
  The fee table remains contained; narrow cells can wrap.
- In the final light 375px build, an invalid LKR 1 starting amount was edited,
  hidden and submitted. Setup reopened, focused the number field and marked it
  `aria-invalid="true"`, with the accepted range visible. Page width remained 375px.
  No second practice account was created. Normal viewport and Light theme restored.
- Desktop review exposed that the single Simple action should fill its column and
  account management should align right; those layout adjustments are in the final
  frontend build. Light/dark checks are targeted observations, not the full matrix.

## Compact guided ticket follow-up

The Simple ticket now has a 672px maximum width before review and a 1152px
maximum once review/loading/errors need space. Smaller viewports stack both
cards. Choose / Review / Confirm is an ordered, non-interactive guide using
`aria-current="step"`; it adds no navigation or required action. A polite status
line explains missing company/share inputs, review readiness and pending requests,
and is associated with Review through `aria-describedby`.

Company names come only from the existing search query or a chosen result, not
another detail request. Editing the symbol immediately removes the old company's
description. Closing disclosures and mode switching keep components mounted.
Optional help is last in Simple; Advanced keeps the original top-of-form help.

Targeted Chromium checks in this follow-up:

- Desktop empty ticket is visibly compact and centered; a COMB company-name
  search selects the company and leaves its full name below the symbol.
- Enter from a share count of 10 reaches the API estimate and focuses review;
  the guide advances to Confirm. No confirmation/order was sent in this follow-up.
- Simple / Advanced / Simple preserves the symbol, share count and matching review.
- Dark 320px screenshots show readable stacked ticket and confirmation controls;
  DOM checks report page width 320px with no oversized main descendants.
- Light 375px expanded fee breakdown fits within the page: table width 317px,
  main/page width 375px. Normal viewport and Light theme restored afterward.

The actual buy/sell evidence above belongs to the preceding implementation check.
This follow-up changes presentation only and does not constitute full usability,
accessibility or cross-browser sign-off.

## Still required

Full 360/768/1024/1440 theme matrix; complete keyboard/screen-reader review;
cross-browser and full-dataset journeys; broader session/role/network-state QA;
mentor-requested chart scrolling/alignment/colour/radius checks; public metadata
and retained production Lighthouse reports; beginner usability walkthrough and
parent QA-plan sign-off. No performance score is claimed by this increment.

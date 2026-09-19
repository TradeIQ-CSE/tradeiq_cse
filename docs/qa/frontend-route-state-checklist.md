# Frontend Route and State Checklist

Status: Prepared in Phase 0; execution begins in Phase 2

Baseline commit: `3ec30401803e4caa499bd5b246795a91342720dc`

Mark a box only after the exact route/state has been exercised in the isolated QA
environment. Link screenshots, logs, Lighthouse output, or an issue beside failed
items. Static source inspection does not count as a pass.

## Evidence key

For every route, record:

- browser and version;
- viewport;
- light or dark theme;
- anonymous, empty investor, populated investor, or admin identity;
- expected and actual result;
- console/network errors;
- evidence location or issue number.

The required viewport set is 360x800, 768x1024, 1024x768, and 1440x900. A page
must not overflow horizontally. A chart or table may scroll only inside its own
visible and labelled container.

## Cross-route checks

- [ ] Direct navigation renders the intended route.
- [ ] Hard reload preserves or restores the correct state.
- [ ] Browser back and forward navigation work.
- [ ] Unknown routes redirect to Markets without a loop.
- [ ] No uncaught exception or unhandled promise appears in the console.
- [ ] No unexpected failed request appears in the network log.
- [ ] Shell, sidebar, top bar, and page content do not duplicate or remount visibly.
- [ ] Page-level heading and landmark structure is sensible.
- [ ] Keyboard focus is visible and follows a sensible order.
- [ ] Popovers, menus, drawers, and dialogs stay inside the viewport.
- [ ] Light, dark, and persisted/system theme behavior works without a startup flash.
- [ ] English copy is readable; unavailable Sinhala/Tamil controls are clearly disabled.
- [ ] Loading, empty, error, disabled, refreshing, and success states are not
      communicated by colour alone.
- [ ] 200% zoom and text enlargement do not hide critical actions.
- [ ] Reduced-motion behavior removes unnecessary continuous motion.

## Public routes

### `/` Landing

- [ ] Initial render does not wait for a market-data request.
- [ ] Hero poster appears before the video is ready.
- [ ] Video autoplays muted, loops, and does not require user initiation where the
      browser permits autoplay.
- [ ] Pause/play control is keyboard accessible and accurately labelled.
- [ ] Reduced motion produces a usable stable presentation.
- [ ] Browse CSE, Get started free, Sign in, Create account, How it works, and Test
      a strategy navigate correctly.
- [ ] Static securities preview is labelled as sample/illustrative rather than live.
- [ ] No unsupported live, predictive, or performance claim appears.
- [ ] Layout passes all four viewports in light and dark themes.
- [ ] Title, description, canonical, Open Graph, and Twitter metadata are correct.
- [ ] Lighthouse mobile run 1 records all four category scores.
- [ ] Lighthouse mobile run 2 records all four category scores.
- [ ] Lighthouse mobile run 3 records all four category scores.
- [ ] Lighthouse desktop run records all four category scores.

### `/how-it-works`

- [ ] A beginner can distinguish market research, historical backtesting, and paper
      trading from real-money trading.
- [ ] Page navigation/anchors and primary calls to action work.
- [ ] Capability limitations remain visible and understandable.
- [ ] Layout passes all four viewports in both themes.
- [ ] Keyboard, heading, focus, and contrast checks pass.
- [ ] Route-specific title, description, canonical, Open Graph, and Twitter metadata
      are correct.
- [ ] Product owner decision is recorded for the absent FAQ and About routes.

### `/login`

- [ ] Email and password fields remain readable in light and dark themes.
- [ ] Empty, malformed-email, wrong-password, unavailable-service, and unexpected
      response states are clear and associated with the correct control.
- [ ] Show/hide password works with pointer and keyboard.
- [ ] Keyboard-only login completes successfully.
- [ ] Successful login redirects to the correct application page.
- [ ] Already-authenticated direct navigation behaves intentionally.
- [ ] Layout passes all four viewports in both themes.
- [ ] Route-specific metadata is correct.

### `/signup`

- [ ] Display name, email, password, and confirmation validation are clear.
- [ ] Duplicate account, malformed email, weak/mismatched password, unavailable
      service, and unexpected response states are handled.
- [ ] Keyboard-only signup completes successfully.
- [ ] Signup creates an investor and offers no client-controlled role field.
- [ ] Successful signup redirects correctly and establishes a usable session.
- [ ] Layout passes all four viewports in both themes.
- [ ] Route-specific metadata is correct.

### `/markets`

- [ ] Populated market list shows the API `as_of` date and coverage accurately.
- [ ] Search finds canonical symbols and company names.
- [ ] Sector dropdown contains real options and the unclassified-company case is
      represented intentionally.
- [ ] Sort, page size, pagination, and filter reset work together.
- [ ] Top Movers explains its comparison date and uses readable positive/negative
      colours in both themes.
- [ ] Table headings align with row data at desktop widths.
- [ ] Table is usable at 360px without causing page-level overflow.
- [ ] Initial loading, background refresh, empty result, 4xx, 5xx, and unavailable
      API states are distinct.
- [ ] Financial term help opens by hover and keyboard focus and remains in viewport.
- [ ] Security and index links navigate correctly.
- [ ] Layout passes all four viewports in both themes.
- [ ] Route-specific metadata is correct.

### `/markets/index/:code`

- [ ] Valid ASPI and SL20 codes render canonical data.
- [ ] Unknown index shows a bounded recoverable state.
- [ ] Default, short custom, long custom, and no-data ranges work.
- [ ] Date picker validates and stays in the viewport.
- [ ] Line/volume chart labels and tooltips agree with API values.
- [ ] Loading, empty, validation, 404, 5xx, and retry states are distinct.
- [ ] Layout passes all four viewports in both themes.
- [ ] Dynamic route metadata is correct or the metadata limitation is filed.

### `/markets/:symbol`

- [ ] Valid lowercase URL resolves to the API's canonical symbol.
- [ ] Unknown symbol produces a not-found state rather than indefinite loading.
- [ ] Service failure produces an unavailable state with a working retry action.
- [ ] Security information and unavailable ratios are labelled accurately.
- [ ] Default date range and calendar bounds agree with API coverage.
- [ ] Daily, weekly, and monthly timeframe checks pass.
- [ ] Short, approximately-15-bar, and long horizontally scrollable ranges pass.
- [ ] Candle, volume bar, and date label alignment is preserved after scrolling.
- [ ] Open/high/low/close tooltip values match the selected observation.
- [ ] Missing-open daily data uses the documented close-price fallback rather than
      pretending to be a real candle.
- [ ] Bullish and bearish values remain distinguishable in both themes.
- [ ] Loading, empty, validation, 404, 5xx, and retry states are distinct.
- [ ] Layout passes all four viewports in both themes.
- [ ] Dynamic route metadata is correct or the metadata limitation is filed.

## Authentication and route guards

- [ ] Anonymous direct access to each protected route redirects to `/login`.
- [ ] No authenticated shell flashes before the anonymous redirect.
- [ ] Hard reload restores a valid refresh-cookie session.
- [ ] A failed restore settles anonymously without an uncaught error.
- [ ] A slower failed restore cannot overwrite a newer successful login.
- [ ] Multiple simultaneous guarded 401 responses cause one refresh rotation.
- [ ] Requests retry once with the new access token after refresh.
- [ ] Failed refresh clears the local session and redirects predictably.
- [ ] Rapid sidebar navigation does not cause random logout.
- [ ] Direct URL entry and reload do not cause random logout.
- [ ] Two open tabs do not invalidate a healthy session unexpectedly.
- [ ] Logout clears the local session even if the logout request fails.
- [ ] Browser back after logout does not reveal protected data.
- [ ] Newly signed-up investor cannot see Admin navigation.
- [ ] Newly signed-up investor entering `/admin` directly is redirected to Markets.
- [ ] Newly signed-up investor reloading `/admin` is still denied.
- [ ] Authenticated admin can open `/admin` only when a real admin role is present.

## Authenticated routes

### `/dashboard`

- [ ] Empty investor sees useful onboarding rather than fabricated metrics.
- [ ] Populated investor sees API-backed portfolio and market summaries.
- [ ] Portfolio loading, empty, error, summary error, and retry states work.
- [ ] Market loading, empty, error, and retry states work.
- [ ] Invalid/missing timestamps never throw `RangeError` or blank the page.
- [ ] All next actions navigate correctly.
- [ ] Layout passes all four viewports in both themes.

### `/watchlist`

- [ ] Honest empty/local-only state appears without implying server persistence.
- [ ] Markets action navigates correctly.
- [ ] Reload behavior agrees with the stated persistence boundary.
- [ ] Layout passes all four viewports in both themes.

### `/portfolio`

- [ ] New investor sees the create-portfolio path.
- [ ] Portfolio creation validates name and starting capital.
- [ ] Created portfolio becomes selectable and survives reload through the API.
- [ ] Multiple portfolio selection is reflected in the URL/state intentionally.
- [ ] Summary, positions, cash ledger, and valuation timestamps agree.
- [ ] As-of date behavior is accurate and unavailable-price states are explicit.
- [ ] Delete confirmation and exact target behavior are safe.
- [ ] Loading, empty, 4xx, 5xx, stale selection, and retry states work.
- [ ] Tables remain usable on all four viewports in both themes.

### `/paper-trading`

- [ ] Empty investor is guided to create/select a portfolio.
- [ ] Symbol search uses Market Trading and returns canonical securities.
- [ ] Buy/sell, quantity, execution price, fees, cash effect, and settlement copy are
      understandable to a beginner.
- [ ] Valid estimate and confirm flow succeeds once.
- [ ] Retry/reload around confirmation does not duplicate the order.
- [ ] Insufficient cash, insufficient holdings, invalid quantity, unavailable price,
      stale price, untradable security, transaction limit, and dependency failure
      states are accurately distinguished where supported.
- [ ] Estimate and final accepted/rejected order semantics are not conflated.
- [ ] Layout passes all four viewports in both themes.

### `/orders`

- [ ] Empty state directs the user to paper trading.
- [ ] Filled, rejected, and other supported statuses include text/icons as well as
      colour.
- [ ] Filtering, pagination, and portfolio selection compose correctly.
- [ ] Details drawer opens, traps/restores focus, closes with Escape, and remains in
      viewport.
- [ ] Order, fill, price, fee, quantity, and timestamp values agree with the API.
- [ ] Loading, empty, 4xx, 5xx, and retry states work.
- [ ] Layout passes all four viewports in both themes.

### `/analytics`

- [ ] Analytics appears in normal navigation.
- [ ] Page is clearly a capability guide and does not present invented analytics.
- [ ] Backtest actions navigate to `/backtests/new/security`.
- [ ] Planned analytics language remains visibly subordinate to working features.
- [ ] Layout passes all four viewports in both themes.

### `/ai-insights` and `/reports`

- [ ] Direct routes render honest planned states.
- [ ] Neither route appears in primary navigation or command search.
- [ ] No prediction, report, or performance data is fabricated.
- [ ] Recovery/navigation actions work.
- [ ] Layout passes all four viewports in both themes.

### `/admin`

- [ ] Investor denial checks in the authentication section pass.
- [ ] Admin-only navigation appears only for an actual admin.
- [ ] Admin page contains no enabled operation that lacks an audited backend API.
- [ ] Disabled operations explain their unavailable status.
- [ ] Layout passes all four viewports in both themes.

## Backtesting workflow

### Route and step navigation

- [ ] `/backtests` redirects to `/backtests/new/security`.
- [ ] `/backtests/new` redirects to `/backtests/new/security`.
- [ ] Invalid or out-of-order direct steps do not present an incomplete configuration
      as ready to submit.
- [ ] Browser back/forward preserves a coherent wizard state.
- [ ] Step indicator exposes the active/completed state accessibly.

### Security

- [ ] API-backed search and canonical selection work.
- [ ] Missing, unknown, unavailable, and no-coverage security states are clear.
- [ ] Continue remains disabled until the required selection is valid.

### Period

- [ ] Calendar is bounded by the selected security's data coverage.
- [ ] Missing, reversed, equal, out-of-coverage, and valid ranges are handled.
- [ ] Keyboard date selection and popover dismissal work.

### Rules

- [ ] Beginner default entry/exit rules are understandable.
- [ ] Required, incompatible, invalid percentage, and invalid price states are clear.
- [ ] Multiple exit-rule interaction matches the supported v1 contract.

### Execution

- [ ] Essential assumptions are visible without overwhelming a beginner.
- [ ] Optional sizing/fee/warmup controls are subordinate or collapsed as agreed.
- [ ] Invalid percentage, quantity, and fee values are rejected.

### Capital

- [ ] Starting capital is required, positive, formatted, and explained.
- [ ] Invalid, zero, negative, and valid values are handled.

### Metrics

- [ ] Default metrics are selected and explained.
- [ ] Empty selection is rejected.
- [ ] No metric implies prediction or guaranteed performance.

### Review and run

- [ ] Review reflects the exact submitted configuration.
- [ ] Incomplete direct review cannot be submitted.
- [ ] Submit is idempotent from the user's perspective.
- [ ] Queued, running, completed, and failed states are distinct.
- [ ] Completed result survives direct reload of `/backtests/:runId/status`.
- [ ] Failed run shows the API failure reason when available.
- [ ] Unknown/unauthorized run is handled without indefinite loading.
- [ ] Equity curve, metrics, and trades agree with the returned result.
- [ ] Historical simulation limitations remain prominent.
- [ ] Essential workflow passes at 360px and 1440px in both themes.

## Final cross-browser checklist

- [ ] Chromium complete matrix is signed off.
- [ ] Safari/WebKit public navigation, login, date picker, menu, chart scroll, and
      paper-order smoke pass.
- [ ] Firefox equivalent smoke pass after Firefox becomes available.
- [ ] All P0 and P1 regressions are rerun in their original conditions.
- [ ] Final evidence references the exact tested commit and GitHub Actions run.

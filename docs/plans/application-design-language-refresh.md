# TradeIQ Application Design Language Refresh

Status: Stages 1–6 implemented; authenticated visual QA remains for Stages 4–6
Reference implementation: the refreshed landing page and current Markets page
Working branch: `nimesh/frontend-improvements`

## Objective

Carry the landing page's sophisticated, trustworthy, blue/navy design language through the TradeIQ application without turning data-heavy screens into decorative marketing pages.

The result should feel like one product from first visit through research, simulation, and portfolio review. It must preserve API behavior, authentication, calculations, routes, and explicit data limitations.

## Design contract

The following qualities become application-wide:

- confident, readable typography with clear page and section hierarchy;
- semantic blue/navy light and dark themes with the existing theme preference behavior;
- rounded geometry, restrained borders, and soft depth;
- the TradeIQ mark, BoardUI buttons, inputs, selects, calendars, menus, tables, chips, and accessible interaction states;
- plain-language explanations for unfamiliar financial concepts;
- deliberate loading, refreshing, empty, error, disabled, accepted, and rejected states;
- subtle motion only where it explains state, with reduced-motion support.

Glass and gradients are selective, not universal:

- use the landing-style atmospheric background as a quiet, non-animated application backdrop;
- use translucent or glass treatment for the shell, page introductions, summary groups, onboarding, and modal surfaces;
- keep tables, charts, order forms, calendars, and long-reading surfaces substantially opaque for contrast, performance, and accurate data reading;
- do not add video, animated aurora layers, blur stacks, or continuous decorative animation inside the authenticated application.

Green and red remain reserved for positive and negative financial meaning. Blue remains the brand, action, focus, and selection color.

## Current-state findings

### Already close to the target

- Landing and How It Works establish the desired brand, theme, glass, content, and responsive direction.
- Markets already uses the shared shell, semantic tokens, BoardUI buttons/chips/segmented controls, API-backed securities, sector icons, and explicit EOD messaging.
- Authentication already uses BoardUI form primitives and the real authentication contract.
- Portfolio, orders, and paper trading already preserve the real API contract and use semantic colors, but several presentation primitives are feature-local copies.
- Stage 1 now provides the shared static backdrop, responsive React Aria navigation drawer, BoardUI top bar, and reusable application surface patterns.
- Backtesting now uses the shared application surfaces and BoardUI controls across its seven-step workflow, status polling, and persisted results view.

### Remaining review and product boundaries

- Backtesting, Dashboard, Watchlist, Analytics, and Admin now use the shared BoardUI-first application hierarchy; authenticated browser review still needs valid non-production test accounts.
- AI Insights and Reports remain honest direct-link planned states and are excluded from the sidebar and command palette until supporting product and API contracts exist.
- Persistent watchlists, broad portfolio analytics, AI insights, reports, and administrative operations remain separate product/API work rather than simulated frontend capabilities.

## Scope by stage

### Stage 1: Shared application frame

Status: completed on `nimesh/frontend-improvements`.

- [x] Derive a static, low-cost application backdrop from the landing palette for both themes.
- [x] Refine the sidebar and top bar as the universal frame: spacing, responsive drawer, page search, breadcrumb behavior, profile state, language controls, and theme control.
- [x] Replace the remaining Ant Design shell dependencies with BoardUI-compatible primitives and Remix icons.
- [x] Add shared page-introduction, panel, stat, toolbar, loading, error, empty, and notice patterns.
- [x] Define a content-width policy: fluid for tables/charts, constrained for forms and reading pages.
- [x] Ensure the shell remains mounted once across all public and authenticated application routes.

### Stage 2: Markets and security research

Markets remains the first reference screen.

Status: completed on `nimesh/frontend-improvements`.

- [x] Finish BoardUI filters, calendars, menus, Top Movers semantics, responsive table behavior, and data-freshness presentation.
- [x] Keep securities, overview, sector, sorting, pagination, and `as_of` behavior API-backed.
- [x] Apply the same visual hierarchy to security detail.
- [x] Replace the security-detail date fields with a BoardUI date-range picker while preserving API range validation.
- [x] Refine the candlestick chart shell, timeframe controls, tooltip, legend, empty/error states, and mobile layout.
- [x] Keep reusable CSE sector symbols consistent across Markets and security detail, ready for the same shared component in holdings, orders, and symbol search during Stage 3.

### Stage 3: Portfolio, paper trading, and orders

Status: completed on `nimesh/frontend-improvements`.

Portfolio:

- [x] Use BoardUI stat cards for equity, cash, holdings, and P&L.
- [x] Use the same date picker and as-of language as Markets.
- [x] Refine portfolio selection/creation, positions, cash ledger, and mobile table behavior.
- [x] Make valuation timestamps and unavailable-price states prominent and understandable.

Paper trading:

- [x] Create a focused order workspace with a clear input side and stable estimate side.
- [x] Use BoardUI Input, Select or segmented controls, symbol search, cards, notices, and buttons.
- [x] Preserve estimate-before-confirm, idempotency, pending, filled, rejected, stale-estimate, and dependency-unavailable behavior.
- [x] Explain “Buy,” “Sell,” quantity, last-close execution, fees, cash effect, and settlement in plain language.

Orders:

- [x] Use a shared BoardUI data table and status chips.
- [x] Add clear filtering, pagination, filled/rejected explanations, and an order-detail drawer.
- [x] Keep status meaning in text and icons as well as color.

### Stage 4: Historical backtesting

Status: implemented on `nimesh/frontend-improvements`; authenticated browser review remains pending.

- [x] Replace the isolated backtesting CSS system with semantic tokens and BoardUI primitives.
- [x] Keep the existing seven-step domain workflow and validation rules.
- [x] Rebuild the step indicator, API-backed security search, period calendar, rule builder, execution assumptions, portfolio inputs, metrics selection, review, run status, and persisted results hierarchy.
- [x] Explain each concept for first-time users and distinguish historical simulation from prediction.
- [x] Keep backtest API calls and result states intact; do not imply future performance.

### Stage 5: Dashboard, Watchlist, Analytics, and authentication

Status: implemented on `nimesh/frontend-improvements`; authentication was reviewed in both themes and at desktop/mobile widths, while authenticated console review remains pending.

Dashboard:

- [x] Remove fixture candlesticks and unsupported “real-time” claims.
- [x] Compose only API-backed portfolio and market summaries that already exist.
- [x] Otherwise show useful onboarding and next actions rather than invented metrics.

Watchlist:

- [x] Present an honest empty state until persistence exists.
- [x] Do not imply that the current local Markets star state is synced across sessions unless an API contract is added separately.

Analytics:

- [x] Treat as a capability guide or clear planned state until real analytics endpoints exist.
- [x] Do not fabricate performance, risk, benchmark, or prediction values.

Authentication:

- [x] Retain the current BoardUI form controls and API behavior.
- [x] Align its background, branding, typography, and trust copy with the landing page.
- [x] Preserve exact validation and session-loss behavior.

### Stage 6: Admin, planned features, and cleanup

Status: implemented on `nimesh/frontend-improvements`; authenticated browser review remains pending.

- [x] Refresh Admin with the shared application hierarchy and disabled, capability-aware controls because audited admin operation endpoints do not exist.
- [x] Give AI Insights and Reports consistent, honest direct-link planned states and remove them from primary sidebar and command-palette discovery.
- [x] Promote the financial direction and signed-value tone presentation shared by Dashboard and paper-trading screens into application-level components.
- [x] Remove Ant Design, its provider/theme adapters, the obsolete compatibility stylesheet, and verified-unused legacy SVG icons after repository-wide consumer checks.
- [x] Remove fixture data from product routes; retain fixtures only in tests and the explicitly static landing-page preview.

## Responsive and accessibility scope

Review every functional route at approximately 360, 768, 1024, and 1440 pixels.

- Sidebar becomes an accessible mobile drawer without layout jumps.
- Toolbars wrap in a deliberate order and keep primary actions visible.
- Tables scroll or transform without hiding labels or values.
- Forms become one column before controls become cramped.
- Popovers remain inside the viewport and support keyboard dismissal.
- Every form control has a visible or programmatic label.
- Focus, hover, selected, disabled, loading, and error states are visible in both themes.
- Normal text and financial values meet WCAG AA contrast.

## Performance boundaries

- No landing video on application routes.
- No continuously animated application background.
- Avoid large blur regions behind scrolling tables and charts.
- Keep routes lazy-loaded and avoid pulling chart code into routes that do not render charts.
- Preserve React Query caching and background-refetch behavior.
- Measure the production bundle after each stage; treat new shared-chunk growth as a review item.

## Data and product boundaries

- Do not change backend contracts as part of the visual refresh.
- Do not replace API-backed application data with hardcoded values.
- Do not reintroduce a landing-page request; its preview intentionally remains hardcoded.
- Clearly label EOD/as-of timestamps and simulation assumptions.
- Never describe sample, delayed, historical, paper, or planned behavior as live trading.
- New functionality discovered during implementation becomes a separate product/API issue rather than hidden redesign scope.

## Validation per stage

- TypeScript, ESLint, focused tests, full frontend tests, production build, and diff check.
- Browser review in light and dark themes at desktop and mobile widths.
- Keyboard review of navigation, dialogs, dropdowns, calendars, forms, tables, and wizards.
- API review against healthy `market-trading` and `identity-auth` services, including populated, empty, error, and session-loss states.
- Confirm no fixture or unsupported metric appears on a product route.

## Recommended implementation order

1. Shared frame and reusable page/surface patterns.
2. Markets completion and security detail.
3. Portfolio, paper trading, and orders as one connected workflow.
4. Backtesting workflow and results.
5. Dashboard, Watchlist, Analytics, and authentication.
6. Admin/planned states, Ant Design removal, and final cleanup.

Each stage should be independently reviewable and keep the application functional. Do not migrate all routes in one change.

## Definition of done

- A user moving from landing to Markets, portfolio, paper trading, orders, and backtesting experiences one coherent product.
- Every working screen uses the shared semantic light/dark system and BoardUI-first components.
- Financial data remains readable, labeled, timestamped, and API-backed.
- First-time users can understand what each workflow does and what it does not do.
- Desktop and mobile layouts are usable without clipped controls or unlabeled values.
- No product route contains hardcoded theme colors, decorative purple styling, unsupported claims, or fixture market/account data.
- Remaining planned features are explicitly identified as planned and visually subordinate to working capabilities.

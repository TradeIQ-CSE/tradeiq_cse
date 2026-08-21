# W1 — Frontend Scaffold: Change Plan (Ant Design)

> Working repo: `tradeiq_cse` monorepo · Frontend package: `frontend/`
> (pnpm workspace declares `frontend`; the root `apps/` dir is empty/unused)

This document lists the exact changes required to implement the W1 frontend
scaffold spec using **Ant Design** as the UI layer. Every standard UI element
(Button, Card, Table, Menu, Drawer, Select, Dropdown, Avatar, Tag, Statistic,
Progress, Tabs, DatePicker, Layout/Sider/Header/Content) comes from AntD. Custom
CSS is limited to TradeIQ-specific layout/chart needs.

## Confirmed: Ant Design is the UI foundation

| Responsibility | Library |
| --- | --- |
| UI components + design system + dark theme | `antd` + `@ant-design/icons` |
| Routing / navigation | `react-router-dom` (already installed) |
| Server state (data fetching) | `@tanstack/react-query` |
| Charts / visualization | `recharts` |

AntD does **not** replace routing or data. React Router picks the page, AntD
renders the chrome + controls, TanStack Query fetches API state, Recharts draws
financial charts.

---

## Current state (baseline)

- `frontend/package.json` deps: `react`, `react-dom`, `react-router-dom` only.
- `frontend/src/main.tsx`: `BrowserRouter` → `<App />`.
- `frontend/src/App.tsx`: stub `Routes` with `/` and `/admin`.
- `frontend/src/routes/index.tsx`: two stub components returning plain `<div>`s.
- No theme, no layout shell, no pages, no fixture data, no utils, no charts.

## Target folder structure

```
frontend/src/
├── App.tsx                      # route tree via AppRoutes
├── main.tsx                     # ConfigProvider > QueryClientProvider > App
├── theme/theme.ts               # centralized AntD dark theme tokens
├── routes/AppRoutes.tsx         # lazy route tree (replace routes/index.tsx stubs)
├── components/
│   ├── layout/AppShell.tsx      # Layout: Sider + Header + Content(Outlet)
│   ├── layout/Sidebar.tsx       # Menu (6 items + icons), profile, lang selector
│   ├── layout/Topbar.tsx        # Header content, mobile menu trigger
│   └── charts/CandlestickChart.tsx  # reusable Recharts candlestick wrapper
├── pages/
│   ├── investor/Dashboard.tsx
│   ├── investor/Markets.tsx
│   ├── investor/Watchlist.tsx
│   ├── investor/Portfolio.tsx
│   ├── investor/Orders.tsx
│   ├── investor/Analytics.tsx
│   └── admin/AdminHome.tsx
├── data/fixtures/
│   ├── ohlc.ts                 # OHLC for CandlestickChart demo
│   ├── market.ts               # market snapshot (Markets, Watchlist)
│   └── portfolio.ts            # portfolio summary + holdings (Dashboard, Portfolio)
└── utils/
    ├── format.ts               # formatLKR, formatSigned, formatPercentage
    └── trend.ts                # classifyTrend
```

---

## Change list (file by file)

### 1. `frontend/package.json` — dependencies
- Add `antd`, `@ant-design/icons`, `recharts`, `@tanstack/react-query`.
- Keep `react`, `react-dom`, `react-router-dom`.

### 2. `frontend/src/theme/theme.ts` — NEW
- `ConfigProvider` theme object using `theme.darkAlgorithm`.
- Centralized tokens: primary color, backgrounds (container / elevated), text
  colors, border radius, sidebar bg, menu colors, header bg.
- Single source of truth — components import tokens, never hard-code colors.

### 3. `frontend/src/main.tsx` — REWRITE
- Provider nesting per spec:
  `<ConfigProvider theme={tradeIQTheme}>` → `<QueryClientProvider>` → `<App/>`.
- Create `QueryClient` (TanStack Query) at module scope.
- Keep `BrowserRouter` and `StrictMode`.

### 4. `frontend/src/App.tsx` — REWRITE
- Replace stub `Routes` with `<AppRoutes />`.
- All investor routes render inside `<AppShell>`; `/admin` renders in shell too.

### 5. `frontend/src/routes/AppRoutes.tsx` — NEW (replaces `routes/index.tsx`)
- Remove `routes/index.tsx` stubs.
- Lazy-load pages with `React.lazy` (retain code splitting):
  - `/dashboard`, `/markets`, `/watchlist`, `/portfolio`, `/orders`, `/analytics`, `/admin`.
- `<Route element={<AppShell />}>` wraps the 6 investor routes + `/admin`.

### 6. `frontend/src/components/layout/AppShell.tsx` — NEW
- AntD `Layout` with `Sider` (desktop) + inner `Layout` (`Header` + `Content`).
- `Content` renders `<Outlet />`.
- Responsive behavior: `Grid.useBreakpoint()`; below ~768px (md) the Sider
  collapses to an AntD `Drawer` opened from the Topbar hamburger.

### 7. `frontend/src/components/layout/Sidebar.tsx` — NEW
- AntD `Menu` (dark) with 6 items + icons:
  Dashboard→`DashboardOutlined`, Markets→`StockOutlined`, Watchlist→`StarOutlined`,
  Portfolio→`PieChartOutlined`, Orders→`ShoppingOutlined`, Analytics→`LineChartOutlined`.
- `selectedKeys` derived from `useLocation()` so active item matches URL.
- `onClick` → `navigate`; on mobile, close the Drawer after navigation.
- Bottom profile section: AntD `Avatar` + `Dropdown` (Profile / Settings / Logout
  placeholder) showing "K  Krishna · Investor".
- Language selector: AntD `Select` with `EN / සිංහල / தமிழ்` + local state.

### 8. `frontend/src/components/layout/Topbar.tsx` — NEW
- AntD `Header`: hamburger (mobile), page title / breadcrumb, language selector,
  profile trigger. No horizontal overflow.

### 9. `frontend/src/components/charts/CandlestickChart.tsx` — NEW
- Pure Recharts component, no AntD inside.
- Prop-driven: `<CandlestickChart data={ohlcData} />`.
- Composition chart (candles + volume) so it can be reused later in Markets /
  Stock details / Analytics / Backtesting / Paper trading.

### 10. Pages — `frontend/src/pages/investor/*.tsx` + `admin/AdminHome.tsx`
- **Dashboard**: responsive `Row`/`Col` + `Card` + `Statistic` + `Tag`
  (Portfolio Value LKR 1,250,000 · Today's P&L +LKR 12,500 · Market Value
  LKR 980,000 · Positions 12). Grid collapses 4 → 2 → 1 across breakpoints.
- **Markets**: AntD `Table` (Symbol, Name, Price, Change, Change %, Volume) with
  green/red `Tag`s for gains/losses. Fixture data.
- **Watchlist**: `Card` + `Table` + `Tag` + `Button` (tracked securities,
  action column placeholder).
- **Portfolio**: `Card` + `Statistic` (Total Value, Today's P&L, Cash, Invested)
  + `Progress` + holdings `Table` with per-row P&L.
- **Orders**: `Table` (Order ID, Symbol, Side, Quantity, Price, Status, Date);
  BUY→green / SELL→red `Tag`s; Pending / Executed / Cancelled status `Tag`s.
- **Analytics**: `Card` + `Tabs` + `Select` + `DatePicker` (AntD chrome) wrapping
  Recharts line/area performance chart + `CandlestickChart`.
- **AdminHome**: AntD-based admin placeholder (Card + Statistic/Table), replaces
  the current stub.

### 11. `frontend/src/data/fixtures/*.ts` — NEW
- `ohlc.ts`: daily OHLC series for the candlestick demo.
- `market.ts`: market snapshot rows (COMB, JKH, LOLC, …) for Markets/Watchlist.
- `portfolio.ts`: portfolio summary + holdings for Dashboard/Portfolio.
- UI consumes fixtures now; later swap to TanStack Query hooks against FastAPI
  without rewriting components (keeps same shapes/types).

### 12. `frontend/src/utils/format.ts` — NEW
- `formatLKR(n)` → `LKR 1,250,000` (spec suggests "Rs." style formatting utility).
- `formatSigned(n)`, `formatPercentage(n)` → `+2.31%`.

### 13. `frontend/src/utils/trend.ts` — NEW
- `classifyTrend(n)` → `positive | negative | flat`; drives Tag color logic.

### 14. `frontend/src/theme/*.css` / `frontend/src/*.css` — minimal custom CSS
- Only TradeIQ-specific needs: chart sizing, special dashboard spacing, brand
  touches, responsive padding. No re-implementation of AntD components.

### 15. Root-level validation
- `pnpm install` at monorepo root to lock `antd`, `recharts`, `@tanstack/react-query`.
- Run and pass: `pnpm lint` · `pnpm typecheck` · `pnpm build`.

---

## Acceptance mapping

| Acceptance criterion | How it is met |
| --- | --- |
| Shell renders at ≥360px without horizontal scroll | AntD `Layout` + `Grid.useBreakpoint()` → Drawer nav < md (768px); fluid `Content` |
| Chart wrapper demos with fixture data | `CandlestickChart` fed by `data/fixtures/ohlc.ts` on Analytics/Markets |
| AntD used as the UI foundation | Every standard component sourced from `antd`; custom CSS only for TradeIQ-specific layout/chart/brand |
| Dark theme matches Figma | Centralized `theme/theme.ts` dark tokens via `ConfigProvider` |
| LKR "Rs." formatting util | `utils/format.ts` (`formatLKR`) |
| Green/red reserved for gains/losses | `classifyTrend` + AntD `Tag` colors |
| React Router routing | `AppRoutes.tsx` lazy routes inside `AppShell` |
| TanStack Query for data fetching | `QueryClientProvider` in `main.tsx`; fixtures later replaced by query hooks |

## Implementation order (from spec)
1. Install AntD + icons
2. Theme (`theme.ts`, dark algorithm)
3. Providers in `main.tsx`
4. `AppShell`
5. `Sidebar` (menu, icons, profile, language)
6. Mobile nav (`Drawer` + `useBreakpoint`)
7. Routing (`AppRoutes.tsx`)
8. Pages (Dashboard → Markets → Watchlist → Portfolio → Orders → Analytics → Admin)
9. Fixture data
10. Utils (`format.ts`, `trend.ts`)
11. Recharts (`CandlestickChart`, Analytics charts)
12. Validate: `pnpm lint` / `pnpm typecheck` / `pnpm build`

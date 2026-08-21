# Frontend Scaffold Changes Summary

This document summarizes all the modifications, new files, and layout alignments implemented in the `frontend/` package to satisfy the W1 frontend scaffold requirements using **Ant Design** and **Recharts**, matching the Figma design (`Figma/Market.png`).

---

## 📁 1. New Utility & Fixture Files

We created the following files to support formatting, classification, and mock data:

*   **`frontend/src/utils/format.ts`**:
    *   `formatLKR(n)`: Formats numbers as Sri Lankan Rupees (e.g. `Rs. 1,250,000.00`).
    *   `formatSigned(n)`: Formats values with explicit `+` or `-` indicators (e.g. `+14.50`).
    *   `formatPercentage(n)`: Formats numbers as percentages with sign markers (e.g. `+1.22%`).
*   **`frontend/src/utils/trend.ts`**:
    *   `classifyTrend(n)`: Classifies changes as `positive`, `negative`, or `flat` to drive tag colored indicators (gains/losses).
*   **`frontend/src/data/fixtures/market.ts`**:
    *   Mock dataset of 12 CSE securities (symbol, name, sector, cap category, price, price change, percentage change, volume, and P/E) matching the values in the Figma design.
*   **`frontend/src/data/fixtures/ohlc.ts`**:
    *   Mock daily Open, High, Low, Close (OHLC) price series for candlestick plotting.

---

## 🧱 2. New Reusable Visual & Layout Components

We created the visual scaffold shell, custom charts, and headers:

*   **`frontend/src/components/charts/CandlestickChart.tsx`**:
    *   Composed Recharts element displaying daily candlesticks (wick and body SVG shapes) and corresponding trading volume bars aligned to the bottom. Includes custom tooltips.
*   **`frontend/src/components/layout/AppShell.tsx`**:
    *   Master layout manager wrapper. Detects viewports under `768px` and replaces the desktop Sider sidebar with a slide-out drawer menu.
*   **`frontend/src/components/layout/Sidebar.tsx`**:
    *   Renders grouped menu items mapping the Figma sections (*MARKETS*, *MY PORTFOLIO*, *TRADING*, *ANALYSIS*, *UTILITIES*), custom language selectors, and the user profile card for `Nimesh`.
*   **`frontend/src/components/layout/Topbar.tsx`**:
    *   Header toolbar containing search, breadcrumb navigation, and a violet **AI Assistant** action button.

---

## 🧭 3. Routing & Entry Point Updates

Reconfigured the routing layout to enable split-code lazy-loading:

*   **`frontend/src/routes/AppRoutes.tsx`** [NEW]:
    *   Sets up lazy-loaded views and wraps them inside the common `AppShell` container. Redirects default route `/` to `/markets` to match Figma.
*   **`frontend/src/App.tsx`** [REWRITTEN]:
    *   Updated to mount the new `<AppRoutes />` tree.
*   **`frontend/src/routes/index.tsx`** [CLEANED]:
    *   Cleaned up old stub routes to prevent compilation/lint errors.

---

## 🎨 4. Theme & Aesthetic Alignments (Figma Match)

To align with the Figma design frame (`node-id=52-625`):

*   **`frontend/src/theme/theme.ts`** [UPDATED]:
    *   Set primary brand and info color to violet/purple (`#722ed1`).
    *   Darkened background colors to `#0a0d14` and sidebar menu background to `#0b0e13`.
    *   Added custom component-level configurations for the AntD `Menu` (group headers) and `Table` (making containers transparent and borderless, removing vertical splits, and using `#1c2434` dividers).
*   **`frontend/src/pages/investor/Markets.tsx`** [UPDATED]:
    *   High-fidelity list view containing segmented tabs (All/Gainers/Losers/Most Active) and selects.
    *   Table columns match the Figma grid exactly.
    *   Clicking on a security symbol slides open a detailed drawer rendering the **Recharts CandlestickChart** with daily OHLC data.
*   **`frontend/index.html`** [UPDATED]:
    *   Added HTML `<style>` block resetting default body margins to `0` and background to `#0a0d14` to prevent white margins.
    *   Added CSS to hide browser scrollbars on the left sidebar Sider.

---

## ⏹️ 5. Stateless Scaffold Button Stubs

All pages other than **Markets** have been stripped of datasets and functions, keeping only titles and action buttons as requested:

*   **`frontend/src/pages/investor/Dashboard.tsx`**: Title + navigation buttons.
*   **`frontend/src/pages/investor/Watchlist.tsx`**: Title + mock watchlist action buttons.
*   **`frontend/src/pages/investor/Portfolio.tsx`**: Title + deposit/withdrawal buttons.
*   **`frontend/src/pages/investor/Orders.tsx`**: Title + buy/sell action buttons.
*   **`frontend/src/pages/investor/Analytics.tsx`**: Title + chart loading placeholder buttons.
*   **`frontend/src/pages/admin/AdminHome.tsx`**: Title + system action buttons.

---

## 🎨 6. Ant Design Component Usage Map

The table below catalogs which Ant Design layout models, display controls, and icon components are loaded across our scaffold codebase:

| File / Component | Ant Design Components Used | Icons Used (`@ant-design/icons`) |
| --- | --- | --- |
| **`main.tsx`** | `ConfigProvider` | *None* |
| **`AppShell.tsx`** | `Layout`, `Sider`, `Content`, `Drawer`, `Grid` (breakpoints) | *None* |
| **`Sidebar.tsx`** | `Menu`, `Avatar`, `Dropdown`, `Segmented`, `Typography` | `StockOutlined`, `StarOutlined`, `PieChartOutlined`, `ShoppingOutlined`, `ShoppingCartOutlined`, `LineChartOutlined`, `ThunderboltOutlined`, `FileTextOutlined`, `UserOutlined`, `SettingOutlined`, `LogoutOutlined`, `ArrowRightOutlined` |
| **`Topbar.tsx`** | `Layout` (Header), `Button`, `Input`, `Breadcrumb`, `Space` | `MenuOutlined`, `ThunderboltOutlined`, `SearchOutlined` |
| **`Markets.tsx`** | `Table`, `Space`, `Button`, `Select`, `Typography`, `Drawer`, `Statistic`, `Tag`, `Row`, `Col` | `PlusOutlined`, `CheckOutlined`, `AreaChartOutlined` |
| **`Dashboard.tsx`** | `Space`, `Typography`, `Button` | *None* |
| **`Watchlist.tsx`** | `Space`, `Typography`, `Button` | *None* |
| **`Portfolio.tsx`** | `Space`, `Typography`, `Button` | *None* |
| **`Orders.tsx`** | `Space`, `Typography`, `Button` | *None* |
| **`Analytics.tsx`** | `Space`, `Typography`, `Button` | *None* |
| **`AdminHome.tsx`** | `Space`, `Typography`, `Button` | *None* |


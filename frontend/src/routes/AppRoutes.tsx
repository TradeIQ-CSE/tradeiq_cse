import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { Spin } from "antd";

// Lazy loaded page components to support code-splitting
const Dashboard = React.lazy(() => import("../pages/investor/Dashboard"));
const Markets = React.lazy(() => import("../pages/investor/Markets"));
const Watchlist = React.lazy(() => import("../pages/investor/Watchlist"));
const Portfolio = React.lazy(() => import("../pages/investor/Portfolio"));
const Orders = React.lazy(() => import("../pages/investor/Orders"));
const Analytics = React.lazy(() => import("../pages/investor/Analytics"));
const AdminHome = React.lazy(() => import("../pages/admin/AdminHome"));

const PageLoader = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "calc(100vh - 120px)",
    }}
  >
    <Spin size="large" />
  </div>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Pages rendered inside the core application layout */}
        <Route element={<AppShell />}>
          {/* Default land is markets to match the active state in Figma */}
          <Route path="/" element={<Navigate to="/markets" replace />} />
          
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/orders" element={<Orders />} />
          
          {/* Paper Trading points to Orders view to simulate trading logs */}
          <Route path="/paper-trading" element={<Orders />} />
          
          <Route path="/analytics" element={<Analytics />} />
          
          {/* AI Insights points to Analytics view */}
          <Route path="/ai-insights" element={<Analytics />} />
          
          {/* Reports points to Admin Dashboard view */}
          <Route path="/reports" element={<AdminHome />} />
          
          <Route path="/admin" element={<AdminHome />} />
        </Route>

        {/* Fallback routing */}
        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Routes>
    </Suspense>
  );
}
export default AppRoutes;

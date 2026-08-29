import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

const LandingPage = lazy(() =>
  import('../features/landing/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
);
const MarketsPage = lazy(() =>
  import('../features/markets/MarketsPage').then((module) => ({
    default: module.MarketsPage,
  })),
);
const Dashboard = lazy(() => import('../pages/investor/Dashboard'));
const Watchlist = lazy(() => import('../pages/investor/Watchlist'));
const Portfolio = lazy(() => import('../pages/investor/Portfolio'));
const Orders = lazy(() => import('../pages/investor/Orders'));
const Analytics = lazy(() => import('../pages/investor/Analytics'));
const AdminHome = lazy(() => import('../pages/admin/AdminHome'));

function LoadingFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
      Loading view…
    </div>
  );
}

function ConsoleRoute({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

function PlannedFeature({ title }: { title: string }) {
  return (
    <div style={{ color: '#e2e8f0' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600 }}>{title}</h1>
      <p style={{ color: '#90a1b9' }}>
        This interface is planned and is not available in the current build.
      </p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route
          path="/dashboard"
          element={
            <ConsoleRoute>
              <Dashboard />
            </ConsoleRoute>
          }
        />
        <Route
          path="/watchlist"
          element={
            <ConsoleRoute>
              <Watchlist />
            </ConsoleRoute>
          }
        />
        <Route
          path="/portfolio"
          element={
            <ConsoleRoute>
              <Portfolio />
            </ConsoleRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ConsoleRoute>
              <Orders />
            </ConsoleRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ConsoleRoute>
              <Analytics />
            </ConsoleRoute>
          }
        />
        <Route
          path="/paper-trading"
          element={
            <ConsoleRoute>
              <PlannedFeature title="Paper Trading" />
            </ConsoleRoute>
          }
        />
        <Route
          path="/ai-insights"
          element={
            <ConsoleRoute>
              <PlannedFeature title="Machine Learning Insights" />
            </ConsoleRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ConsoleRoute>
              <PlannedFeature title="Reports" />
            </ConsoleRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ConsoleRoute>
              <AdminHome />
            </ConsoleRoute>
          }
        />
        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Routes>
    </Suspense>
  );
}

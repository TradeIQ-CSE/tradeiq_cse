import { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { RequireAuth } from '../auth/RequireAuth';
import { useAuth } from '../auth/useAuth';

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
const LoginPage = lazy(() =>
  import('../features/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
);
const SignupPage = lazy(() =>
  import('../features/auth/SignupPage').then((module) => ({
    default: module.SignupPage,
  })),
);
const Dashboard = lazy(() => import('../pages/investor/Dashboard'));
const Watchlist = lazy(() => import('../pages/investor/Watchlist'));
const Portfolio = lazy(() => import('../pages/investor/Portfolio'));
const Orders = lazy(() => import('../pages/investor/Orders'));
const Analytics = lazy(() => import('../pages/investor/Analytics'));
const AdminHome = lazy(() => import('../pages/admin/AdminHome'));
const BacktestWizard = lazy(() =>
  import('../features/backtesting/components/BacktestWizard').then((module) => ({
    default: module.BacktestWizard,
  })),
);
const StatusStep = lazy(() =>
  import('../features/backtesting/components/StatusStep').then((module) => ({
    default: module.StatusStep,
  })),
);

function LoadingFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
      Loading view…
    </div>
  );
}

// Every console route needs a live session, so the guard lives here once
// rather than being repeated at each <Route> below.
//
// An anonymous visitor gets the redirect without the shell: mounting AppShell
// around it would flash the sidebar and topbar of a signed-in console at
// someone who is on their way to /login. While restoring, the shell does mount
// — that visitor most likely has a valid refresh cookie, and keeping it
// mounted across restoring -> authenticated avoids tearing it down and
// rebuilding it a moment later.
//
// Not covered by a test: <Navigate> redirects from an effect, and RTL's
// render() flushes effects inside act(), so the shell is already gone before
// any assertion can run. The frame this avoids exists only in a real browser,
// which paints between commit and effect.
function ConsoleRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'anonymous') {
    return <RequireAuth>{children}</RequireAuth>;
  }

  return (
    <AppShell>
      <RequireAuth>{children}</RequireAuth>
    </AppShell>
  );
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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
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
        <Route path="/backtests" element={<Navigate to="/backtests/new/security" replace />} />
        <Route path="/backtests/new" element={<Navigate to="/backtests/new/security" replace />} />
        <Route
          path="/backtests/new/:step"
          element={
            <ConsoleRoute>
              <BacktestWizard />
            </ConsoleRoute>
          }
        />
        <Route
          path="/backtests/:runId/status"
          element={
            <ConsoleRoute>
              <StatusStep />
            </ConsoleRoute>
          }
        />
        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Routes>
    </Suspense>
  );
}

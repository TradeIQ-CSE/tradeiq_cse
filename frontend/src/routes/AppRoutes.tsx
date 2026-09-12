import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { PageState } from '../components/application/layout/application-layout';
import { RequireAuth } from '../auth/RequireAuth';
import { RequireAdmin } from '../auth/RequireAdmin';
import { useAuth } from '../auth/useAuth';
import { useTranslation } from 'react-i18next';

const LandingPage = lazy(() =>
  import('../features/landing/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
);
const HowItWorksPage = lazy(() =>
  import('../features/landing/HowItWorksPage').then((module) => ({
    default: module.HowItWorksPage,
  })),
);
const MarketsPage = lazy(() =>
  import('../features/markets/MarketsPage').then((module) => ({
    default: module.MarketsPage,
  })),
);
const SecurityDetailPage = lazy(() =>
  import('../features/markets/SecurityDetailPage').then((module) => ({
    default: module.SecurityDetailPage,
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
const Portfolio = lazy(() =>
  import('../features/paper-trading/PortfolioPage').then((module) => ({
    default: module.PortfolioPage,
  })),
);
const PaperTrading = lazy(() =>
  import('../features/paper-trading/PaperTradingPage').then((module) => ({
    default: module.PaperTradingPage,
  })),
);
const Orders = lazy(() =>
  import('../features/paper-trading/OrdersPage').then((module) => ({
    default: module.OrdersPage,
  })),
);
const Dashboard = lazy(() => import('../pages/investor/Dashboard'));
const Watchlist = lazy(() => import('../pages/investor/Watchlist'));
const Analytics = lazy(() => import('../pages/investor/Analytics'));
const AdminHome = lazy(() => import('../pages/admin/AdminHome'));
const PlannedFeaturePage = lazy(() => import('../pages/PlannedFeaturePage'));
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
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-background-full p-4 sm:p-6">
      <PageState
        kind="loading"
        title={t('shell.loadingTitle')}
        description={t('shell.loadingDescription')}
      />
    </div>
  );
}

// Every screen inside the shell — public Markets pages and the authenticated
// console alike — mounts through this one layout, so there is exactly one
// AppShell instance in the tree rather than a copy per page. React Router
// keeps it mounted across navigation between sibling routes here, which also
// means the sidebar/topbar no longer remount when moving between them.
function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
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
function ConsoleShellLayout() {
  const { status } = useAuth();

  if (status === 'anonymous') {
    return (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    );
  }

  return (
    <AppShell>
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    </AppShell>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route element={<ShellLayout />}>
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/markets/:symbol" element={<SecurityDetailPage />} />
        </Route>

        <Route element={<ConsoleShellLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/paper-trading" element={<PaperTrading />} />
          <Route path="/ai-insights" element={<PlannedFeaturePage feature="aiInsights" />} />
          <Route path="/reports" element={<PlannedFeaturePage feature="reports" />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminHome />
              </RequireAdmin>
            }
          />
          <Route path="/backtests" element={<Navigate to="/backtests/new/security" replace />} />
          <Route path="/backtests/new" element={<Navigate to="/backtests/new/security" replace />} />
          <Route path="/backtests/new/:step" element={<BacktestWizard />} />
          <Route path="/backtests/:runId/status" element={<StatusStep />} />
        </Route>

        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Routes>
    </Suspense>
  );
}

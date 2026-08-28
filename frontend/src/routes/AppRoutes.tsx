import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

// Lazy loaded views
const LandingPage = lazy(() =>
  import('../features/landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const Markets = lazy(() => import('../pages/investor/Markets'));
const Dashboard = lazy(() => import('../pages/investor/Dashboard'));
const Watchlist = lazy(() => import('../pages/investor/Watchlist'));
const Portfolio = lazy(() => import('../pages/investor/Portfolio'));
const Orders = lazy(() => import('../pages/investor/Orders'));
const Analytics = lazy(() => import('../pages/investor/Analytics'));
const AdminHome = lazy(() => import('../pages/admin/AdminHome'));

// Loading spinner fallback
const LoadingFallback = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
    Loading view...
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Landing Page (Stands alone, no AppShell layout) */}
        <Route path="/" element={<LandingPage />} />

        {/* Console / Platform Platform views wrapped inside AppShell */}
        <Route
          path="/*"
          element={
            <AppShell>
              <Routes>
                <Route path="markets" element={<Markets />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="watchlist" element={<Watchlist />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="orders" element={<Orders />} />
                <Route path="analytics" element={<Analytics />} />

                {/* Stubs for other menu items */}
                <Route
                  path="paper-trading"
                  element={
                    <div style={{ color: '#e2e8f0' }}>
                      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Paper Trading</h1>
                      <p style={{ color: '#90a1b9', marginBottom: '24px' }}>
                        Simulate real-time trades with virtual capital without risk.
                      </p>
                      <button
                        style={{
                          backgroundColor: '#722ed1',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        onClick={() => alert('Feature coming soon')}
                      >
                        Launch Paper Trading Console
                      </button>
                    </div>
                  }
                />
                <Route
                  path="ai-insights"
                  element={
                    <div style={{ color: '#e2e8f0' }}>
                      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>AI Assistant</h1>
                      <p style={{ color: '#90a1b9', marginBottom: '24px' }}>
                        Predictive models and intelligence insights for Colombo Stock Exchange.
                      </p>
                      <button
                        style={{
                          backgroundColor: '#722ed1',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        onClick={() => alert('Feature coming soon')}
                      >
                        Generate AI Signal Report
                      </button>
                    </div>
                  }
                />

                {/* Admin Routes */}
                <Route path="admin" element={<AdminHome />} />

                {/* Catch-all fallback inside console shell redirects to Markets */}
                <Route path="*" element={<Navigate to="/markets" replace />} />
              </Routes>
            </AppShell>
          }
        />
      </Routes>
    </Suspense>
  );
};

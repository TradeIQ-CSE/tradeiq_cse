import { describe, it, expect } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { SessionUser } from '../lib/session';
import { renderWithProviders, screen } from '../test/render';
import { RequireAdmin } from './RequireAdmin';

function AdminContent() {
  return <div>admin content</div>;
}

function MarketsProbe() {
  const location = useLocation();
  return <div>markets page ({location.pathname})</div>;
}

// Always wrapped in real <Routes> for the same reason as RequireAuth.test.tsx:
// a bare <Navigate> with nothing to swap in keeps re-invoking navigate() on
// every render, which would mask a mutant that redirects unconditionally.
function renderGuardedApp(user: SessionUser) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminContent />
          </RequireAdmin>
        }
      />
      <Route path="/markets" element={<MarketsProbe />} />
    </Routes>,
    { initialEntries: ['/admin'], auth: { status: 'authenticated', user } },
  );
}

describe('RequireAdmin', () => {
  it('renders the child for an admin user', () => {
    renderGuardedApp({ user_id: 'u1', display_name: 'Ada', role: 'admin' });

    expect(screen.getByText('admin content')).toBeInTheDocument();
  });

  it('redirects a signed-in non-admin to /markets rather than /login', async () => {
    renderGuardedApp({ user_id: 'u1', display_name: 'Ada', role: 'investor' });

    expect(await screen.findByText('markets page (/markets)')).toBeInTheDocument();
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });
});

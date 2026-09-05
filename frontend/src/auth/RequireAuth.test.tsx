import { describe, it, expect } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthStatus } from './useAuth';
import { renderWithProviders, screen } from '../test/render';
import { RequireAuth } from './RequireAuth';

function ProtectedContent() {
  return <div>protected content</div>;
}

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return <div>login page (from: {from?.pathname ?? 'none'})</div>;
}

// Always wrapped in real <Routes> (rather than rendering <RequireAuth>
// bare): a bare <Navigate> with no matching <Route> to swap in keeps
// re-invoking navigate() on every render, which is fine for the real
// implementation (which never renders <Navigate> while restoring) but spins
// forever under a mutant that does — this way that mutant fails the
// assertion below, not the test worker.
function renderGuardedApp(initialEntries: string[], status: AuthStatus) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/protected"
        element={
          <RequireAuth>
            <ProtectedContent />
          </RequireAuth>
        }
      />
      <Route path="/login" element={<LoginProbe />} />
    </Routes>,
    { initialEntries, auth: { status } },
  );
}

describe('RequireAuth', () => {
  it('redirects to /login carrying the intended path in state.from when anonymous', async () => {
    renderGuardedApp(['/protected'], 'anonymous');

    expect(await screen.findByText('login page (from: /protected)')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders neither the child nor the redirect while restoring', () => {
    renderGuardedApp(['/protected'], 'restoring');

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(screen.queryByText(/login page/)).not.toBeInTheDocument();
  });

  it('renders the child when authenticated', () => {
    renderGuardedApp(['/protected'], 'authenticated');

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});

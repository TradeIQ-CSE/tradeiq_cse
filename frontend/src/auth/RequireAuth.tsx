import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Guards a route: renders children once authenticated, nothing while the
 * session restore (POST /auth/refresh, see AuthProvider) is still in
 * flight — a boolean can't express "don't know yet", and rendering the
 * redirect during that window would flash the login page for a returning
 * user with a valid refresh cookie — and otherwise redirects to /login,
 * carrying the attempted path so the login page can return here afterwards.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
    return null;
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

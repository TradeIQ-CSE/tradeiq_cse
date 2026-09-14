import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Sits inside RequireAuth: by the time this renders, status is
 * 'authenticated', so it only has the role to check. Sends a signed-in
 * non-admin back to Markets rather than to /login, since they do have a
 * valid session — they just can't see this page.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/markets" replace />;
  }

  return <>{children}</>;
}

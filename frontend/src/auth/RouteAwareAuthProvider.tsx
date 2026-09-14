import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';

const PUBLIC_MARKETING_PATHS = new Set(['/', '/how-it-works']);

export function RouteAwareAuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <AuthProvider restoreSession={!PUBLIC_MARKETING_PATHS.has(pathname)}>
      {children}
    </AuthProvider>
  );
}

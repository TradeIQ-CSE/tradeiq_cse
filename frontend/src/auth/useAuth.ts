// Split into its own module (rather than living in AuthProvider.tsx) so that
// the provider file exports only components — react-refresh/only-export-components
// is `warn` and lint runs --max-warnings 0, and the existing eslint override
// only exempts src/test/**.

import { createContext, useContext } from 'react';
import { LoginInput, SignupInput } from '../lib/auth-api';
import { SessionUser } from '../lib/session';

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

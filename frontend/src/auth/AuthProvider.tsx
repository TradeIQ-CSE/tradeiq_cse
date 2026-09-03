import { ReactNode, useEffect, useState } from 'react';
import * as authApi from '../lib/auth-api';
import { LoginInput, SignupInput } from '../lib/auth-api';
import { clearSession, onSessionLost, setSession, SessionUser } from '../lib/session';
import { AuthContext, AuthStatus } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);

  // Session restore on first paint: POST /auth/refresh, not a storage read —
  // the access token lives in memory only (lib/session.ts). A 401 here is the
  // normal state for a first-time (or logged-out) visitor, not an error.
  useEffect(() => {
    let cancelled = false;

    authApi
      .refresh()
      .then((session) => {
        if (cancelled) return;
        setSession(session);
        setUser(session.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Dropped to anonymous whenever authFetch's single-flight refresh fails on
  // a guarded call elsewhere in the app (session.ts already cleared the
  // in-memory token/user before notifying).
  useEffect(() => {
    return onSessionLost(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  async function login(input: LoginInput): Promise<void> {
    const session = await authApi.login(input);
    setSession(session);
    setUser(session.user);
    setStatus('authenticated');
  }

  async function signup(input: SignupInput): Promise<void> {
    const session = await authApi.signup(input);
    setSession(session);
    setUser(session.user);
    setStatus('authenticated');
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Ignored deliberately: logout is guarded, so an already-expired
      // token can't call it at all, and a caller (e.g. a "sign out" button)
      // only needs the local session gone, which the finally block below
      // guarantees regardless of how the network call resolved.
    } finally {
      clearSession();
      setUser(null);
      setStatus('anonymous');
    }
  }

  return (
    <AuthContext.Provider value={{ status, user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

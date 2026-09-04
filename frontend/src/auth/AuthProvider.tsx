import { ReactNode, useEffect, useRef, useState } from 'react';
import * as authApi from '../lib/auth-api';
import { LoginInput, SignupInput } from '../lib/auth-api';
import { clearSession, onSessionLost, setSession, SessionUser } from '../lib/session';
import { AuthContext, AuthStatus } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);

  // The restore below is one in-flight request the user can outrun: /login is
  // public, so they can sign in (or sign out, or lose the session) before it
  // settles. Its result is only meaningful until something deliberate happens.
  // Without this, a restore that 401s just after a successful login would set
  // status back to anonymous and the guard would bounce a signed-in user.
  const restoreSuperseded = useRef(false);

  // Session restore on first paint: POST /auth/refresh, not a storage read —
  // the access token lives in memory only (lib/session.ts). A 401 here is the
  // normal state for a first-time (or logged-out) visitor, not an error.
  useEffect(() => {
    let cancelled = false;

    authApi
      .refresh()
      .then((session) => {
        if (cancelled || restoreSuperseded.current) return;
        setSession(session);
        setUser(session.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled || restoreSuperseded.current) return;
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
      restoreSuperseded.current = true;
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  async function login(input: LoginInput): Promise<void> {
    const session = await authApi.login(input);
    restoreSuperseded.current = true;
    setSession(session);
    setUser(session.user);
    setStatus('authenticated');
  }

  async function signup(input: SignupInput): Promise<void> {
    const session = await authApi.signup(input);
    restoreSuperseded.current = true;
    setSession(session);
    setUser(session.user);
    setStatus('authenticated');
  }

  async function logout(): Promise<void> {
    restoreSuperseded.current = true;
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

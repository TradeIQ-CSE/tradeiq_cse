// In-memory session store for identity-auth. Deliberately never touches
// localStorage or sessionStorage: the access token must not be readable at
// rest from JavaScript. A page reload always starts from nothing here;
// restoring a session is a POST /auth/refresh call, not a read from storage.

export interface SessionUser {
  user_id: string;
  display_name: string;
  role: string;
}

export interface Session {
  access_token: string;
  user: SessionUser;
}

let currentToken: string | null = null;
let currentUser: SessionUser | null = null;

type SessionLostListener = () => void;
const sessionLostListeners = new Set<SessionLostListener>();

export function getToken(): string | null {
  return currentToken;
}

export function getUser(): SessionUser | null {
  return currentUser;
}

export function setSession(session: Session): void {
  currentToken = session.access_token;
  currentUser = session.user;
}

export function clearSession(): void {
  currentToken = null;
  currentUser = null;
}

/** Registers a callback fired when the session is lost (e.g. a failed
 * refresh). Returns an unsubscribe function. */
export function onSessionLost(callback: SessionLostListener): () => void {
  sessionLostListeners.add(callback);
  return () => {
    sessionLostListeners.delete(callback);
  };
}

/** Clears the session and notifies every registered listener. */
export function notifySessionLost(): void {
  clearSession();
  sessionLostListeners.forEach((listener) => listener());
}

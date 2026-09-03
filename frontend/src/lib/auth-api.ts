// Client for identity-auth. Unlike lib/api.ts (market-trading, no auth),
// every call here targets `/auth/*`, so `credentials: 'include'` is required
// to carry the HttpOnly refresh cookie (which is itself scoped to `Path=/auth`).
// The response/error envelope is identical to market-trading
// (docs/api/error-envelope.md), so ApiError/ApiErrorBody are imported from
// lib/api.ts rather than redefined here.

import { ApiError, ApiErrorBody } from './api';
import { getToken, notifySessionLost, setSession, SessionUser } from './session';

// Vite does not read the repository-level Compose .env file when the frontend
// is run directly. Keep the documented local API origin as a safe default,
// while still allowing deployments to inject a different browser-visible URL.
const IDENTITY_AUTH_API_URL =
  import.meta.env.VITE_IDENTITY_AUTH_API_URL || 'http://localhost:3002';

export interface SessionBody {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: SessionUser;
}

export interface SignupInput {
  email: string;
  password: string;
  display_name: string;
  language_pref?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface MeBody {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  language_pref: string | null;
  email_verified: boolean;
}

function isErrorBody(value: unknown): value is { error: ApiErrorBody } {
  const error = (value as { error?: unknown } | undefined)?.error;
  return typeof (error as ApiErrorBody | undefined)?.code === 'string';
}

/**
 * Parses the identity-auth envelope. A 204 (logout) has no body at all, so
 * this reads text first and only parses it when non-empty — calling
 * response.json() directly on an empty body throws.
 *
 * A failure that never reached the service still has to arrive as an ApiError:
 * a proxy answering 502 with an HTML page, or a reset connection, produces a
 * non-JSON or empty body, and callers branch on `instanceof ApiError`. Without
 * this, a form would see a raw SyntaxError or TypeError instead of a message.
 */
async function parseEnvelope<T>(response: Response): Promise<T> {
  const text = await response.text();

  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error);
    }
    throw new ApiError({
      code: 'INTERNAL',
      message: `The server returned an unexpected ${response.status} response.`,
      trace_id: '',
    });
  }
  return (body as { data: T } | undefined)?.data as T;
}

/** POST /auth/signup — 201, wrapped session body. Unauthenticated entry point. */
export async function signup(input: SignupInput): Promise<SessionBody> {
  const response = await fetch(new URL('/auth/signup', IDENTITY_AUTH_API_URL), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseEnvelope<SessionBody>(response);
}

/** POST /auth/login — 200, wrapped session body. Unauthenticated entry point. */
export async function login(input: LoginInput): Promise<SessionBody> {
  const response = await fetch(new URL('/auth/login', IDENTITY_AUTH_API_URL), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseEnvelope<SessionBody>(response);
}

/**
 * POST /auth/refresh — 200, wrapped session body, cookie only (no request
 * body). Deliberately a direct fetch, not routed through authFetch: it is
 * the primitive authFetch itself calls on a 401, and a 401 from refresh must
 * never recurse into another refresh.
 */
export async function refresh(): Promise<SessionBody> {
  const response = await fetch(new URL('/auth/refresh', IDENTITY_AUTH_API_URL), {
    method: 'POST',
    credentials: 'include',
  });
  return parseEnvelope<SessionBody>(response);
}

/**
 * POST /auth/logout — 204, guarded. Goes through authFetch since it needs a
 * live bearer token. The caller is expected to clear local state regardless
 * of the outcome (a token that is already invalid can't call this at all).
 */
export async function logout(): Promise<void> {
  const response = await authFetch('/auth/logout', { method: 'POST' });
  await parseEnvelope<void>(response);
}

/** GET /auth/me — 200, guarded, wrapped body. The only source of email. */
export async function me(): Promise<MeBody> {
  const response = await authFetch('/auth/me', { method: 'GET' });
  return parseEnvelope<MeBody>(response);
}

// --- authFetch: bearer attach + single-flight refresh-on-401 ---------------

let refreshPromise: Promise<SessionBody> | null = null;

/**
 * Ensures concurrent 401s share one refresh call rather than each starting
 * their own. The refresh contract rotates the token on every call and treats
 * a replayed token as a breach, so parallel refreshes would revoke the whole
 * session family.
 */
function runSingleFlightRefresh(): Promise<SessionBody> {
  if (!refreshPromise) {
    refreshPromise = refresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function withAuthHeader(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers, credentials: 'include' };
}

/**
 * Wrapper for every guarded identity-auth call. Attaches the bearer token,
 * and on a single 401 runs one shared (single-flight) refresh, then retries
 * the original request once with the new token. If the refresh itself fails,
 * the session is cleared, onSessionLost fires, and the original (failed)
 * response is returned unretried — a failed refresh means the refresh token
 * was already invalid/revoked, so retrying only makes it worse.
 *
 * Never call this for /auth/refresh itself — see refresh() above.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, IDENTITY_AUTH_API_URL);
  const first = await fetch(url, withAuthHeader(init, getToken()));

  if (first.status !== 401) return first;

  let session: SessionBody;
  try {
    session = await runSingleFlightRefresh();
  } catch {
    notifySessionLost();
    return first; // do not retry — the refresh token was already invalid
  }

  setSession(session);
  return fetch(url, withAuthHeader(init, getToken()));
}

// Generic authenticated-API layer for identity-auth. Every guarded feature
// (auth itself, paper-trading, ...) goes through authFetch/authedGet/
// authedPost/authedDelete here rather than calling fetch directly.
//
// This module owns authFetch and refresh() (both moved from auth-api.ts).
// auth-api.ts needs authFetch, refresh and the envelope parser from here, and
// re-exports refresh for its own existing importers (e.g. AuthProvider.tsx);
// this module never imports from auth-api.ts, so the dependency graph is
// one-directional: auth-api.ts -> authed-api.ts.
//
// The response/error envelope matches market-trading (docs/api/error-envelope.md),
// so ApiError/ApiErrorBody/PageMeta are imported from lib/api.ts rather than
// redefined here.

import { ApiError, ApiErrorBody, PageMeta } from './api';
import { getToken, notifySessionLost, Session, SessionUser, setSession } from './session';

// Vite does not read the repository-level Compose .env file when the frontend
// is run directly. Keep the documented local API origin as a safe default,
// while still allowing deployments to inject a different browser-visible URL.
// Exported so auth-api.ts's unguarded calls (login/signup/refresh) target the
// same origin as every guarded call here, rather than risking drift between
// two copies (see the file-level comment in auth-api.ts).
export const IDENTITY_AUTH_API_URL =
  import.meta.env.VITE_IDENTITY_AUTH_API_URL || 'http://localhost:3002';

export interface SessionBody {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: SessionUser;
}

export interface EnvelopeResult<T> {
  data: T;
  meta?: PageMeta;
  // From the `Idempotent-Replayed` response header — true only when the
  // server served a stored response for a reused idempotency key
  // (docs/api/paper-trading-v1.md §4). Undefined, not false, otherwise.
  idempotentReplayed?: boolean;
}

function isErrorBody(value: unknown): value is { error: ApiErrorBody } {
  const error = (value as { error?: unknown } | undefined)?.error;
  return typeof (error as ApiErrorBody | undefined)?.code === 'string';
}

function isEnvelope(value: unknown): value is { data: unknown; meta?: PageMeta } {
  return typeof value === 'object' && value !== null && 'data' in value;
}

/**
 * Parses the identity-auth envelope. A 204 (logout, delete) has no body at
 * all, so this reads text first and only parses it when non-empty — calling
 * response.json() directly on an empty body throws.
 *
 * A failure that never reached the service still has to arrive as an ApiError:
 * a proxy answering 502 with an HTML page, or a reset connection, produces a
 * non-JSON or empty body, and callers branch on `instanceof ApiError`. Without
 * this, a form would see a raw SyntaxError or TypeError instead of a message.
 */
export async function parseEnvelope<T>(response: Response): Promise<EnvelopeResult<T>> {
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

  // 204 carries no body by contract — logout and DELETE /portfolios/:id.
  if (response.status === 204) return { data: undefined as T };

  // Every other success must be a JSON envelope. A 200 whose body is not one
  // — a proxy returning its own HTML page, a truncated response — parsed to
  // `undefined` here, and callers then read `.data` off it: SummaryCards'
  // `if (isPending || !data)` guard passes (the EnvelopeResult is truthy) and
  // `summary.total_pnl` throws a TypeError with no error boundary to catch
  // it, blanking the page. Failing as an ApiError instead puts it on the
  // branch every caller already handles.
  if (!isEnvelope(body)) {
    throw new ApiError({
      code: 'INTERNAL',
      message: `The server returned an unexpected ${response.status} response.`,
      trace_id: '',
    });
  }

  return {
    data: body.data as T,
    meta: body.meta,
    idempotentReplayed: response.headers.get('Idempotent-Replayed') === 'true' || undefined,
  };
}

// --- authFetch: bearer attach + single-flight refresh-on-401 ---------------

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
  const envelope = await parseEnvelope<SessionBody>(response);
  return envelope.data;
}

let refreshPromise: Promise<Session> | null = null;

/**
 * Ensures concurrent 401s share one refresh call rather than each starting
 * their own. The refresh contract rotates the token on every call and treats
 * a replayed token as a breach, so parallel refreshes would revoke the whole
 * session family.
 */
function runSingleFlightRefresh(): Promise<Session> {
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
 * Never call this for /auth/refresh itself — that request must never recurse
 * into another refresh on its own 401.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, IDENTITY_AUTH_API_URL);
  const first = await fetch(url, withAuthHeader(init, getToken()));

  if (first.status !== 401) return first;

  let session: Session;
  try {
    session = await runSingleFlightRefresh();
  } catch {
    notifySessionLost();
    return first; // do not retry — the refresh token was already invalid
  }

  setSession(session);
  return fetch(url, withAuthHeader(init, getToken()));
}

// --- authedGet / authedPost / authedDelete ----------------------------------

/**
 * Drops `undefined` params and empty-string params — never sends `?foo=`.
 * A component holding `useState<string>('')` for "no value selected" (the
 * ordinary React pattern) will call this with `''`, and an empty `as_of`
 * fails paper-trading's date validation (docs/api/paper-trading-v1.md §7.1)
 * with `400 VALIDATION_FAILED` on first render. Mirrors the `|| undefined`
 * normalization in features/markets/useSecurities.ts, applied here once for
 * every call site instead of at each one.
 */
function buildQuery(params?: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function authedGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<EnvelopeResult<T>> {
  const response = await authFetch(`${path}${buildQuery(params)}`, { method: 'GET' });
  return parseEnvelope<T>(response);
}

export async function authedPost<T>(
  path: string,
  body: unknown,
  opts?: { idempotencyKey?: string },
): Promise<EnvelopeResult<T>> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts?.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);

  const response = await authFetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return parseEnvelope<T>(response);
}

export async function authedDelete(path: string): Promise<void> {
  const response = await authFetch(path, { method: 'DELETE' });
  await parseEnvelope<void>(response);
}

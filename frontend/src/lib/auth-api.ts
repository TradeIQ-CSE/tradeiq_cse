// Client for identity-auth. Unlike lib/api.ts (market-trading, no auth),
// every call here targets `/auth/*`, so `credentials: 'include'` is required
// to carry the HttpOnly refresh cookie (which is itself scoped to `Path=/auth`).
// The response/error envelope is identical to market-trading
// (docs/api/error-envelope.md), so ApiError/ApiErrorBody are imported from
// lib/api.ts rather than redefined here.
//
// authFetch, refresh(), SessionBody and the envelope parser live in
// lib/authed-api.ts (shared with every other identity-auth-backed feature);
// this file only re-exports them for its existing importers (e.g.
// AuthProvider.tsx) and adds login/signup/logout/me. This file imports from
// authed-api.ts and never the reverse, so there is no import cycle.

import { authFetch, IDENTITY_AUTH_API_URL, parseEnvelope, refresh } from './authed-api';
import type { SessionBody } from './authed-api';

export { authFetch, refresh };
export type { SessionBody };

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

/**
 * Parses a raw fetch Response through the shared envelope parser and takes
 * just `.data` — every call site here wants the unwrapped body, not meta.
 */
async function unwrap<T>(response: Response): Promise<T> {
  const envelope = await parseEnvelope<T>(response);
  return envelope.data;
}

/** POST /auth/signup — 201, wrapped session body. Unauthenticated entry point. */
export async function signup(input: SignupInput): Promise<SessionBody> {
  const response = await fetch(new URL('/auth/signup', IDENTITY_AUTH_API_URL), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return unwrap<SessionBody>(response);
}

/** POST /auth/login — 200, wrapped session body. Unauthenticated entry point. */
export async function login(input: LoginInput): Promise<SessionBody> {
  const response = await fetch(new URL('/auth/login', IDENTITY_AUTH_API_URL), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return unwrap<SessionBody>(response);
}

/**
 * POST /auth/logout — 204, guarded. Goes through authFetch since it needs a
 * live bearer token. The caller is expected to clear local state regardless
 * of the outcome (a token that is already invalid can't call this at all).
 */
export async function logout(): Promise<void> {
  const response = await authFetch('/auth/logout', { method: 'POST' });
  await unwrap<void>(response);
}

/** GET /auth/me — 200, guarded, wrapped body. The only source of email. */
export async function me(): Promise<MeBody> {
  const response = await authFetch('/auth/me', { method: 'GET' });
  return unwrap<MeBody>(response);
}

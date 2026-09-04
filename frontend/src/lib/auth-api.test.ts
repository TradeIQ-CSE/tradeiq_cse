import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { authFetch, login, logout, signup } from './auth-api';
import { ApiError } from './api';
import { clearSession, getToken, getUser, onSessionLost, setSession } from './session';

const AUTH_ORIGIN = 'http://localhost:3002';

function sessionBody(overrides: Partial<{ access_token: string }> = {}) {
  return {
    access_token: overrides.access_token ?? 'new-access-token',
    token_type: 'Bearer' as const,
    expires_in: 300,
    user: { user_id: 'u1', display_name: 'Ada', role: 'trader' },
  };
}

beforeEach(() => {
  clearSession();
});

describe('authFetch', () => {
  it('on a 401, runs one refresh and retries once with the new token', async () => {
    let guardedCalls = 0;
    let refreshCalls = 0;
    const seenAuthHeaders: (string | null)[] = [];

    server.use(
      http.get(`${AUTH_ORIGIN}/auth/some-guarded-path`, ({ request }) => {
        guardedCalls += 1;
        seenAuthHeaders.push(request.headers.get('Authorization'));
        if (guardedCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'UNAUTHENTICATED', message: 'Expired', trace_id: 't1' } },
            { status: 401 },
          );
        }
        return HttpResponse.json({ data: { ok: true } });
      }),
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ data: sessionBody({ access_token: 'refreshed-token' }) });
      }),
    );

    setSession({ access_token: 'stale-token', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const response = await authFetch('/auth/some-guarded-path', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(guardedCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(seenAuthHeaders[0]).toBe('Bearer stale-token');
    expect(seenAuthHeaders[1]).toBe('Bearer refreshed-token');
    expect(getToken()).toBe('refreshed-token');
  });

  it('coalesces two concurrent 401s into exactly one refresh call', async () => {
    let refreshCalls = 0;

    server.use(
      http.get(`${AUTH_ORIGIN}/auth/some-guarded-path`, () => {
        return HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Expired', trace_id: 't1' } },
          { status: 401 },
        );
      }),
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ data: sessionBody({ access_token: 'refreshed-token' }) });
      }),
    );

    setSession({ access_token: 'stale-token', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await Promise.all([
      authFetch('/auth/some-guarded-path', { method: 'GET' }),
      authFetch('/auth/some-guarded-path', { method: 'GET' }),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it('on a failed refresh, clears the session, fires onSessionLost, and does not retry', async () => {
    let guardedCalls = 0;
    let refreshCalls = 0;
    const listener = vi.fn();
    const unsubscribe = onSessionLost(listener);

    server.use(
      http.get(`${AUTH_ORIGIN}/auth/some-guarded-path`, () => {
        guardedCalls += 1;
        return HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Expired', trace_id: 't1' } },
          { status: 401 },
        );
      }),
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json(
          { error: { code: 'REFRESH_TOKEN_INVALID', message: 'Invalid', trace_id: 't2' } },
          { status: 401 },
        );
      }),
    );

    setSession({ access_token: 'stale-token', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const response = await authFetch('/auth/some-guarded-path', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(guardedCalls).toBe(1); // no retry
    expect(refreshCalls).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();

    unsubscribe();
  });

  it('sends credentials: "include" on /auth/* calls', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });
    await logout();

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).credentials).toBe('include');

    fetchSpy.mockRestore();
  });
});

describe('login', () => {
  it('returns the session body unwrapped from the { data } envelope', async () => {
    const body = sessionBody({ access_token: 'login-token' });
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/login`, () => HttpResponse.json({ data: body })),
    );

    const result = await login({ email: 'ada@example.com', password: 'password-123' });

    expect(result).toEqual(body);
  });
});

describe('signup', () => {
  it('surfaces a 400 as ApiError with fields intact, including repeated fields', async () => {
    const fields = [
      { field: 'password', reason: 'too_short' },
      { field: 'password', reason: 'missing_number' },
    ];
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/signup`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Validation failed',
              fields,
              trace_id: 't3',
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      signup({ email: 'ada@example.com', password: 'x', display_name: 'Ada' }),
    ).rejects.toBeInstanceOf(ApiError);

    try {
      await signup({ email: 'ada@example.com', password: 'x', display_name: 'Ada' });
      throw new Error('expected signup to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).body.fields).toEqual(fields);
    }
  });
});

describe('logout', () => {
  it('resolves without throwing on a 204 empty body', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );

    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(logout()).resolves.toBeUndefined();
  });
});

// A failure that never reaches identity-auth still has to arrive as an
// ApiError, because every caller branches on `instanceof ApiError`.
describe('non-envelope failures', () => {
  it('turns a non-JSON error body into an ApiError', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/login`, () =>
        new HttpResponse('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    await expect(login({ email: 'ada@example.com', password: 'x' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('turns an empty error body into an ApiError', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/auth/login`, () => new HttpResponse(null, { status: 504 })),
    );

    await expect(login({ email: 'ada@example.com', password: 'x' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

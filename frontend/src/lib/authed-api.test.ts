import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { authedDelete, authedGet, authedPost } from './authed-api';
import { ApiError } from './api';
import { clearSession, getToken, setSession } from './session';

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

describe('authedGet', () => {
  it('returns both data and meta', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, () =>
        HttpResponse.json({ data: [{ portfolio_id: 'p1' }], meta: { page: 1, page_size: 50, total: 1 } }),
      ),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const result = await authedGet<{ portfolio_id: string }[]>('/portfolios');

    expect(result.data).toEqual([{ portfolio_id: 'p1' }]);
    expect(result.meta).toEqual({ page: 1, page_size: 50, total: 1 });
  });

  it('drops undefined params', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios/p1/positions`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], meta: { as_of: null, total: 0 } });
      }),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await authedGet('/portfolios/p1/positions', { as_of: undefined });

    const url = new URL(capturedUrl);
    expect(url.searchParams.has('as_of')).toBe(false);
    expect(url.search).toBe('');
  });

  // A component holding `useState<string>('')` for "no date selected" calls
  // getPositions/getSummary with `as_of: ''` on first render (see
  // features/paper-trading/api.ts). Without this guard that becomes `?as_of=`,
  // which fails the date bounds check with `400 VALIDATION_FAILED`
  // (docs/api/paper-trading-v1.md §7.1).
  it('drops empty-string params, never sending `?as_of=`', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios/p1/positions`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], meta: { as_of: null, total: 0 } });
      }),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await authedGet('/portfolios/p1/positions', { as_of: '' });

    const url = new URL(capturedUrl);
    expect(url.searchParams.has('as_of')).toBe(false);
    expect(url.search).toBe('');
  });

  it('sets idempotentReplayed to undefined when the header is absent', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, () => HttpResponse.json({ data: [] })),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const result = await authedGet('/portfolios');

    expect(result.idempotentReplayed).toBeUndefined();
  });
});

describe('authedPost', () => {
  it('sets the Idempotency-Key header when given and omits it when not', async () => {
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post(`${AUTH_ORIGIN}/portfolios`, ({ request }) => {
        seenKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json({ data: { portfolio_id: 'p1' } }, { status: 201 });
      }),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await authedPost('/portfolios', { name: 'x' }, { idempotencyKey: 'key-1' });
    await authedPost('/portfolios', { name: 'x' });

    expect(seenKeys[0]).toBe('key-1');
    expect(seenKeys[1]).toBeNull();
  });

  it('sets Content-Type: application/json', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${AUTH_ORIGIN}/portfolios`, ({ request }) => {
        contentType = request.headers.get('Content-Type');
        return HttpResponse.json({ data: { portfolio_id: 'p1' } }, { status: 201 });
      }),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await authedPost('/portfolios', { name: 'x' });

    expect(contentType).toBe('application/json');
  });

  it('reports idempotentReplayed: true when the response carries Idempotent-Replayed: true', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/portfolios`, () =>
        HttpResponse.json(
          { data: { portfolio_id: 'p1' } },
          { status: 201, headers: { 'Idempotent-Replayed': 'true' } },
        ),
      ),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const result = await authedPost('/portfolios', { name: 'x' }, { idempotencyKey: 'key-1' });

    expect(result.idempotentReplayed).toBe(true);
  });

  it('surfaces an error envelope as ApiError carrying code, message, trace_id', async () => {
    server.use(
      http.post(`${AUTH_ORIGIN}/portfolios`, () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'Bad input', trace_id: 't1' } },
          { status: 400 },
        ),
      ),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    try {
      await authedPost('/portfolios', { name: '' });
      throw new Error('expected authedPost to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).body).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'Bad input',
        trace_id: 't1',
      });
    }
  });
});

describe('authedDelete', () => {
  it('resolves on a 204 with no body', async () => {
    server.use(
      http.delete(`${AUTH_ORIGIN}/portfolios/p1`, () => new HttpResponse(null, { status: 204 })),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedDelete('/portfolios/p1')).resolves.toBeUndefined();
  });
});

// A failure that never reaches identity-auth still has to arrive as an
// ApiError, because every caller branches on `instanceof ApiError`.
describe('non-envelope failures', () => {
  it('turns an HTML 502 proxy body into an ApiError, not a SyntaxError', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, () =>
        new HttpResponse('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedGet('/portfolios')).rejects.toBeInstanceOf(ApiError);
  });

  it('turns an empty 504 body into an ApiError', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, () => new HttpResponse(null, { status: 504 })),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedGet('/portfolios')).rejects.toBeInstanceOf(ApiError);
  });

  // A 200 is the dangerous case: the status says the call succeeded, so
  // nothing downstream is on its guard. Returning `{ data: undefined }` here
  // pushes the failure into the component, which reads `.data.total_pnl` and
  // throws a TypeError that no error boundary catches.
  it('turns an HTML 200 body into an ApiError, never `{ data: undefined }`', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios/p1/summary`, () =>
        HttpResponse.html('<html>Service temporarily unavailable</html>'),
      ),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedGet('/portfolios/p1/summary')).rejects.toBeInstanceOf(ApiError);
  });

  it('turns a 200 JSON body with no `data` key into an ApiError', async () => {
    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, () => HttpResponse.json({ portfolios: [] })),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedGet('/portfolios')).rejects.toBeInstanceOf(ApiError);
  });

  // The 204 endpoints (logout, DELETE /portfolios/:id) have no body by
  // contract, so the envelope check must not reject them.
  it('still accepts a 204 with no body', async () => {
    server.use(
      http.delete(`${AUTH_ORIGIN}/portfolios/p1`, () => new HttpResponse(null, { status: 204 })),
    );
    setSession({ access_token: 'tok', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    await expect(authedDelete('/portfolios/p1')).resolves.toBeUndefined();
  });
});

describe('authFetch (via authedGet) refresh-on-401', () => {
  it('on a 401, runs one refresh and retries once with the new token', async () => {
    let guardedCalls = 0;
    let refreshCalls = 0;
    const seenAuthHeaders: (string | null)[] = [];

    server.use(
      http.get(`${AUTH_ORIGIN}/portfolios`, ({ request }) => {
        guardedCalls += 1;
        seenAuthHeaders.push(request.headers.get('Authorization'));
        if (guardedCalls === 1) {
          return HttpResponse.json(
            { error: { code: 'UNAUTHENTICATED', message: 'Expired', trace_id: 't1' } },
            { status: 401 },
          );
        }
        return HttpResponse.json({ data: [] });
      }),
      http.post(`${AUTH_ORIGIN}/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ data: sessionBody({ access_token: 'refreshed-token' }) });
      }),
    );

    setSession({ access_token: 'stale-token', user: { user_id: 'u1', display_name: 'Ada', role: 'trader' } });

    const result = await authedGet('/portfolios');

    expect(result.data).toEqual([]);
    expect(guardedCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    expect(seenAuthHeaders[0]).toBe('Bearer stale-token');
    expect(seenAuthHeaders[1]).toBe('Bearer refreshed-token');
    expect(getToken()).toBe('refreshed-token');
  });
});

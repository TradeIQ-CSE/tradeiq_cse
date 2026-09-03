import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { securitiesFixture } from '../test/fixtures/securities';
import { ApiError, getEnvelope } from './api';

describe('getEnvelope', () => {
  it('returns the envelope whole, not just the data field', async () => {
    const envelope = await getEnvelope<typeof securitiesFixture>('/securities');

    expect(envelope).toEqual({
      data: securitiesFixture,
      meta: {
        page: 1,
        page_size: 25,
        total: securitiesFixture.length,
        as_of: '2026-09-02',
        available_from: '2020-01-02',
        available_to: '2026-09-02',
      },
    });
  });

  it('throws ApiError carrying body.error when the response is not ok', async () => {
    server.use(
      http.get('*/securities', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'No such resource', trace_id: 'trace-1' } },
          { status: 404 },
        ),
      ),
    );

    await expect(getEnvelope('/securities')).rejects.toBeInstanceOf(ApiError);

    try {
      await getEnvelope('/securities');
      throw new Error('expected getEnvelope to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe('No such resource');
      expect((error as ApiError).body).toEqual({
        code: 'NOT_FOUND',
        message: 'No such resource',
        trace_id: 'trace-1',
      });
    }
  });

  it('throws a SyntaxError, not an ApiError, when a non-ok response has a non-JSON body', async () => {
    // getEnvelope awaits response.json() before checking response.ok, so a
    // malformed error body surfaces as a JSON parse failure, not ApiError.
    server.use(
      http.get('*/securities', () => new HttpResponse('not json', { status: 500 })),
    );

    await expect(getEnvelope('/securities')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('omits undefined params but keeps 0 and empty string', async () => {
    let capturedUrl = '';
    server.use(
      http.get('*/securities', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], meta: { page: 1, page_size: 25, total: 0 } });
      }),
    );

    await getEnvelope('/securities', {
      search: '',
      sector: undefined,
      page: 0,
      page_size: 25,
    });

    const url = new URL(capturedUrl);
    // '' survives: getEnvelope only checks `value !== undefined`, so an
    // empty string is still serialised as an (empty) query param.
    expect(url.searchParams.has('search')).toBe(true);
    expect(url.searchParams.get('search')).toBe('');
    // undefined is dropped entirely.
    expect(url.searchParams.has('sector')).toBe(false);
    // 0 is not falsy-filtered either.
    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.get('page_size')).toBe('25');
  });

  // frontend/.env sets VITE_MARKET_TRADING_API_URL, so this pins the configured
  // origin rather than api.ts's hardcoded fallback, which never runs here.
  it('requests against the configured market-trading API origin', async () => {
    let capturedUrl = '';
    server.use(
      http.get('*/securities', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: [], meta: { page: 1, page_size: 25, total: 0 } });
      }),
    );

    await getEnvelope('/securities');

    expect(new URL(capturedUrl).origin).toBe('http://localhost:3001');
  });
});

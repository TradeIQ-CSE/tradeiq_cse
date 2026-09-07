import { createElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';
import { createTestQueryClient } from '../../test/render';
import { server } from '../../test/server';
import {
  dailyOhlcvFixture,
  securityDetailFixture,
} from '../../test/fixtures/security-detail';
import { OhlcvRange, OhlcvTimeframe } from './types';
import {
  securityQueryKeys,
  useSecurityDetail,
  useSecurityOhlcv,
} from './useSecurityDetail';

function wrapperFor(queryClient = createTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { Wrapper, queryClient };
}

describe('security detail queries', () => {
  it('URL-encodes the input symbol, shares a case-insensitive key, and returns the canonical symbol', async () => {
    let requestedPath = '';
    server.use(
      http.get('*/securities/:symbol', ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        return HttpResponse.json({ data: securityDetailFixture });
      }),
    );

    const { Wrapper } = wrapperFor();
    const { result } = renderHook(() => useSecurityDetail('jkh n0000'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requestedPath).toBe('/securities/jkh%20n0000');
    expect(result.current.data?.symbol).toBe('JKH.N0000');
    expect(securityQueryKeys.detail('jkh.n0000')).toEqual(
      securityQueryKeys.detail('JKH.N0000'),
    );
  });

  it('omits from/to on the default daily request', async () => {
    let capturedUrl = '';
    server.use(
      http.get('*/securities/:symbol/ohlcv', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ data: dailyOhlcvFixture });
      }),
    );

    const { Wrapper } = wrapperFor();
    const { result } = renderHook(
      () => useSecurityOhlcv('jkh.n0000', 'daily'),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('timeframe')).toBe('daily');
    expect(url.searchParams.has('from')).toBe(false);
    expect(url.searchParams.has('to')).toBe(false);
  });

  it('sends all three timeframes and retains an explicit range', async () => {
    const requests: URL[] = [];
    server.use(
      http.get('*/securities/:symbol/ohlcv', ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json({
          data: {
            ...dailyOhlcvFixture,
            timeframe: url.searchParams.get('timeframe'),
          },
        });
      }),
    );
    const range = { from: '2026-01-01', to: '2026-06-30' };
    const { Wrapper } = wrapperFor();
    const { result, rerender } = renderHook(
      ({ timeframe }: { timeframe: OhlcvTimeframe }) =>
        useSecurityOhlcv('JKH.N0000', timeframe, range),
      { wrapper: Wrapper, initialProps: { timeframe: 'daily' as OhlcvTimeframe } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ timeframe: 'weekly' });
    await waitFor(() => expect(result.current.data?.timeframe).toBe('weekly'));
    rerender({ timeframe: 'monthly' });
    await waitFor(() => expect(result.current.data?.timeframe).toBe('monthly'));

    expect(requests.map((url) => url.searchParams.get('timeframe'))).toEqual([
      'daily',
      'weekly',
      'monthly',
    ]);
    for (const url of requests) {
      expect(url.searchParams.get('from')).toBe(range.from);
      expect(url.searchParams.get('to')).toBe(range.to);
    }
  });

  it('uses symbol, timeframe, and committed range in stable OHLCV keys', () => {
    const first: OhlcvRange = { from: '2026-01-01', to: '2026-02-01' };
    expect(securityQueryKeys.ohlcv('jkh.n0000', 'daily', first)).toEqual([
      'security-ohlcv',
      'JKH.N0000',
      'daily',
      '2026-01-01',
      '2026-02-01',
    ]);
    expect(securityQueryKeys.ohlcv('JKH.N0000', 'weekly', first)).not.toEqual(
      securityQueryKeys.ohlcv('JKH.N0000', 'daily', first),
    );
    expect(
      securityQueryKeys.ohlcv('JKH.N0000', 'daily', {
        ...first,
        to: '2026-03-01',
      }),
    ).not.toEqual(securityQueryKeys.ohlcv('JKH.N0000', 'daily', first));
  });

  it('preserves structured validation errors from the API', async () => {
    server.use(
      http.get('*/securities/:symbol/ohlcv', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Request validation failed.',
              fields: [{ field: 'from', reason: 'must be before or equal to to' }],
              trace_id: 'trace-range',
            },
          },
          { status: 400 },
        ),
      ),
    );

    const { Wrapper } = wrapperFor();
    const { result } = renderHook(
      () =>
        useSecurityOhlcv('JKH.N0000', 'daily', {
          from: '2026-02-02',
          to: '2026-01-01',
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).body).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: [{ field: 'from', reason: 'must be before or equal to to' }],
    });
  });
});

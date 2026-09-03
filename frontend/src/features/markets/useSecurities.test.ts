import { createElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/server';
import { createTestQueryClient } from '../../test/render';
import { securitiesFixture } from '../../test/fixtures/securities';
import { useSecurities } from './useSecurities';

// Plain .ts (not .tsx), so the wrapper is built with createElement rather
// than JSX.
function wrapperFor(queryClient = createTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { Wrapper, queryClient };
}

describe('useSecurities', () => {
  it('drops empty search/sector/as_of instead of sending them as empty strings', async () => {
    let capturedUrl = '';
    server.use(
      http.get('*/securities', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          data: securitiesFixture,
          meta: { page: 1, page_size: 25, total: securitiesFixture.length },
        });
      }),
    );

    const { Wrapper } = wrapperFor();
    const { result } = renderHook(
      () =>
        useSecurities({
          search: '',
          sector: '',
          as_of: '',
          sort: 'symbol',
          page: 1,
          page_size: 25,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = new URL(capturedUrl);
    expect(url.searchParams.has('search')).toBe(false);
    expect(url.searchParams.has('sector')).toBe(false);
    expect(url.searchParams.has('as_of')).toBe(false);
    // Non-empty params still go through untouched.
    expect(url.searchParams.get('sort')).toBe('symbol');
    expect(url.searchParams.get('page')).toBe('1');
  });

  it('changes the query cache key when the page changes', async () => {
    const { Wrapper, queryClient } = wrapperFor();
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useSecurities({ sort: 'symbol', page, page_size: 25 }),
      { wrapper: Wrapper, initialProps: { page: 1 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });

    // Two distinct pages must produce two distinct, independently-settled
    // cache entries; a query key that ignored `page` would collapse these
    // into one (and this would time out at length 1).
    await waitFor(() => {
      const entries = queryClient.getQueryCache().getAll();
      expect(entries).toHaveLength(2);
      expect(entries.every((entry) => entry.state.status === 'success')).toBe(true);
    });

    const cachedKeys = queryClient.getQueryCache().getAll().map((entry) => entry.queryKey);
    expect(cachedKeys).toEqual(
      expect.arrayContaining([
        ['securities', expect.objectContaining({ page: 1 })],
        ['securities', expect.objectContaining({ page: 2 })],
      ]),
    );
  });
});

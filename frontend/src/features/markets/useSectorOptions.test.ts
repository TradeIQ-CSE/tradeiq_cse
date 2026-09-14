import { createElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../test/server';
import { createTestQueryClient } from '../../test/render';
import type { SecurityListItem } from './types';
import { useSectorOptions } from './useSectorOptions';

function wrapperFor() {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

function security(symbol: string, sector: SecurityListItem['sector']): SecurityListItem {
  return {
    symbol,
    company_name: symbol,
    sector,
    shares_outstanding: null,
    data_from: null,
    data_to: null,
    price: null,
    change: null,
    change_pct: null,
    volume: null,
    pe_ratio: null,
  };
}

describe('useSectorOptions', () => {
  it('collects and sorts distinct sectors from every securities page', async () => {
    const requestedPages: string[] = [];
    server.use(
      http.get('*/securities', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        requestedPages.push(page);
        const rows =
          page === '1'
            ? [security('COMB.N0000', { gics_code: '4010', name: 'Banks' })]
            : page === '2'
              ? [security('SAMP.N0000', { gics_code: '4010', name: 'Banks' })]
              : [
                  security('DIAL.N0000', {
                    gics_code: '5010',
                    name: 'Telecommunication Services',
                  }),
                ];

        return HttpResponse.json({
          data: rows,
          meta: { page: Number(page), page_size: 200, total: 401 },
        });
      }),
    );

    const { result } = renderHook(() => useSectorOptions(), {
      wrapper: wrapperFor(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(new Set(requestedPages)).toEqual(new Set(['1', '2', '3']));
    expect(result.current.data).toEqual([
      { gics_code: '4010', name: 'Banks' },
      { gics_code: '5010', name: 'Telecommunication Services' },
    ]);
  });
});

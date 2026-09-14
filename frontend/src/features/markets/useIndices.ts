import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { Index, IndexValuesResponse, OhlcvRange } from './types';

/** GET /indices (endpoint-catalogue-v0.md §9) — every index's latest close. */
export function useIndices() {
  return useQuery({
    queryKey: ['indices'],
    queryFn: () => getEnvelope<Index[]>('/indices'),
    placeholderData: (previous) => previous,
  });
}

/**
 * GET /indices/{code}/values (§10) — daily close series for one index. With
 * no `range`, the API's own 1-year default applies (same default
 * `useSecurityOhlcv` relies on for securities).
 */
export function useIndexValues(code: string, range: OhlcvRange = {}) {
  return useQuery({
    queryKey: ['index-values', code, range.from ?? null, range.to ?? null],
    queryFn: async () => {
      const response = await getEnvelope<IndexValuesResponse>(
        `/indices/${encodeURIComponent(code)}/values`,
        { from: range.from, to: range.to },
      );
      return response.data;
    },
    enabled: code.trim().length > 0,
  });
}

import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { DataGap } from '../../lib/data-gaps';

// Mirrors docs/api/endpoint-catalogue-v0.md §11 (GET /coverage).
export interface CoverageWindow {
  from: string | null;
  to: string | null;
  gaps: DataGap[];
}

export interface DataCoverage {
  prices: CoverageWindow;
  indices: CoverageWindow;
}

// Coverage changes at most once a day (a new EOD or index ingestion run), so
// a half-hour staleTime avoids re-fetching it on every chart mount without
// risking a stale gap list within a session.
const STALE_TIME_MS = 30 * 60 * 1000;

/**
 * GET /coverage — date coverage and detected gaps for prices and indices.
 * Charts render with no gaps while this loads and fall back the same way if
 * it errors, so call sites read `coverageQuery.data?.prices.gaps ?? []`. The
 * security and index detail pages do wait for it to settle before fetching
 * their default range, which is why a failure retries once, quickly, and then
 * leaves them on the API's own default.
 */
export function useDataCoverage() {
  return useQuery({
    queryKey: ['data-coverage'],
    queryFn: async () => {
      const response = await getEnvelope<DataCoverage>('/coverage');
      return response.data;
    },
    staleTime: STALE_TIME_MS,
    retry: 1,
    retryDelay: 500,
  });
}

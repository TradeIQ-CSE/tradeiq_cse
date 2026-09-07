import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { MarketOverview } from './types';

export interface MarketOverviewQuery {
  /** Trading date for all three rankings; omitted means the latest available. */
  as_of?: string;
  /** GICS sector code, matching the Markets table's segment filter. */
  sector?: string;
  /** Rows per list, 1-50 per the catalogue. */
  limit?: number;
}

/**
 * GET /market/overview (endpoint-catalogue-v0.md §6) — gainers, losers and
 * most-active for one session.
 *
 * Takes the same `as_of` and `sector` the securities table uses so the movers
 * card and the table below it always describe the same slice of the market;
 * an empty string for either must reach the API as an omitted parameter, not
 * as `?sector=`, which mirrors useSecurities.
 */
export function useMarketOverview(query: MarketOverviewQuery = {}) {
  return useQuery({
    queryKey: ['market-overview', query],
    queryFn: () =>
      getEnvelope<MarketOverview>('/market/overview', {
        as_of: query.as_of || undefined,
        sector: query.sector || undefined,
        limit: query.limit,
      }),
    placeholderData: (previous) => previous,
  });
}

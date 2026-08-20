import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { SecuritiesSort, SecurityListItem } from './types';

export interface SecuritiesQuery {
  search?: string;
  sector?: string;
  /** Trading date to price the page at; omitted means the latest available. */
  as_of?: string;
  sort: SecuritiesSort;
  page: number;
  page_size: number;
}

export function useSecurities(query: SecuritiesQuery) {
  return useQuery({
    queryKey: ['securities', query],
    queryFn: () =>
      getEnvelope<SecurityListItem[]>('/securities', {
        search: query.search || undefined,
        sector: query.sector || undefined,
        as_of: query.as_of || undefined,
        sort: query.sort,
        page: query.page,
        page_size: query.page_size,
      }),
    placeholderData: (previous) => previous,
  });
}

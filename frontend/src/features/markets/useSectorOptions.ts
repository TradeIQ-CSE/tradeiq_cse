import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { Sector, SecurityListItem } from './types';

// No dedicated GET /sectors endpoint in v0 — filter options are derived from
// the distinct `sector` objects in GET /securities responses, per
// docs/api/endpoint-catalogue-v0.md §8. Two full pages (max page_size 200)
// comfortably cover the ~300-security dataset.
export function useSectorOptions() {
  return useQuery({
    queryKey: ['securities', 'sector-options'],
    queryFn: async (): Promise<Sector[]> => {
      const first = await getEnvelope<SecurityListItem[]>('/securities', {
        page: 1,
        page_size: 200,
        sort: 'symbol',
      });
      const total = first.meta?.total ?? first.data.length;
      const rest =
        total > 200
          ? await getEnvelope<SecurityListItem[]>('/securities', {
              page: 2,
              page_size: 200,
              sort: 'symbol',
            })
          : null;

      const bySectorCode = new Map<string, Sector>();
      for (const item of [...first.data, ...(rest?.data ?? [])]) {
        if (item.sector) bySectorCode.set(item.sector.gics_code, item.sector);
      }
      return [...bySectorCode.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: Infinity,
  });
}

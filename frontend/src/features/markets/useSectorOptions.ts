import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';
import { Sector, SecurityListItem } from './types';

// No dedicated GET /sectors endpoint in v0 — filter options are derived from
// the distinct `sector` objects in GET /securities responses, per
// docs/api/endpoint-catalogue-v0.md §8. Fetch every page rather than assuming a
// fixed security count: the full historical bundle includes inactive share
// classes and can exceed two maximum-sized pages.
export function useSectorOptions() {
  return useQuery({
    queryKey: ['securities', 'sector-options'],
    queryFn: async (): Promise<Sector[]> => {
      const pageSize = 200;
      const first = await getEnvelope<SecurityListItem[]>('/securities', {
        page: 1,
        page_size: pageSize,
        sort: 'symbol',
      });
      const total = first.meta?.total ?? first.data.length;
      const pageCount = Math.ceil(total / pageSize);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          getEnvelope<SecurityListItem[]>('/securities', {
            page: index + 2,
            page_size: pageSize,
            sort: 'symbol',
          }),
        ),
      );

      const bySectorCode = new Map<string, Sector>();
      for (const item of [first, ...rest].flatMap((page) => page.data)) {
        if (item.sector) bySectorCode.set(item.sector.gics_code, item.sector);
      }
      return [...bySectorCode.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: Infinity,
  });
}

import { useQuery } from '@tanstack/react-query';
import { getEnvelope } from '../../lib/api';

// The valuation date has to stay inside the range market-trading actually
// holds prices for, or /positions and /summary answer 400 VALIDATION_FAILED
// ("must fall between ..."). Nothing on the paper-trading endpoints reports
// that range, so this reads the same source MarketsPage's trading-date control
// uses: the meta on GET /securities. One row is enough — only meta is wanted.
export function useTradingDateBounds() {
  const { data } = useQuery({
    queryKey: ['trading-date-bounds'],
    queryFn: () => getEnvelope<unknown[]>('/securities', { page: 1, page_size: 1 }),
    staleTime: Infinity,
  });

  return {
    availableFrom: data?.meta?.available_from ?? undefined,
    availableTo: data?.meta?.available_to ?? undefined,
  };
}

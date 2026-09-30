import { useQuery } from '@tanstack/react-query';
import { getBacktestPolicy } from '../api/backtestApi';
import { FALLBACK_BACKTEST_MAX_DATE } from '../domain/bounds';

export function useBacktestPolicy() {
  const query = useQuery({
    queryKey: ['backtest-policy'],
    queryFn: getBacktestPolicy,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
    retryDelay: 500,
  });
  return { ...query, maxDate: query.data?.maxDate ?? FALLBACK_BACKTEST_MAX_DATE, isFallback: !query.data };
}

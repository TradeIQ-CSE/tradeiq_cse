import { useQuery } from '@tanstack/react-query';
import { getPortfolioPerformance, listBacktests } from './api';

export function useBacktestList(page: number) {
  return useQuery({
    queryKey: ['analytics', 'backtests', page],
    queryFn: () => listBacktests(page),
    placeholderData: (previous) => previous,
  });
}

export function usePortfolioPerformance(portfolioId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'performance', portfolioId],
    queryFn: () => getPortfolioPerformance(portfolioId as string),
    enabled: !!portfolioId,
  });
}

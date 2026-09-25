import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import { addToWatchlist, getWatchlist, removeFromWatchlist, Watchlist } from './api';

export const WATCHLIST_KEY = ['watchlist'] as const;

/** The signed-in user's watchlist. Idle, with no data, for a guest. */
export function useWatchlist() {
  const { status } = useAuth();
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: getWatchlist,
    enabled: status === 'authenticated',
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => addToWatchlist(symbol),
    // The server answers with the whole list, so there is nothing to refetch.
    onSuccess: (watchlist) => queryClient.setQueryData(WATCHLIST_KEY, watchlist),
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (symbol: string) => removeFromWatchlist(symbol),
    // Removal can't fail on a business rule, so the row goes at once.
    onMutate: async (symbol) => {
      await queryClient.cancelQueries({ queryKey: WATCHLIST_KEY });
      const previous = queryClient.getQueryData<Watchlist>(WATCHLIST_KEY);
      if (previous) {
        queryClient.setQueryData<Watchlist>(WATCHLIST_KEY, {
          ...previous,
          items: previous.items.filter((item) => item.symbol !== symbol),
        });
      }
      return { previous };
    },
    onError: (_error, _symbol, context) => {
      if (context?.previous) queryClient.setQueryData(WATCHLIST_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

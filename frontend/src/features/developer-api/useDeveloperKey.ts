import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import {
  createDeveloperKey,
  getDeveloperKey,
  getDeveloperUsage,
  regenerateDeveloperKey,
  revokeDeveloperKey,
} from './api';

export const DEVELOPER_KEY_QUERY_KEY = ['developer-key'] as const;
export const DEVELOPER_USAGE_QUERY_KEY = ['developer-usage'] as const;

/** The signed-in user's active key metadata, or `null`. Never carries the secret. */
export function useDeveloperKey() {
  const { status } = useAuth();
  return useQuery({
    queryKey: DEVELOPER_KEY_QUERY_KEY,
    queryFn: getDeveloperKey,
    enabled: status === 'authenticated',
  });
}

export function useDeveloperUsage() {
  const { status } = useAuth();
  return useQuery({
    queryKey: DEVELOPER_USAGE_QUERY_KEY,
    queryFn: getDeveloperUsage,
    enabled: status === 'authenticated',
  });
}

function invalidateDeveloperApi(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: DEVELOPER_KEY_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: DEVELOPER_USAGE_QUERY_KEY });
}

/**
 * The secret each of these three mutations can return lives only in the
 * caller's own state (set from the mutate() callback's argument) — never
 * read back off `mutation.data`, so it never lingers in the query client.
 */
export function useCreateDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => createDeveloperKey(label),
    onSuccess: () => invalidateDeveloperApi(queryClient),
  });
}

export function useRegenerateDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => regenerateDeveloperKey(label),
    onSuccess: () => invalidateDeveloperApi(queryClient),
  });
}

export function useRevokeDeveloperKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => revokeDeveloperKey(),
    onSuccess: () => invalidateDeveloperApi(queryClient),
  });
}

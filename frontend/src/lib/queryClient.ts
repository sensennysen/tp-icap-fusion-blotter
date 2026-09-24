import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient.js';

export const tradesQueryKey = ['trades'] as const;

export const authQueryKey = ['auth', 'me'] as const;

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // A mutation rejected with 401 means the session cookie is gone (logged
    // out elsewhere, cleared): re-check it so the app drops back to login.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          void client.invalidateQueries({ queryKey: authQueryKey });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
  return client;
}

export const queryClient = createQueryClient();

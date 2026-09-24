import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, LoginInput } from '@fusion-blotter/shared';
import { ApiError, apiClient } from '../lib/apiClient.js';
import { authQueryKey } from '../lib/queryClient.js';

// "Not logged in" is a normal state, not a query error.
async function fetchSessionUser(): Promise<AuthUser | null> {
  try {
    return await apiClient.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: fetchSessionUser,
    // The session only changes through login/logout (which write the cache)
    // or a 401 from a mutation (which invalidates it).
    staleTime: Infinity,
  });

  const login = useMutation({
    mutationFn: (input: LoginInput) => apiClient.login(input),
    onSuccess: (user) => queryClient.setQueryData(authQueryKey, user),
  });

  const logout = useMutation({
    mutationFn: () => apiClient.logout(),
    onSuccess: () => queryClient.setQueryData(authQueryKey, null),
  });

  return {
    user: sessionQuery.data ?? null,
    isLoading: sessionQuery.isLoading,
    isError: sessionQuery.isError,
    refetch: sessionQuery.refetch,
    login,
    logout,
  };
}

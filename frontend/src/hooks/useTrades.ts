import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AmendTradeInput,
  CreateTradeInput,
  Trade,
  TradeListQuery,
} from '@fusion-blotter/shared';
import { apiClient } from '../lib/apiClient.js';
import { tradesQueryKey } from '../lib/queryClient.js';

export function useTrades(filters: TradeListQuery) {
  const queryClient = useQueryClient();

  const tradesQuery = useQuery({
    queryKey: [...tradesQueryKey, filters],
    queryFn: () => apiClient.listTrades(filters),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: tradesQueryKey });

  const createTrade = useMutation({
    mutationFn: (input: CreateTradeInput) => apiClient.createTrade(input),
    onSuccess: invalidate,
  });

  const amendTrade = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AmendTradeInput }) =>
      apiClient.amendTrade(id, input),
    onSuccess: invalidate,
  });

  const cancelTrade = useMutation({
    mutationFn: (id: string) => apiClient.cancelTrade(id),
    onSuccess: invalidate,
  });

  return {
    trades: tradesQuery.data ?? [],
    isLoading: tradesQuery.isLoading,
    isError: tradesQuery.isError,
    refetch: tradesQuery.refetch,
    createTrade,
    amendTrade,
    cancelTrade,
  };
}

export type { Trade };

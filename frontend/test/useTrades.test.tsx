import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type {
  AmendTradeInput,
  CreateTradeInput,
  Trade,
  TradeListQuery,
} from '@fusion-blotter/shared';
import { useTrades } from '../src/hooks/useTrades.js';
import { ApiError, apiClient } from '../src/lib/apiClient.js';
import { tradesQueryKey } from '../src/lib/queryClient.js';

vi.mock('../src/lib/apiClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/apiClient.js')>();
  return {
    ...actual,
    apiClient: {
      listTrades: vi.fn(),
      getTrade: vi.fn(),
      createTrade: vi.fn(),
      amendTrade: vi.fn(),
      cancelTrade: vi.fn(),
    },
  };
});

const listTrades = vi.mocked(apiClient.listTrades);
const createTrade = vi.mocked(apiClient.createTrade);
const amendTrade = vi.mocked(apiClient.amendTrade);
const cancelTrade = vi.mocked(apiClient.cancelTrade);

const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: '2026-09-24T09:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
};

const createInput: CreateTradeInput = {
  symbol: 'MSFT',
  side: 'SELL',
  quantity: 50,
  price: 410.25,
  trader: 'asmith',
  book: 'EQ-NY-02',
  counterparty: 'JPM',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderUseTrades(initialFilters: TradeListQuery = {}) {
  return renderHook(({ filters }) => useTrades(filters), {
    wrapper,
    initialProps: { filters: initialFilters },
  });
}

async function renderLoaded(initialFilters: TradeListQuery = {}) {
  const view = renderUseTrades(initialFilters);
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  listTrades.mockResolvedValue([trade]);
  // Mirrors the app client's staleTime so cache hits behave as in production; no retries so
  // failures surface immediately.
  queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
});

describe('useTrades list query', () => {
  it('fetches with the given filters and exposes the trades', async () => {
    const filters: TradeListQuery = { symbol: 'AAPL', side: 'BUY' };
    const { result } = renderUseTrades(filters);

    expect(result.current.isLoading).toBe(true);
    expect(result.current.trades).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.trades).toEqual([trade]);
    expect(result.current.isError).toBe(false);
    expect(listTrades).toHaveBeenCalledTimes(1);
    expect(listTrades).toHaveBeenCalledWith(filters);
  });

  it('caches under the exact key useRealtimeTrades reconciles into', async () => {
    const filters: TradeListQuery = { status: 'ACTIVE' };
    await renderLoaded(filters);

    expect(queryClient.getQueryData([...tradesQueryKey, filters])).toEqual([trade]);
    expect(queryClient.getQueryCache().findAll({ queryKey: tradesQueryKey })).toHaveLength(1);
  });

  it('normalises filters so untrimmed and blank text share the trimmed key', async () => {
    const { rerender } = await renderLoaded({ symbol: ' AAPL ', trader: '   ' });

    expect(listTrades).toHaveBeenCalledWith({ symbol: 'AAPL' });
    expect(queryClient.getQueryData([...tradesQueryKey, { symbol: 'AAPL' }])).toEqual([trade]);

    rerender({ filters: { symbol: 'AAPL' } });
    rerender({ filters: { symbol: 'AAPL ', trader: '' } });

    expect(listTrades).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().findAll({ queryKey: tradesQueryKey })).toHaveLength(1);
  });

  it('reads data already written to its key without fetching', () => {
    const filters: TradeListQuery = { trader: 'jdoe' };
    queryClient.setQueryData([...tradesQueryKey, filters], [trade]);

    const { result } = renderUseTrades(filters);

    expect(result.current.trades).toEqual([trade]);
    expect(listTrades).not.toHaveBeenCalled();
  });

  it('sets isError when the list request fails', async () => {
    listTrades.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    const { result } = renderUseTrades();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.trades).toEqual([]);
  });

  it('refetch() calls the API again', async () => {
    const { result } = await renderLoaded();

    await act(() => result.current.refetch());

    expect(listTrades).toHaveBeenCalledTimes(2);
  });
});

describe('useTrades filter changes', () => {
  it('re-queries with the new params whenever a filter changes', async () => {
    const { result, rerender } = await renderLoaded();

    rerender({ filters: { symbol: 'MSFT' } });
    await waitFor(() => expect(listTrades).toHaveBeenCalledTimes(2));
    expect(listTrades).toHaveBeenLastCalledWith({ symbol: 'MSFT' });

    rerender({ filters: { symbol: 'MSFT', side: 'SELL' } });
    await waitFor(() => expect(listTrades).toHaveBeenCalledTimes(3));
    expect(listTrades).toHaveBeenLastCalledWith({ symbol: 'MSFT', side: 'SELL' });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('serves previously seen filters from the cache within staleTime', async () => {
    const { rerender } = await renderLoaded();

    rerender({ filters: { side: 'SELL' } });
    await waitFor(() => expect(listTrades).toHaveBeenCalledTimes(2));

    rerender({ filters: {} });
    await act(() => Promise.resolve());

    expect(listTrades).toHaveBeenCalledTimes(2);
  });

  it('treats a cleared filter (undefined) as the unfiltered query', async () => {
    const { result, rerender } = await renderLoaded();

    rerender({ filters: { symbol: undefined } });
    await act(() => Promise.resolve());

    expect(result.current.trades).toEqual([trade]);
    expect(listTrades).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().findAll({ queryKey: tradesQueryKey })).toHaveLength(1);
  });
});

describe('useTrades mutations', () => {
  const cancelled: Trade = { ...trade, status: 'CANCELLED' };
  const amended: Trade = { ...trade, quantity: 250 };

  const cases = [
    {
      name: 'createTrade',
      mock: createTrade,
      run: (hook: ReturnType<typeof useTrades>) => hook.createTrade.mutateAsync(createInput),
      expectedArgs: [createInput],
      resolved: { ...trade, id: 'trade-2', ...createInput },
    },
    {
      name: 'amendTrade',
      mock: amendTrade,
      run: (hook: ReturnType<typeof useTrades>) =>
        hook.amendTrade.mutateAsync({ id: 'trade-1', input: { quantity: 250 } }),
      expectedArgs: ['trade-1', { quantity: 250 }],
      resolved: amended,
    },
    {
      name: 'cancelTrade',
      mock: cancelTrade,
      run: (hook: ReturnType<typeof useTrades>) => hook.cancelTrade.mutateAsync('trade-1'),
      expectedArgs: ['trade-1'],
      resolved: cancelled,
    },
  ] as const;

  describe.each(cases)('$name', ({ mock, run, expectedArgs, resolved }) => {
    it('calls the API with the right arguments and refetches the list on success', async () => {
      (mock as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resolved);
      const { result } = await renderLoaded();

      const returned = await act(() => run(result.current));

      expect(returned).toEqual(resolved);
      expect(mock).toHaveBeenCalledWith(...expectedArgs);
      expect(listTrades).toHaveBeenCalledTimes(2);
    });

    it('resolves only after the invalidation refetch settles', async () => {
      (mock as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resolved);
      const { result } = await renderLoaded();
      const refetch = deferred<Trade[]>();
      listTrades.mockReturnValueOnce(refetch.promise);

      let settled = false;
      let pending!: Promise<unknown>;
      act(() => {
        pending = run(result.current).then(() => {
          settled = true;
        });
      });

      await waitFor(() => expect(listTrades).toHaveBeenCalledTimes(2));
      expect(settled).toBe(false);

      await act(async () => {
        refetch.resolve([resolved]);
        await pending;
      });
      expect(settled).toBe(true);
      expect(queryClient.getQueryData([...tradesQueryKey, {}])).toEqual([resolved]);
      await waitFor(() => expect(result.current.trades).toEqual([resolved]));
    });

    it('does not refetch and passes the ApiError through on failure', async () => {
      const error = new ApiError(409, 'CONFLICT', 'trade is already cancelled');
      (mock as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);
      const { result } = await renderLoaded();

      let caught: unknown;
      await act(async () => {
        caught = await run(result.current).catch((err: unknown) => err);
      });

      expect(caught).toBe(error);
      expect(listTrades).toHaveBeenCalledTimes(1);
    });
  });

  it('invalidates every cached filter variant, not just the active one', async () => {
    const inactiveKey = [...tradesQueryKey, { side: 'SELL' }];
    queryClient.setQueryData(inactiveKey, [trade]);
    cancelTrade.mockResolvedValueOnce(cancelled);
    const { result } = await renderLoaded();

    expect(queryClient.getQueryState(inactiveKey)?.isInvalidated).toBe(false);
    await act(() => result.current.cancelTrade.mutateAsync('trade-1'));

    expect(queryClient.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
  });
});

describe('useTrades types', () => {
  it('is typed against shared/', () => {
    const { result } = renderUseTrades();

    expectTypeOf(result.current.trades).toEqualTypeOf<Trade[]>();
    expectTypeOf(result.current.createTrade.mutateAsync)
      .parameter(0)
      .toEqualTypeOf<CreateTradeInput>();
    expectTypeOf(result.current.amendTrade.mutateAsync)
      .parameter(0)
      .toEqualTypeOf<{ id: string; input: AmendTradeInput }>();
    expectTypeOf(result.current.cancelTrade.mutateAsync).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(result.current.createTrade.mutateAsync).returns.resolves.toEqualTypeOf<Trade>();
  });
});

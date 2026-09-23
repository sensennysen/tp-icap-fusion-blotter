# useTrades Hook Test Pattern

For `frontend/src/hooks/useTrades.ts` (see `frontend/test/useTrades.test.tsx`). No `fetch` and no
server; the hook is exercised through `renderHook` against a real `QueryClient`.

- Mock at the `apiClient` boundary with `vi.mock('../src/lib/apiClient.js', importOriginal)`: spread
  the real module so `ApiError` stays the real class, and replace only `apiClient` with `vi.fn()`s.
  `apiClient.test.ts` already covers the HTTP layer; here the question is only what the hook calls.
- Build a fresh `QueryClient` per test with `staleTime: 30_000` (mirrors `lib/queryClient.ts`, so
  cache hits behave as in the app) and `retry: false` (so a rejected list sets `isError` at once).
  Never share the app's singleton `queryClient` between tests.
- Drive filter changes with `renderHook(({ filters }) => useTrades(filters), { initialProps })` and
  `rerender({ filters })`, then assert `listTrades` call count and `toHaveBeenLastCalledWith`.
- Pin the cache-key contract with `useRealtimeTrades`: data must sit at exactly
  `[...tradesQueryKey, filters]`, and seeding that key with `setQueryData` must be read with no fetch.
- `{ symbol: undefined }` and `{}` hash to the same key; assert one cache entry and one fetch, so a
  cleared filter never adds a cache entry.
- "`mutateAsync` resolves after the refetch": queue a `deferred()` promise with
  `listTrades.mockReturnValueOnce`, start the mutation inside `act`, wait for the second
  `listTrades` call, assert the mutation has not settled, then resolve the deferred. Read the
  post-refetch list with `getQueryData` or `waitFor`: `result.current` updates one notifyManager
  tick (`setTimeout(0)`) later than the cache, so a plain `expect` right after `act` sees stale data.
- Invalidation scope: seed an inactive filter variant, run a mutation, and assert
  `getQueryState(key).isInvalidated`. This kills an "invalidate only the active key" mutant.
- Table-drive the three mutations with `describe.each` (success + refetch, resolves after refetch,
  failure passes the same `ApiError` through with no refetch).
- Mutation-check: drop `filters` from the key or `queryFn`, drop each `onSuccess`, invalidate the wrong
  key or only the active key, make `invalidate` fire-and-forget, swap or drop mutation args, drop
  `?? []`, hardcode `isError` / `isLoading`, and stub `refetch`.

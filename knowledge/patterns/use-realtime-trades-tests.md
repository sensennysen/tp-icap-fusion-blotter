# useRealtimeTrades Hook Test Pattern

For `frontend/src/hooks/useRealtimeTrades.ts` (see `frontend/test/useRealtimeTrades.test.tsx`). No
server; the hook is exercised through `renderHook` against a real `QueryClient` and a stubbed
global `WebSocket`.

- `MockWebSocket` records every instance in a static `instances` array and replays listeners
  through `emit(type, event)`. Its `close()` emits `close`, like the hook's cleanup. Drive the
  server side with helpers wrapped in `act`: `openSocket()` (accepted), `dropSocket()`
  (network/server close) and `emitRaw(data)` / `emitEvent(event)`. "A reconnect happened" means
  `instances.length` grew.
- Use fake timers (`vi.useFakeTimers()` in `beforeEach`) for backoff. Table-drive the delays: for
  each `[1s, 2s, 4s, 8s, 16s, 30s, 30s]`, drop, advance `delay - 1` (no new socket), advance `1`
  (new socket). That one loop pins the initial delay, the doubling and the cap.
- Count toasts with a spy that still delegates to the real provider: `vi.mock` the ToastProvider
  module with `importOriginal`, wrap `useToast` so it returns a stable `vi.hoisted` `vi.fn` that
  forwards to the real `showToast`. The spy survives the provider's 5s auto-dismiss (which fake
  timers otherwise fire during long backoffs); `screen.getByText` still proves the text renders.
- A refused retry is just a `close` with no `open` before it. "Lost once per outage" is: open,
  drop, then drop again after each retry; expect one lost toast, then one restored on `open`.
- "No refetch": render `useQuery({ queryKey, queryFn: vi.fn() })` next to the hook with
  `staleTime: 30_000` and seeded data. Emit every event type and assert `queryFn` was never
  called. This kills an `invalidateQueries` mutant, which a bare `setQueryData` check misses.
- Reconcile across variants: seed several `[...tradesQueryKey, filters]` keys and assert each one
  against its own filters after one event. For "not loaded yet", `prefetchQuery` with a
  never-resolving `queryFn` (not awaited) and assert the key stays `undefined`.
- `VITE_WS_URL` is read at module load: `vi.stubEnv`, `vi.resetModules()`, then dynamically
  import the hook. React, TanStack and Testing Library are externalized, so they are not
  re-instantiated and the static `wrapper` still works. Pair with `vi.unstubAllEnvs()`.
- Malformed frames: `it.each` over non-JSON, non-string (`ArrayBuffer`), `null`, a number, bad or
  unknown `type`, a missing/null/string `payload`, and payloads without `id` / `tradeId`
  (`{ ...trade, id: undefined }` serializes without the key). Assert no throw, no cache change,
  no toast, and that the next valid frame still applies.
- Keep `try` around `JSON.parse` only. Wrapping the guard too makes its null checks unkillable,
  since the destructuring `TypeError` is swallowed by the same `catch`.
- Mutation-check: cap, doubling, initial delay, reset on open, `closedByEffect`, `clearTimeout`,
  `socket.close` on unmount, the `isConnected` / `hasLostConnection` gates, active-key-only write,
  variant filters ignored, seeding `undefined` lists, `invalidateQueries` added, each guard clause,
  each `reconcile` branch, each `matchesFilter` clause, `filters` in the effect deps.

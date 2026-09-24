# Blotter Page Test Pattern

For `TradeBlotterPage` as a whole (see `frontend/test/TradeBlotterPage.test.tsx`). Use it for any
test that needs a composed page to show that the toolbar, the grid, the realtime hook and the
toasts are wired together. What each piece does on its own stays in its own suite.

- Render the real page inside a real `QueryClient` (`retry: false`, `staleTime: 30_000`) and a
  real `ToastProvider`. Don't mock the hooks. The wiring is what's being tested.
- Stub `fetch` once and route by method. A GET goes to `listResponse(url)`, and anything else
  goes to `mutationResponse()`. Both are `let`s that each test reassigns. Pass the parsed `URL`
  so a list stub can filter on `searchParams` and return what a real server would.
- Reassign `listResponse` **after** the first load (`await findByText(...)`) to control what
  Refresh returns. Refresh must refetch even inside `staleTime`: assert two GETs.
- `refetch()` never throws. It resolves with `isError`, so a failed Refresh has to be checked
  through the page's toast. A try/catch in the page would never run.
- Load error vs empty result: when the first GET fails, assert the `role="alert"` message
  appears **and** "No trades match the current filters." does not.
- WebSocket: use a `MockWebSocket` whose `addEventListener` records listeners and whose
  `emit(type, event)` calls them. Keep `instances` and reset it in `beforeEach`. Send events
  inside `act(...)` as a JSON string (`parseEvent` ignores anything that isn't a string).
- Wait for the first list to load before emitting. `useRealtimeTrades` skips cache entries
  that are still `undefined`, so an event sent earlier is dropped.
- No refetch per event (AGENTS.md): after the row updates, assert the GET count is still 1.
- Layout: check the ARCH §11 order with
  `control.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING`, and find the
  filters as `getByRole('group', { name: 'Filter trades' })` (the `fieldset` legend).
- Mutation-check by reordering JSX (toolbar below grid), not by adding elements: an extra
  element can make a test fail for an unrelated reason, such as a duplicate role match.
- Live check (`/validate`): WebSocket events can be tested with no DB write. Start Vite with
  `VITE_WS_URL=ws://localhost:4100` and keep `VITE_API_BASE_URL` on the real backend. On 4100
  run a tiny `ws` server that broadcasts any `POST /emit` body. The file must sit under
  `backend/` so that `import 'ws'` resolves. Build the payloads from a real `GET` row, send
  created/amended/cancelled, and check the rows, the toasts and that no GET was sent. For
  failure paths, pause GETs with CDP `Fetch` and fulfill a 500 that includes
  `Access-Control-Allow-Origin`. The app's `retry: 1` means each failure takes 2 GETs.

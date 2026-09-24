# TradeFilters Test Pattern

For `frontend/src/components/TradeFilters.tsx` (see `frontend/test/TradeFilters.test.tsx`) and
`normalizeTradeListQuery` (`frontend/test/tradeListQuery.test.ts`).

- There are two layers. **Controls**: render with plain props and a `vi.fn` `onChange`. This
  checks what the component emits. **Wired**: a tiny `Blotter` harness
  (`useState` → `TradeFilters` + `useTrades`) with `fetch` stubbed via `vi.stubGlobal`. This
  checks what actually goes over the wire, which is what the ACs are about. Don't mock
  `apiClient` in the wired layer, or `toQueryString`'s omission of undefined values goes
  untested.
- Query controls by role and label: `getByRole('textbox' | 'combobox', { name })`.
- Controls: start from a fully populated filter set that includes `sort` / `order`, and assert
  `toHaveBeenLastCalledWith({ ...others, [field]: value })`. That catches a dropped `...filters`
  spread. For clears, also assert `expect(next[field]).toBeUndefined()`: that pins "omitted", not
  `''`.
- Wired: read requests as `new URL(url, 'http://localhost').searchParams`, and compare
  `Object.fromEntries(...)` so the order of params doesn't matter. Wait on the fetch _count_
  before reading the last call.
- To test that clearing omits a param, make sure the key left after clearing has never been
  fetched: set the control under test _first_, then a second filter, then clear. Otherwise the
  cleared key is a `staleTime` cache hit and no request is made.
- Use the same `QueryClient` defaults as the app (`staleTime: 30_000`) with `retry: false`, and
  call `queryClient.clear()` in `afterEach`.
- Whitespace: `user.type(input, ' AAPL ')` should produce exactly `'', A, AA, AAP, AAPL`. That
  single list proves both trimming and "no extra request for a surrounding space".
- Mutation-check: each trim, each blank-drop, each pass-through field, key vs request in
  `useTrades`, `toUndefined`, the spread, both `safeParse`s, a crossed handler, and the
  controlled `value`s.

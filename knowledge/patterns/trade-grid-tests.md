# TradeGrid Test Pattern

For `frontend/src/components/TradeGrid.tsx` (see `frontend/test/TradeGrid.test.tsx`). The grid is
rendered directly with plain props. It has no providers, because it takes `trades` from the page
rather than calling `useTrades` itself.

- Build a fixture where every sortable column orders the rows differently, and none of those
  orders matches the input order or the default (timestamp desc) order. Then a click that didn't
  sort, or sorted by the wrong column, can't pass by accident. Columns with ties (Side, Status)
  need the same care: their values in the input and default orders must not already be sorted.
- Read sort state from `aria-sort` on the `<th>`, not from the arrow glyph.
  `expectSortedBy(name, direction)` checks the attribute and that it is the only sorted header,
  which also catches a multi-sort regression.
- Query headers by accessible name (`getByRole('columnheader' | 'button', { name })`). The arrow
  is `aria-hidden`, so the name stays `'Timestamp'` whether or not the column is sorted, and an
  exact-name query fails if the arrow ever leaks into the name.
- Read a column by header index: `indexOf(header(name))` in `getAllByRole('columnheader')`, then
  the cell at that index in each `tbody` row (`getAllByRole('rowgroup')[1]`). Assert row order
  through the Trade ID column. For columns with ties, assert the column's own values (reversing
  a value list with ties is still the correct descending list).
- Drive every sortable column with one `it.each` table: `[header, firstDirection, ascValues]`.
  Click three times and expect first → second → first, never unsorted. Text columns start
  ascending and number columns descending (TanStack's auto direction). Timestamp starts sorted
  (desc), so it gets its own tests: the toggle, and "returning to it starts desc".
- Styling: jsdom has no compiled Tailwind, so assert the token classes (`bg-buy-bg`, `text-sell`,
  `opacity-50`). Assert both sides, so an inverted ternary fails.
- Timestamps render in the viewer's locale and timezone. Compare against
  `new Date(ts).toLocaleString()` computed in the test instead of pinning TZ.
- Row actions: assert the callback got that row's own trade object (`toBe`), after a re-sort as
  well as before. Rerender with new `onAmend` / `onCancel` and check the new ones fire, which
  catches stale `useMemo` deps.
- Live data: a `rerender` with a new `trades` array stands in for a `useRealtimeTrades` cache
  write. Prepend, like `reconcile` does. A back-dated trade proves arrivals are sorted rather
  than shown on top. A focused Amend button must stay focused and inside its own trade's row,
  which is the only observable effect of `getRowId` (index ids shift on prepend).
- Mutation-check: removal/multi-sort/`sortDescFirst` options, the default sort state, the
  `aria-sort` mapping, `aria-hidden`, the `getCanSort` header branch, the arrow glyphs, the price
  fraction digits, the badge ternary, the opacity class, the CANCELLED early return, each
  action's callback, the `useMemo` deps, the loading/empty branches, the timestamp format and
  `getRowId`. `sortFn: 'datetime'` is an equivalent mutant: the auto `alphanumeric` sort orders
  `toISOString` strings the same way.

## Virtualized path (bonus TASK-003)

Above `VIRTUALIZE_THRESHOLD` rows the grid windows its `<tbody>`. These tests live in their own
top-level `describe('TradeGrid virtualization')` so the suite above stays unchanged.

- jsdom has no layout. virtual-core measures both the scroll element and each rendered row
  (`measureElement`) with `offsetHeight`, which is 0 in jsdom, and skips observing because
  there's no `ResizeObserver`. Stub `HTMLElement.prototype.offsetHeight` in `beforeEach` so
  `<tr>` returns a row height and everything else returns the viewport height. Restore the saved
  descriptor in `afterEach`. Without the stub the virtualized grid renders no rows. With a single
  value for every element, each row measures viewport-tall.
- Prove rows are measured, not assumed: render the same data with the stubbed row height at the
  estimate and at a larger (wrapped) height. The larger one renders fewer rows and a total height
  above `n × estimate`. A fixed-height check in the real browser is what caught the missing
  measurement: real rows wrap to ~57px.
- Import `VIRTUALIZE_THRESHOLD` and test the boundary: exactly the threshold renders every row
  with no spacers, and threshold + 1 renders a window. This catches `>` vs `>=` and inverted
  comparisons.
- Build the bulk fixture so the default order (timestamp) and a sort column (quantity, a
  permutation `(i * 7919) % n + 1`) disagree. Then asserting the top values after a sort proves
  it sorted the whole dataset, not the rendered slice.
- Scroll by defining `scrollTop` on the container instance, then `fireEvent.scroll`. Check the
  expected row is present and the first row is gone, and that
  `top spacer + rendered × ROW_PX + bottom spacer = n × ROW_PX`.
- Spacer rows are `aria-hidden`, so `getAllByRole('row')` skips them. Reach them by
  `data-testid` and assert their `colspan` equals the header count, with and without `readOnly`.

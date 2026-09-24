# Trade Form Modal Test Pattern

For `CreateTradeModal` / `AmendTradeModal` (see `frontend/test/CreateTradeModal.test.tsx`,
`AmendTradeModal.test.tsx`, and the page wiring in `TradeBlotterPage.test.tsx`). Shared helpers
live in `frontend/test/tradeForm.ts`.

- There are three layers.
  - **Component**: `onSubmit` is a `vi.fn`. This checks validation messages, the exact
    payload, and when the modal closes.
  - **Wired**: a tiny harness passes `useTrades().createTrade` / `amendTrade` as `onSubmit`,
    with `fetch` stubbed via `vi.stubGlobal`. This checks the method, path and JSON body that go
    over the wire, and that a success refetches the list (count the `GET`s).
  - **Page**: `TradeBlotterPage` under `QueryClientProvider` + `ToastProvider`, with
    `WebSocket` stubbed by a no-op class. This checks the toast and whether the modal stays open
    or closes. Keep this layer to the mutation wiring only.
- Assert messages by **exact shared-schema text** (`'price allows at most 4 decimal places'`),
  not by regex. That makes the frontend suite a second check that it validates through
  `@fusion-blotter/shared`. Every schema mutant was killed by both suites.
- Scope field queries to the open dialog: `within(getByRole('dialog')).getByLabelText(/^Symbol/)`.
  The page's filter bar also has Symbol, Side and Trader. The `<label>` wraps the control and
  its error, so match on the label _prefix_. Read a field's error as
  `within(label).queryByRole('alert')`, so messages are tied to their input.
- Number inputs: an empty field reaches Zod as `NaN` (`valueAsNumber`). Test the empty field
  explicitly and expect "… is required". A cleared number input has the value `null` in
  `toHaveValue`, not `''`.
- Use `toHaveBeenCalledWith(fullObject)` for the payload, never `objectContaining`. Type
  `' AAPL '` to show the submit carries Zod's _parsed_ (trimmed) output.
- Close-on-success: use a manually resolved promise. Assert the button is disabled and
  `onClose` has not been called, then resolve and assert `onClose` was called once. For the
  failure path, reject with an `ApiError` and assert the input is still there.
- Server field errors: reject with `ApiError(400, 'VALIDATION_ERROR', …, fields)`, include an
  unknown key (`_`), and assert it is not rendered.
- Amend fixtures should differ from every create default (SELL, a 4dp price), or a missing
  pre-fill goes unnoticed.
- jsdom has no native constraint validation, so no test catches a missing `noValidate`. Check
  that in a real browser (a 5dp Price must show the Zod message, not a browser tooltip).
- Mutation-check: the rethrow in each page catch, `return` in each modal catch, each
  `setServerFieldErrors` call, `useId`, Escape handling and its cleanup, initial focus, each
  pre-fill, `valueAsNumber`, and each schema limit, message and constant. The
  `defaultValues: { side: 'BUY' }` mutant is equivalent: the select's first option is BUY.
- Live check without DB writes (`/validate`): use CDP `Fetch.enable` on `…/api/*`. Pass `GET` /
  `OPTIONS` through with `continueRequest`, and answer mutations with `fulfillRequest`,
  including `Access-Control-Allow-Origin`. That lets you drive the 500, 400-with-`fields` and
  409 paths against the real page and read the exact request body. Afterwards, confirm the row
  count and the target trade's `updatedAt` are unchanged.

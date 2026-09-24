# Cancel Confirm Test Pattern

For `CancelTradeConfirm` (see `frontend/test/CancelTradeConfirm.test.tsx` and the cancel block
in `TradeBlotterPage.test.tsx`). Use it for any confirm-then-async alertdialog.

- There are two layers.
  - **Component**: `onConfirm` and `onDismiss` are `vi.fn`s. This checks accessibility,
    keyboard behaviour and the pending-state lock.
  - **Page**: `TradeBlotterPage` with the shared `fetch`/`WebSocket` stubs. This checks the
    request, the toasts and when the dialog closes. Filter `fetch` calls to non-`GET` and
    assert the exact list of `METHOD url`, including `[]` for a dismiss.
- Query by role and accessible name: `getByRole('alertdialog', { name: 'Cancel TRD-100001?' })`.
  Check the warning with `toHaveAccessibleDescription(...)` so `aria-describedby` is tested.
  For id uniqueness, render two dialogs and compare their `aria-labelledby` and
  `aria-describedby`.
- Initial focus: assert `toHaveFocus()` on the **safe** button, then press `{Enter}` and assert
  `onDismiss` was called and `onConfirm` was not. That ties focus to what it is for.
- Pending lock: `onConfirm` returns a deferred promise. While it is pending, click Keep, click
  the busy button and press Escape. Assert `onDismiss` was not called and `onConfirm` was called
  once. Then resolve it, `waitFor` the button to be enabled, and check that Escape works again.
  The busy label changes the button's accessible name, so query it by its new name.
- Rejection: have `onConfirm` really reject and don't `.catch` it in the test. A leaked
  rejection then fails the run as an "Unhandled Rejection" (this is how #128 was found).
- Listener cleanup: `view.unmount()`, press Escape, and assert `onDismiss` was not called.
- Page failure paths: use `it.each` over a 500 and a 409 already-cancelled response. Both must
  toast "Failed to cancel trade" **and** close the dialog. That close-regardless contract is
  specific to cancel. Create/amend stay open on failure.
- Mutation-check: the Escape guard, ref set/reset, cleanup, initial focus, the Keep `disabled`,
  the `catch`, `aria-describedby`, the busy label, the page's `finally` close, the id passed to
  `mutateAsync`, and each toast.
- Live check (`/validate`): reuse the #124 CDP setup (`Fetch.fulfillRequest` for non-GET, with
  `Access-Control-Allow-Origin`). To test the pending lock, hold the fulfill for about 1.5s.
  Call `Emulation.setFocusEmulationEnabled` before asserting `document.activeElement`. Wait
  more than 5s between toast checks so the previous toast has expired.

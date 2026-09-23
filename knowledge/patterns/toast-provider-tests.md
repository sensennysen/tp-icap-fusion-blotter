# ToastProvider Test Pattern

For `frontend/src/components/Toast/ToastProvider.tsx` (see `frontend/test/ToastProvider.test.tsx`).
The provider is tested directly. Consumers (`useRealtimeTrades`, `TradeBlotterPage`) test their
own toast calls with the spy wrapper in `use-realtime-trades-tests.md`.

- Render the real provider around a `Probe` that pushes `useToast()` into a `seen` array on every
  render. The last entry drives the API (`showToast` / `dismissToast` inside `act`), and the whole
  array lets you check that `showToast` / `dismissToast` keep the same identity across renders.
  `rerender` with no toast change and assert `seen[1]` is `seen[0]`; this kills a
  "drop the `useMemo`" mutant.
- Fake only `setTimeout` / `clearTimeout` (`vi.useFakeTimers({ toFake: [...] })`). Then
  `vi.getTimerCount()` counts exactly the provider's auto-dismiss timers, which is how timer
  leaks are asserted (dismiss, eviction, unmount). If you fake everything, React's scheduler
  timers get counted too.
- Pin expiry at the boundary: advance `TOAST_DURATION_MS - 1` (still there), then `1` (gone).
  Import the exported constants instead of hardcoding 5000 / 5.
- Read the stack order from the `Notifications` region with
  `querySelectorAll('[role="status"], [role="alert"]')`. `*ByRole` takes a single role, and the
  stack mixes both.
- `it.each` over the 4 variants: bg token class, role (`alert` for error, `status` otherwise), and
  the message inside that toast.
- Click the dismiss button with `fireEvent`. `userEvent` needs `advanceTimers` wiring under fake
  timers, and the button has no async behaviour.
- For the cap, show `MAX_TOASTS + 2` toasts, then assert the newest `MAX_TOASTS` are shown,
  `getTimerCount() === MAX_TOASTS`, and that none of them expire early.
- For unmount, spy on `console.error`, unmount with toasts pending, check the timer count is 0,
  advance past the duration, and expect no calls.
- To check ids don't use crypto, stub `crypto.randomUUID` to throw.
- Mutation-check: each `clearTimeout` / `delete`, the state `slice`, the cap comparison, the
  role ternary, the `useMemo`, the duration, the id source, the button `onClick`, the dismiss
  filter, the append order, and the `showToast` deps.

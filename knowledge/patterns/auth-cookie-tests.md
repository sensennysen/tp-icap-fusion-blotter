# Mock-Auth Cookie Test Pattern

For any backend test that sends a trade mutation through `createApp` (supertest or real `fetch`):

- Send `.set('Cookie', sessionCookie())` from `backend/test/helpers/auth.ts`. It builds the real
  `fusion_session` value through `encodeSession`, so a change to the cookie format breaks the
  helper, not every test. Pass `{ username }` when the test asserts the audit `changedBy`, and
  `{ role: 'viewer' }` for the 403 path.
- A mutation that forgets the cookie fails loudly with `401`. Don't "fix" that by stubbing
  `requireRole`, because the guard's wiring is what the route and app suites exist to prove.
- For each guarded route, cover both rejections (no session → 401, viewer → 403) and assert the
  side effects did not happen: service not called (stub suites), or no row/audit change (DB suites).
- Unit-test `requireRole` by passing `{} as Parameters<typeof guard>[0]`. Its param type is
  `RequestHandler<Record<string, string>>`, so a plain `Request` cast doesn't fit (see retro).
- To assert something is kept out of the logs, capture at pino's destination
  (`logger[pino.symbols.streamSym].write`) with `logger.level` raised for the test. A spy on
  `child.info` sees the raw `req`/`res` objects, before serializers and `redact` run.

Frontend:

- App-level tests use `createQueryClient()` (with `retry: false` set via `setDefaultOptions`) so
  the real 401 → re-check-session `MutationCache` handler is exercised. A bare `new QueryClient()`
  silently drops it.
- A fake `fetch` that routes by path should strip any base-URL prefix. In tests,
  `VITE_API_BASE_URL` is unset, so requests go to `undefined/auth/me`.

# API Client Test Pattern

For `frontend/src/lib/apiClient.ts` (see `frontend/test/apiClient.test.ts`). No server and no DOM
rendering; `fetch` is stubbed and the client is exercised as plain async functions.

- Stub `fetch` with `vi.stubGlobal('fetch', vi.fn())` and queue `new Response(text, { status })`
  values with `mockResolvedValueOnce`. Real `Response` objects exercise the real `res.text()` path, so
  non-JSON, empty and `null` bodies are cheap to build. Restore with `vi.unstubAllGlobals()`.
- `BASE_URL` is read when the module loads. Pin it with `vi.stubEnv('VITE_API_BASE_URL', ...)`, call
  `vi.resetModules()`, then `await import(...)` in `beforeEach`. A static import would freeze whatever
  `.env` held. Undo with `vi.unstubAllEnvs()`.
- Assert request shape from `fetchMock.mock.calls.at(-1)`: URL, `method`, parsed `body`, and that a
  body-less call (`cancelTrade`, GETs) sends none. Parse query strings with `new URL(...)` rather than
  comparing strings, except where exact `?` presence is the behaviour under test.
- Error cases go through a small `caught(promise)` helper that returns the rejection, so one
  assertion can check `toBeInstanceOf` and `toMatchObject` together. `expect(...).rejects` twice
  would consume the queued response.
- Cover every way a failure is not the server envelope: HTML from a proxy, an empty body, JSON with
  no `error` key, a malformed `error`, and a rejected `fetch`. Each must become a typed `ApiError`.
- Type-level checks with `expectTypeOf` are real gates here: `pnpm typecheck` includes
  `frontend/test`, and the acceptance criterion is "typed against shared/".
- Mutation-check: drop `encodeURIComponent`, change a method or path, drop `fields`, swap the
  `HTTP_ERROR` fallback for a rethrow, drop the `fetch` try/catch, drop the `undefined` filter in
  `toQueryString`.

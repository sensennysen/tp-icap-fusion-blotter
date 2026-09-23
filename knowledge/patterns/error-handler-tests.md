# Error Handler Test Pattern

For `backend/src/middleware/errorHandler.ts` (see `backend/test/middleware/errorHandler.test.ts`).
No DB and no sockets; the error layer is exercised over HTTP with supertest.

- Two apps. `createApp(stubService)` proves the real middleware order and that routes forward errors
  (`vi.fn()` stub service, `as unknown as TradeService`). A tiny `express()` app whose route calls
  `next(err)` and mounts `errorHandler` last covers errors the real routes cannot be made to throw
  (root-level `ZodError`, non-Error values, custom `AppError` statuses).
- Spy on the real logger (`vi.spyOn(logger, 'error')`), do not `vi.mock` the logger module:
  `requestLogger` wraps the same instance in `pino-http`, so a hand-rolled mock breaks app startup.
  Use `mockResolvedValue`/`resetAllMocks` in `beforeEach`, then re-install the spy.
- Every branch asserts the exact body with `toEqual`, plus what did not happen: 4xx paths assert
  `logError` was not called, the service was not called, and (500) that a distinctive secret from the
  thrown message is absent from `res.text`.
- Build `ZodError`s from real schemas (`safeParse`, then throw `result.error`) rather than
  hand-constructing issues, so path and message shape match what routes produce.
- Body-parser failures (`entity.parse.failed`, `PayloadTooLargeError`) are raised before any route
  runs, so test them through `createApp` with a raw `Content-Type: application/json` body.
- `next(null)` and `next(undefined)` mean "no error" in Express, so they cannot be thrown at the
  handler; test truthy non-Error values instead.
- Mutation-check by restoring from a copy of the file, not `git checkout`, when the file under test
  has uncommitted changes. Survivors that only differ by an `undefined` JSON property are equivalent.

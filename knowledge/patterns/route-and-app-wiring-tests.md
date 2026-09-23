# Route and App Wiring Test Pattern

For `backend/src/app.ts` and `backend/src/routes/` (see `backend/test/app.test.ts` and
`backend/test/routes/trades.test.ts`). Two layers, split by whether the DB is involved.

**Wiring (`app.test.ts`, no DB):** `createApp(stub as unknown as TradeService)` with `vi.fn()` methods.

- Assert CORS against `env.CORS_ORIGIN`, never a hardcoded URL. `cors({ origin: <string> })` always
  answers with the configured origin, so assert it is neither `*` nor the hostile `Origin` sent.
- Body limit: one body just under 100kb reaches the stub, one just over does not.
- pino-http logs on a per-request child logger. `vi.spyOn(logger, 'info')` misses it; spy on
  `logger.child` and replace the returned child's `info` with a recorder. Don't pass through to the
  real `info`, or pino dumps the raw req/res objects into the test output.
- Delegation: assert the stub receives the parsed (trimmed) input and the route id, and that a
  validation failure never calls the service.
- `vi.spyOn(logger, 'error')` in `beforeEach` after `resetAllMocks`, as in `error-handler-tests.md`.

**Routes (`routes/trades.test.ts`, real Postgres):** follows `db-backed-tests.md`, adapted because the
API generates `tradeId`.

- A `createTrade()` helper POSTs, pushes the returned `id` onto a `created` list, then asserts 201.
  Track the id before asserting, or a failing assertion leaks the row.
- `afterEach` deletes `where: { id: { in: created } }`; never an unfiltered `deleteMany()`.
- Use distinctive symbols (`ZZ...`) so filter/sort assertions are narrowed to this file's rows.
- Mutation-check by restoring from a copy of the file, then confirm the table is back to its
  starting row count.

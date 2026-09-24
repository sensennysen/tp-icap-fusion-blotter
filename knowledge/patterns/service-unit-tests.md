# Service Unit Test Pattern

For business-rule tests on `backend/src/services/` (see `backend/test/tradeService.test.ts`). The
repository is mocked and the broadcaster is a `{ broadcast: vi.fn() }` stub, so no DB and no sockets.
DB behaviour belongs in `test/repositories/`, HTTP mapping in `test/routes/`, real sockets in
`test/realtime/` (see `db-backed-tests.md`, `ws-integration-tests.md`).

- `vi.mock` the repository module with a `vi.fn()` per method, then `await import` the service after
  it (the mock must be registered before the service module loads). Use `vi.resetAllMocks()` in
  `beforeEach`, not `clearAllMocks`, so a `mockResolvedValueOnce` queue can't leak between tests.
- Every mutation gets three assertions: the result, the repository call
  (`toHaveBeenCalledExactlyOnceWith`), and the side effect (`broadcast` `toHaveBeenCalledTimes(1)` plus
  the exact envelope). `toHaveBeenCalledWith` alone does not prove "exactly once".
- Every rejection path asserts what did **not** happen: the repository writer and `broadcast` are
  both `not.toHaveBeenCalled()`. Also assert `statusCode` and `code` on the error, not just
  `instanceof`, since those are what `errorHandler` maps to the HTTP response.
- Cover "repository rejects -> no broadcast" for every mutation: a broadcast must never precede or
  survive a failed write.
- `amend`/`cancel` are write-first: the repository's guarded write returns `null` for a missing or
  already-cancelled trade, and only then does the service look the trade up to choose 404 vs 409.
  Test both `null` branches, and that the success path never calls `findById`.
- When a mutation also records an audit row, assert the audit attribution argument (`changedBy`) on
  the repository call. The audit row itself is written in the repository's transaction, so test its
  count and diff in `test/repositories/`, not here.
- Check-then-act races cannot be expressed against a mocked repository. Record them as `it.todo` with
  the fix location in a comment, rather than a test that passes for the wrong reason.
- Mutation-check before calling it done: remove each guard, each broadcast, swap event types, skip the
  lookup, drop an argument, then `git checkout -- <file>` after each. Every mutant must fail a test;
  log survivors in the retro.

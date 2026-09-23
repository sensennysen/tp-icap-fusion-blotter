# Day 0 Scaffold — Retro Notes

## Backlog

1. **Transitive vulnerabilities in Prisma's own dependency tree** (`pnpm audit`): `deepmerge-ts`
   (stack exhaustion, GHSA-ggr8-5vv4-36mx) via `@prisma/config`, and `mysql2` (auth downgrade +
   decompression-bomb DoS, GHSA-3f6p-5ww8-9rcr / GHSA-rgwj-5xj2-c3m3) bundled by `prisma`/
   `@prisma/client@7.10.0` even though this project only uses the Postgres driver. No fix
   available without an upstream Prisma release; low practical exploitability here since these
   are CLI-time/devDependency paths, not the request-handling runtime, and we never touch MySQL.
   Re-run `pnpm audit` after the next `prisma`/`@prisma/client` bump and drop this note once clear.

2. **No visual mobile-breakpoint verification.** `ARCH.md` §11 gives no breakpoint spec and calls
   this a desktop-oriented trading tool, so PLAN deliberately didn't design for 320/768px. The
   grid does have `overflow-x-auto` so narrow viewports scroll rather than break, but this was
   never checked in an actual browser at 320/768/1024/1440px. Do this before treating narrow-
   viewport support as validated, if it's ever needed.

3. **Backend integration tests hard-fail (not skip) when Postgres isn't reachable.** `backend/test/routes/trades.test.ts`
   throws a raw `PrismaClientKnownRequestError` with no guidance if `DATABASE_URL` isn't reachable
   (e.g. forgot `docker compose up -d postgres` first). Worth a nicer pre-flight check/error
   message if this trips people up.

## Non-obvious constraints hit during APPLY (also captured in AGENTS.md / coding-standards.md)

- `resolve_package_versions` (nexus MCP tool) silently returns `{}` for `package_manager: "pnpm"`
  with no error — works fine for `npm`. Resolved real pnpm versions manually via
  `pnpm add --save-exact` in a scratch dir instead.
- Prisma 7 dropped `datasource.url` from `schema.prisma` in favor of `prisma7.config.ts` (CLI) +
  a `@prisma/adapter-pg` driver adapter (runtime `PrismaClient`), and its `prisma-client`
  generator now emits the client as raw `.ts` source rather than a compiled package. This is why
  `backend/` ships and runs as TypeScript via `tsx` instead of a `tsc`-compiled `dist/`.
- `typescript-eslint@8.x`'s peer range currently excludes `typescript@7.x` entirely
  (`>=4.8.4 <6.1.0`) — that's why this project pins `typescript@6.0.3`, not `latest`.
- `@tanstack/react-table@9` replaced `useReactTable`/`getCoreRowModel()` with `useTable` +
  `tableFeatures(...)`. The package ships its own `skills/` docs under `node_modules` — read
  those before guessing from v8-era memory.

## Found by `/dev-tasks-planner` (2026-09-23)

4. **ADR-001 was never corrected after the pnpm decision above.** It still literally reads "npm
   workspaces only... no Nx/Turborepo" while the repo actually ships `pnpm-workspace.yaml`,
   `packageManager: pnpm@12.5.1`, and a CI pipeline using `pnpm/action-setup`. The reasoning for
   choosing pnpm is captured in this file's own notes (`resolve_package_versions` bug), but the
   ADR text itself was left stale. Any future `/dev-tasks-planner` or doc-consuming step should
   treat ADR-001's "npm workspaces" line as known-wrong, not as ground truth — the actual
   convention is pnpm. Worth a follow-up: correct ADR-001's Decision section to say "pnpm
   workspaces" so it matches reality.

## Found by `/evaluate` + `/validate` on TASK-002 (2026-09-23)

5. **Test counts were inflated by stale `dist/`.** `shared`'s build (`tsc --outDir dist`, `include: ["src"]`)
   also compiles `schemas.test.ts` into git-ignored `shared/dist/`, and vitest with no config ran both
   copies (8 real tests reported as 16). Fixed with `shared/vitest.config.ts` (`include: src/**/*.test.ts`).
   Follow-up (BACKLOG): exclude `*.test.ts` from the build tsconfig so tests aren't emitted at all;
   check `backend/` and `frontend/` for the same pattern before trusting their CSV test counts.
6. **`PATCH /trades/:id` accepts an empty `{}` body.** `amendTradeSchema = createTradeSchema.partial()`
   accepts `{}`, so an empty amend is a successful no-op that still broadcasts a real-time event.
   Pinned by an explicit test in `shared/src/schemas.test.ts`. Follow-up (BACKLOG): decide whether to
   reject it (e.g. `.refine` requiring at least one key) — touches `routes/trades.ts` tests and
   `AmendTradeModal`.
7. **TASK-002 ID collision across CSVs.** `core-tasks.csv` (shared schemas) and `bonus-tasks.csv`
   (mock auth) both use TASK-002, so `/evaluate TASK-002` is ambiguous without the epic. Follow-up
   (BACKLOG): renumber bonus tasks or prefix IDs by CSV.
8. **CSV files use CRLF line endings.** Scripted edits must read/write in binary or `newline=''`
   — Python text mode silently rewrites every line (a 1-row change showed as 22 rows in git).

## Found by `/evaluate` + `/plan` + `/apply` on TASK-003 (2026-09-23)

9. **The DB CHECK constraints had no automated coverage.** Every backend test mocks
   `tradeRepository`; CI ran `migrate deploy` before `pnpm test` but nothing exercised the DB.
   Added `backend/test/db/checkConstraints.test.ts` (real Postgres, Prisma client directly,
   asserts constraint names + the four indexes). Mutation-checked: with both constraints dropped,
   6 of 7 tests fail.
10. **`prisma7.config.ts` is auto-discovered** by the Prisma 7 CLI (`prisma debug` prints
    "Loaded Prisma config from prisma7.config.ts") — no `--config` flag needed.
11. **graphify has no edge from `schema.prisma` to `tradeRepository.ts`/`seed.ts`.** Graph
    blast-radius for schema changes must be traced by hand until the extractor links Prisma
    models to their consumers.
12. **`routes/trades.test.ts` wipes the whole `trades` table** (`deleteMany()` with no filter in
    `beforeEach`), so `pnpm test` empties whatever DB `DATABASE_URL` points at — including the
    seeded dev DB. README warns to use a disposable DB, but `.env` points at the compose DB.
    Fixed the parallel-race half (`fileParallelism: false` in `backend/vitest.config.ts`).
    Follow-up (BACKLOG): point tests at a separate `trades_test` database (e.g. a `DATABASE_URL`
    override in `test/setup.ts` or a `TEST_DATABASE_URL`) so tests never touch dev data.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-004 (2026-09-23)

13. **`TradeRepository` had no direct tests.** `tradeService.test.ts` mocks it and
    `routes/trades.test.ts` only covers filter-by-symbol, one cancel and 404s. Added
    `backend/test/repositories/tradeRepository.test.ts` (real Postgres, repository called directly):
    all 4 filters, all 5 sort fields x asc/desc, the `tradeTimestamp desc` default, row mapping
    (Decimal -> number, ISO strings), and create/update/cancel/findById/nextTradeId. It only creates
    and deletes `TEST-REPO-*` rows and narrows `list()` results to that prefix, so it is safe on the
    seeded dev DB. Mutation-checked: dropping the trader filter, flipping the default order,
    removing `Number(price)` and making `cancel` a no-op each fail tests. **Survived:** changing the
    `nextTradeId` base (`100001` -> `100002`) — tests assert "+1 after create", not the absolute
    value, because dev data makes the count unknowable.
14. **`nextTradeId()` is `count()`-based and not concurrency-safe.** Two concurrent creates can be
    issued the same `TRD-` code; the `tradeId` unique constraint then turns the loser into a 500.
    Deleting rows can also re-issue an existing code. Recorded as `it.todo`. Follow-up (BACKLOG):
    Postgres sequence (needs a migration) or retry on P2002.
15. **CSV wording drift.** TASK-004 says "sequential TRD-1000xx codes"; the code emits
    `TRD-100001` and up (six digits, rolling to `TRD-100100` etc.). Follow-up (BACKLOG): fix the CSV.
16. **`update`/`cancel` throw raw Prisma `P2025` on an unknown id.** The repository does no
    translation; the 404 depends entirely on `TradeService` calling `findById` first. Pinned in the
    new tests so a change is deliberate.
17. **`pnpm typecheck` does not cover `backend/test/`.** `backend/tsconfig.json` has
    `include: ["src"]`, so type errors in tests are only caught by vitest's transpile-only run and
    ESLint. Follow-up (BACKLOG): add a `tsconfig.test.json` or widen `include`.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-005 (2026-09-23)

18. **`WebSocketBroadcaster` had no direct tests.** `tradeService.test.ts` and
    `routes/trades.test.ts` both replace it with a stub, so no test ever opened a real socket. Added
    `backend/test/realtime/webSocketBroadcaster.test.ts` (real `ws` clients on an ephemeral port: fan-out,
    all three event types, no replay for late joiners, `readyState !== OPEN` skip, pruning on close and
    on abrupt terminate) and `backend/test/realtime/broadcastWiring.test.ts` (Express + broadcaster on one
    `http.Server`, repository mocked, so no DB: POST/PATCH/cancel each push the right envelope to every
    client, `/health` answers on the WS port, and 404/409/400 push nothing). "Nothing was sent" is proven
    by following a failed call with a successful one and asserting it is the first frame, not by sleeping.
    Mutation-checked: removing the OPEN guard, never pruning, sending to the first client only, sending
    `payload` instead of the envelope, dropping the `request` handler and removing the cancel broadcast
    each fail tests.
19. **One malformed client frame crashes the whole backend.** `WebSocketBroadcaster` registers no
    `'error'` listener on client sockets, so a protocol violation is an unhandled `'error'` event ->
    uncaught exception -> process exit (reproduced outside vitest against the real class: a masked frame
    with RSV1 set gives `RangeError: Invalid WebSocket frame: RSV1 must be clear`). Any client that can
    reach the port can take the server down. **Fixed in the same branch:** `WebSocketBroadcaster` now
    attaches `socket.on('error', ...)` that logs at `warn`; `ws` closes the socket itself, so the
    existing `close` handler still does the pruning. Covered by a real test (malformed frame -> client
    pruned, `warn` logged, remaining clients still receive broadcasts). Mutation-checked: removing the
    listener fails that test and vitest reports the uncaught `RangeError`. A real `server.ts` on a spare
    port answers `/health` 200 before and after the malformed frame.
20. **`broadcaster.close()` does not close clients.** It only calls `wss.close()`; verified that an
    open client stays OPEN and `http.Server.close()` then never completes. `server.ts` has no shutdown
    path today, so this only bites tests and any future graceful-shutdown work. The new tests terminate
    clients before closing. Follow-up (BACKLOG): have `close()` terminate `wss.clients`.
21. **`server.ts` cannot be imported by a test** (it calls `listen` on load), so the wiring test
    re-creates its five lines and would not notice if `server.ts` drifted. Follow-up (BACKLOG): extract a
    `createServerApp()` factory that `server.ts` and the tests both call.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-006 (2026-09-24)

22. **`TradeService` had 5 tests that left most of its acceptance criteria unproven.** The CSV is
    `Done` and the code was correct, so this was test hardening only (`tradeService.ts` untouched).
    Gaps in `backend/test/tradeService.test.ts`: `amend` had no happy path (no `TRADE_AMENDED`
    assertion at all), "broadcast exactly once" was only `toHaveBeenCalledWith`, the two conflict tests
    never checked that `update`/`cancel`/`broadcast` were not called, `list` was untested, and the
    409/404 status codes were never asserted (only `instanceof`). Now 15 tests + 1 `it.todo`: every
    method's happy path with `toHaveBeenCalledTimes(1)` and the exact envelope, 409 (`statusCode` and
    `code`) and 404 for both `amend` and `cancel` with "nothing else called", repository rejection ->
    no broadcast for create/amend/cancel, `create` passing `{ tradeId, ...input }`, `list` delegation,
    and a double-cancel sequence (one broadcast, one repository write). Mutation-checked, 13/13 killed:
    each `CANCELLED` guard removed, each of the three broadcasts removed, wrong event type on amend and
    cancel, create broadcasting twice, `getById` skipped in amend and in cancel, `tradeId` dropped, the
    `list` query ignored, the `amend` input ignored, and the amend broadcast carrying the pre-update
    trade.
23. **`amend`/`cancel` are check-then-act and not safe under concurrency.** `getById` then
    `update`/`cancel` with no transaction or conditional write, so two concurrent cancels can both
    pass the `CANCELLED` guard and both broadcast `TRADE_CANCELLED`; two concurrent amends can also
    both succeed after a cancel lands between the read and the write. A mocked repository cannot
    express this, so it is an `it.todo`. Follow-up (BACKLOG): conditional write in the repository
    (`updateMany` where `status = 'ACTIVE'`, treating count 0 as a conflict) or a transaction.
24. **Where the CSV's "live curl confirming 409" claim is actually covered.** Not in
    `tradeService.test.ts` (repository mocked, no HTTP). It is covered by `routes/trades.test.ts`
    (real Postgres, 409 through the error envelope) and `broadcastWiring.test.ts` (409 pushes nothing).
    The service tests now assert the `statusCode`/`code` the error handler maps from.
25. **`TradeService` is typed to the concrete `WebSocketBroadcaster` class**, so the tests build it
    with `{ broadcast } as never`. `Pick<WebSocketBroadcaster, 'broadcast'>` would remove the cast with
    no runtime change; left out of this pass to keep it test-only. Follow-up (BACKLOG).
26. **Retro #17 confirmed, and worked around.** The new test file typechecks clean under a temporary
    tsconfig that includes it (`backend/tsconfig.json` still has `include: ["src"]`), so the file is
    type-correct today, but `pnpm typecheck` would not have caught a regression.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-007 (2026-09-24)

27. **The error layer had no direct tests, and one real bug.** The CSV is `Done` and `errors.ts`
    plus `errorHandler.ts` were wired correctly, but only 3 DB-backed route tests touched them.
    Malformed JSON bodies (`express.json()` raises `entity.parse.failed`) fell through to the
    "unhandled" branch: a 500 `INTERNAL_ERROR` and an error-level log for what is a client mistake.
    Fixed with one branch in `errorHandler.ts` returning 400 `VALIDATION_ERROR` with a generic
    message that does not echo the body. No new error code, so ARCH §8 is unchanged.
    `backend/test/middleware/errorHandler.test.ts` is 21 tests + 1 `it.todo`, no DB.
28. **Oversized bodies (>100kb) still return 500.** body-parser raises `PayloadTooLargeError`
    (`status` 413), which also lands in the unhandled branch. Not fixed: ARCH §8 lists only
    400/404/409/500, so a 413 (`PAYLOAD_TOO_LARGE`) needs a spec decision. Follow-up (BACKLOG):
    decide, then map it and test it.
29. **Same-path Zod issues collapse to the last message.** `fields[path] = issue.message` overwrites,
    so a field failing `.min()` and `.regex()` reports only the second. Pinned as a characterization
    test, not endorsed. Follow-up (BACKLOG): keep the first message, or join them.
30. **`errorHandler` has no `res.headersSent` guard.** If a route errors after starting a response,
    the handler's `res.status().json()` throws `ERR_HTTP_HEADERS_SENT`. No current route streams, so
    it is latent. Recorded as an `it.todo`. Fix location: `if (res.headersSent) return next(err)` at
    the top of `errorHandler.ts`.
31. **`AppError.name` is never set**, so it logs and stringifies as plain `Error`. Cosmetic today
    (the handler dispatches on `instanceof`), but it makes pino output harder to scan. Follow-up
    (BACKLOG): set `this.name = new.target.name`.
32. **`throw null` cannot reach the handler.** Express treats a falsy `next(err)` as "no error", so it
    falls through to the default 404. Only truthy non-Error values (strings, objects) are testable and
    are covered. A lookalike `{statusCode: 404}` object is a 500, since dispatch is `instanceof`.
33. **The frontend depends on the envelope.** `frontend/src/lib/apiClient.ts:30` reads
    `body.error.code` unconditionally, so a non-envelope error body would break `ApiError`
    construction. The malformed-JSON fix closes the one route-reachable case found; the 413 case (#28)
    still returns a body the client can parse, because the handler's 500 is an envelope.
34. **Mutation-checked, 22 mutants, 21 killed.** Covered: each branch removed, each status, code and
    message changed, the `fields` spread dropped, `_` and `.` path keys, first-wins vs last-wins, the
    log call removed or its args dropped, and `err.message` leaked into the 500. The one survivor,
    `fields: err.fields` (always present), is equivalent: `JSON.stringify` drops `undefined`, so the
    wire output is identical and no HTTP-level test can distinguish it.
35. **Retro #17 confirmed again.** The new test typechecks clean under a temporary tsconfig
    (`include: ["src", "test/middleware"]`), but `pnpm typecheck` still skips `backend/test/`.
36. **Mutation harness note.** `git checkout -- <file>` between mutants would have discarded the
    uncommitted fix, so the run restored from a copy of the file instead. Worth remembering whenever
    the file under test has unstaged changes.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-008 (2026-09-24)

37. **`routes/trades.test.ts` wiped the whole `trades` table on every run.** Its `beforeEach` ran an
    unfiltered `prisma.trade.deleteMany()`, so `pnpm test` emptied the seeded dev DB (it was at 0 rows
    when this task started). `POST /trades` generates `tradeId` itself, so the `TEST-` prefix from
    `db-backed-tests.md` cannot be applied through the API. Fixed by tracking the `id` of every row the
    file creates and deleting only those in `afterEach`, using distinctive symbols (`ZZROUTE`,
    `ZZOTHER`) to narrow list/filter/sort assertions. The dev DB is not re-seeded by this task.
38. **The CSV's "8 route tests" was 7.** The file now has 14 real-Postgres tests, adding `GET /:id`
    success, `PATCH` success and validation, 404 on `PATCH`/cancel of a missing id, `sort`/`order`, and
    an invalid list query. The CSV row is left as written.
39. **App wiring had no direct tests.** New `backend/test/app.test.ts` (13 tests + 1 `it.todo`, stubbed
    service, no DB) covers CORS, helmet, the 100kb body limit, pino request logging, middleware order
    and per-route delegation. CORS is asserted against `env.CORS_ORIGIN`, not a hardcoded URL. Note
    `cors({ origin: <string> })` answers with the configured origin regardless of the caller's `Origin`;
    it does not reflect or block, so "restricted" means the browser refuses a mismatch, not the server.
40. **pino-http logs on a per-request child logger**, so `vi.spyOn(logger, 'info')` never sees
    "request completed". Spy on `logger.child` instead, replace the returned child's `info` with a
    recorder (`requestLogger` captures `logger` at import, but `child` is looked up per request). Do
    not pass through to the real `info`: pino then dumps the raw req/res objects into the test output.
    Also asserts `console.log` was not called.
41. **Oversized bodies still return 500** (retro #28). Now pinned by a characterization test in
    `app.test.ts`; flip it to 413 once a spec decision is made.
42. **Unknown `/api/*` paths return Express's default HTML 404**, not the JSON envelope. Recorded as an
    `it.todo`. Follow-up (BACKLOG): add a catch-all envelope 404, or decide it is out of scope.
43. **`nextTradeId()` is `count + 100001`**, so ids collide with the `@unique` `tradeId` if a row other
    than the newest is deleted, or under concurrent creates. Safe for this file (serial, only deletes its
    own newest rows), but a latent bug for real use. Follow-up (BACKLOG): a DB sequence, or retry on P2002.
44. **Mutation-checked, 16 mutants, 16 killed** (helmet, CORS origin, both limit directions, request
    logger, `errorHandler` removed and mounted first, 201 to 200, each `parse` dropped, wrong schema on
    PATCH, wrong id passed to each service call, error swallowed). The first pass leaked 8 rows: a mutant
    broke the 201 assertion in `createTrade()` before the id was tracked. Fixed by tracking the id before
    asserting.
45. **Retro #17 confirmed again.** Both files typecheck clean under a temporary tsconfig
    (`include: ["src", "test/app.test.ts", "test/routes"]`), but `pnpm typecheck` still skips
    `backend/test/`. The temp tsconfig must live in `backend/` (a scratchpad copy cannot resolve `types`).

## Found by `/evaluate` + `/plan` + `/apply` on TASK-009 (2026-09-24)

46. **The seed had no tests and ran at import time.** `seed.ts` called `seed()` on load and did not
    export it, so nothing could import it under test. Extracted `backend/src/seedTrades.ts`
    (`generateTrades`, `seedIfEmpty(client, count)`); `seed.ts` is now the thin entry point. Behaviour is
    unchanged: 500 trades, ~10% `CANCELLED`, skip if `count() > 0`, same `TRD-100001+` ids.
47. **The empty-table branch can't be tested against the dev DB** without emptying it (retro #12).
    `seedIfEmpty` takes a `SeedClient` slice of Prisma, so a stateful fake covers "empty -> seed,
    non-empty -> skip, twice -> once". The real client covers the skip branch (dev DB is non-empty) and
    a prefix-scoped insert of 50 generated rows (`TEST-SEED-`) proving they satisfy the DB constraints.
48. **New tests:** `test/seedTrades.test.ts` (16, generator + fake client + real Postgres) and
    `test/seedWiring.test.ts` (3, Dockerfile CMD order and `&&` chaining, `seed` script path). The
    automated Docker check is static; `/validate` also booted the real image twice by hand (below).
49. **Mutation-checked, 14 real mutants, 14 killed** (guard `> 1`, inverted, falls through; cancel
    rate; count 1500; quantity 0 and 5001; price 0 and 5 decimals; id off by one and duplicated;
    `createMany` count; CMD order; `;` for `&&`; future timestamp). The first pass let "quantity can be 0"
    survive: it happens about 1 in 5,000, so 1,000 random samples rarely hit it. Fixed by pinning
    `Math.random` to 0 and 0.999999. Two of my own mutations were no-ops (a comment, a `void 0`) and
    "survived" trivially; check that a survivor is a real change before trusting it.
50. **Retro #43 also applies to the seed.** Seeded ids are `TRD-100001..100500` and `nextTradeId()` is
    `count + 100001`, so a create after the seed gets `TRD-100501`. That holds only while no row has
    been deleted. Still open: a DB sequence, or retry on P2002.
51. **graphify has no node for `seed.ts`** (`graphify path` found no route to `tradeRepository.ts` or
    `Trade`). Blast radius was traced by hand: no file imports the seed, and the Dockerfile and
    `package.json` invoke it by path.
52. **Validated end to end against real empty databases** (throwaway DBs in the compose Postgres,
    dropped afterwards; the dev DB stayed at 500 rows). `pnpm seed` twice: 0 -> 500 rows (51
    cancelled) -> still 500, second run logs "already seeded, skipping". Built the backend image and
    booted it twice: boot 1 applied both migrations, seeded 500, then logged "Backend listening";
    boot 2 said "No pending migrations", skipped the seed (`existingCount: 500`) and still listened.
    So all three TASK-009 acceptance criteria hold in the real container, not just in tests.
53. **Env override for a scratch DB works** (`DATABASE_URL=... pnpm seed`): `loadEnv` does not
    override an already-set variable, so a throwaway database can be targeted without editing `.env`.
    Handy for any future "needs an empty table" check that must not touch dev data.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-010 (2026-09-24)

54. **`apiClient.ts` had no tests and several unhandled failure paths.** `res.json()` ran unguarded, so
    a 502 HTML page from a proxy threw a raw `SyntaxError`. A JSON error body without `error` threw a
    `TypeError` on `body.error.code`, and a rejected `fetch` surfaced as a bare `TypeError`. All three
    now become `ApiError` (`HTTP_ERROR` with the HTTP status, or `NETWORK_ERROR` with status 0 and
    `cause`). The server envelope still passes `code`, `message` and `fields` through unchanged.
55. **`ApiError` never set `name`**, so it logged as `Error`. It now sets `name = 'ApiError'`.
56. **Path ids were interpolated raw.** `getTrade`, `amendTrade` and `cancelTrade` now
    `encodeURIComponent` the id, so an id containing `/`, `?` or `#` cannot change the route.
57. **New tests:** `frontend/test/apiClient.test.ts` (30: request shape, query string, id encoding,
    envelope unwrapping, `ApiError` mapping, non-envelope failures, type-level checks). Pattern in
    `knowledge/patterns/api-client-tests.md`.
58. **graphify has no call edges from `useTrades.ts` to `apiClient`**, so blast radius was traced by
    grep: `useTrades.ts` is the only importer, and nothing else references `ApiError`.
59. **Still open, out of scope for TASK-010:**
    - `BASE_URL` is cast with `as string` and never validated; an unset variable gives `undefined/trades`.
    - `queryClient` sets `retry: 1`, so a 400 or 409 `ApiError` is retried once before it surfaces.
    - A 2xx with an unparseable body still throws a `TypeError` on `.data`; the backend never sends one.
    - No component reads `ApiError.code` or `fields` yet, and `getTrade` has no consumer.
60. **Mutation-checked, 32 real mutants, 32 killed.** Mutants covered method and path swaps, dropped
    `encodeURIComponent` (all three methods), dropped `fields`, swapped `code` and `message`, wrong
    status, each fallback field, the JSON guard, the `fetch` catch, `cause`, the `undefined` filter,
    the `?` handling, the `Content-Type` header, `data` unwrapping, the `!res.ok` branch and each clause
    of `isErrorEnvelope`. The first pass let "drop the `error !== null` check" survive: `{ "error": null }`
    was untested and would have thrown a `TypeError` on `.code`. Added that case and re-ran it (killed).
61. **graphify now has the `useTrades.ts -> apiClient` import edge** (retro #58 said it had none, which was
    before `apiClient.ts` was re-extracted after the edit). The graph labels `ApiError` and its
    constructor as community `TradeService`; that is a name collision, not a real dependency.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-011 (2026-09-24)

62. **`useTrades.ts` meets both acceptance criteria as written; no source change.** A filter change
    re-queries `listTrades` with the new params under `[...tradesQueryKey, filters]`. All three
    mutations invalidate the `['trades']` prefix on success, and because `onSuccess` returns the
    `invalidateQueries` promise, `mutateAsync` resolves only after the refetch finishes.
    `TradeBlotterPage`'s success toast therefore fires after the grid already shows the new data.
    That behaviour is now pinned by a test.
63. **The `useTrades` ↔ `useRealtimeTrades` coupling is only the key shape.** graphify has no edge
    between the two hooks (both import `tradesQueryKey` from `queryClient.ts`). A test now pins the
    exact key and proves a `setQueryData` write to it is read with no fetch.
64. **A cleared filter reuses the unfiltered cache entry.** TanStack's key hash drops `undefined`,
    so `{ symbol: undefined }` and `{}` are one query with one fetch. The `''` → `undefined` mapping
    lives in `TradeFilters`, so the hook depends on that mapping.
65. **Invalidation marks inactive filter variants stale too** (prefix match). Only the active query
    refetches; the others refetch when revisited. This is intended and tested.
66. **Test gotcha: `result.current` lags the cache by one notifyManager tick.** After
    `await act(...)` resolves a deferred refetch, `getQueryData` already has the new list, but
    `result.current.trades` does not until the batched `setTimeout(0)` notify runs. Use `waitFor` or
    `getQueryData`. Verified in isolation with a bare `QueryObserver` + `MutationObserver`:
    TanStack itself awaits the invalidation correctly.
67. **New tests:** `frontend/test/useTrades.test.tsx` (19: list query, key contract, `isError`,
    `refetch`, filter re-query / cache hit / cleared filter, per-mutation args + refetch + "resolves
    after refetch" + failure pass-through, invalidation scope, type-level checks). Pattern in
    `knowledge/patterns/use-trades-hook-tests.md`.
68. **Mutation-checked, 16 mutants, 16 killed:** key or `queryFn` without `filters`; each `onSuccess`
    dropped; wrong invalidation key; active-key-only invalidation; fire-and-forget invalidation;
    amend args swapped or dropped; wrong cancel id; create input dropped; `?? []` dropped;
    `isError` / `isLoading` hardcoded; `refetch` stubbed.
69. **Still open, out of scope for TASK-011:**
    - `TradeBlotterPage` ignores `isError`, so a failed list renders "No trades match the current
      filters", the same as a real empty result. ARCH §11 only requires mutation toasts, so this is
      a UX gap, not an AC failure.
    - `retry: 1` on the app `QueryClient` (retro #59) still delays list errors by one retry.
70. **`/validate` graph check: no unplanned boundary crossings.** The new nodes are the test file,
    its helpers and the pattern doc. graphify re-clustered `useTrades.ts`, `queryClient.ts` and
    `apiClient.ts` into a new `useTrades.test.tsx` community, and labels `useTrades()` as
    `TradeService`. It also resolves the test's `waitFor` to `backend/test/realtime/helpers.ts`,
    but the file imports it from `@testing-library/react`. Both are name or clustering artifacts
    like #61, not real dependencies. The live-API check for AC1 was skipped because the dev stack
    was not running. Backend filter params are covered by `backend/test/routes/trades.test.ts`,
    and hook → `apiClient` → query string by the frontend suites.

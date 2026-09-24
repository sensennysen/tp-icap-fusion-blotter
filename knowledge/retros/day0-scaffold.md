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

## Found by `/evaluate` + `/plan` + `/apply` on TASK-012 (2026-09-24)

71. **The 4 original tests covered only the reconcile half of the ACs.** Nothing tested backoff,
    the 30s cap, lost/restored toasts, the per-event toast, "no refetch", or unmount cleanup. The
    hook's backoff schedule (1s doubling, 30s cap, reset on open) was already correct; it is now
    pinned.
72. **"Connection lost" toasted on every failed retry, not once per outage.** Browsers fire `close`
    after each refused reconnect, so an outage produced a lost toast at 1s, 2s, 4s … 30s. The hook
    now tracks `isConnected`: "lost" fires only on a connected → closed transition, and "restored"
    only on an `open` after a loss. If the very first connect fails there is no toast, because
    nothing was lost.
73. **One malformed frame threw inside the `message` listener.** `JSON.parse` was unguarded, and an
    unknown `type` still toasted `"undefined: …"`. Frames are now parsed and checked by
    `isTradeEvent` (known type, object payload with string `id` and `tradeId`). Invalid frames
    are dropped with no cache write and no toast.
74. **Only the active filter key was reconciled.** Other cached `[...tradesQueryKey, filters]`
    variants stayed stale and, under `staleTime: 30_000`, were shown stale when revisited. Every
    cached variant is now reconciled against its own `queryKey[1]` filters. There is still no
    refetch, and the active key is one of the variants.
75. **An event could create a list that was never loaded.** `current ?? []` wrote `[payload]` into
    a key whose first fetch was still in flight; if that fetch failed, the grid showed a one-row
    list as real. Keys with no data are now skipped, so the fetch stays the source of truth.
76. **Deviation from the plan text:** the plan said `filtersRef` stays "for the toast only", but the
    toast never used filters. With per-variant reconcile the hook no longer needs `filters`, so
    the parameter is `_filters`, kept so `TradeBlotterPage` is unchanged. Dropping it is a
    follow-up that touches the page.
77. **Not a defect: `reconcile` ignores `sort`/`order`.** `TradeGrid` sorts on the client
    (`createSortedRowModel`, default `tradeTimestamp` desc), so row order in the cache is not
    what the user sees.
78. **New tests:** `frontend/test/useRealtimeTrades.test.tsx` went from 4 to 37. Covered:
    reconcile branches, cross-variant reconcile, unloaded key, no refetch, `VITE_WS_URL`, filter
    change keeps one socket, backoff and cap, reset, unmount, lost/restored/info toasts, and 11
    malformed frames. The CSV AC still says "4 tests"; the CSV was left as is. Pattern in
    `knowledge/patterns/use-realtime-trades-tests.md`.
79. **Mutation-checked: 35 mutants, 34 killed by vitest, 1 killed by `tsc`.** The first pass had
    3 survivors, because the `try` wrapped the guard as well as `JSON.parse`, so null checks were
    swallowed by the `catch`. Narrowing the `try` to `JSON.parse` fixed two of them. The
    remaining one, dropping `typeof data !== 'string'`, can't be observed at runtime
    (`JSON.parse` coerces a Blob/ArrayBuffer to `"[object …]"` and throws), but `tsc` rejects
    `JSON.parse(unknown)`.
80. **Still open, out of scope for TASK-012:**
    - `VITE_WS_URL` is an unvalidated `as string` cast (same as `BASE_URL`, #59).
    - A server that accepts and then drops at once resets backoff on each `open`, so it
      reconnects every 1s (with a lost/restored toast pair each time). Resetting only after a
      stable period would fix it.
    - graphify has no edge from `useRealtimeTrades.ts` to `ToastProvider.tsx`; the `useToast`
      import exists (found by grep).
81. **`/validate`: real frames pass the new guard.** The backend was started against a scratch
    database (`trades_validate_012`, the #53 override; dropped afterwards). A create → amend →
    cancel was captured from the real `WebSocketBroadcaster` and replayed through the hook in a
    throwaway test: the `{}` list went 10 → 20 → CANCELLED and the trade was removed from the
    `{ status: 'ACTIVE' }` variant. The dev database has 0 validation rows. Gotcha: `pkill -f "tsx
src/server.ts"` does not match the tsx process (its argv is `… loader.mjs src/server.ts`), so a
    second backend fails on a busy port. Kill by `lsof -t -iTCP:4000` instead.
82. **`/validate` graph check: no unplanned boundary crossings.** New nodes (`isTradeEvent`,
    `parseEvent`, `applyEvent`) are all in `useRealtimeTrades.ts`. graphify adds a phantom
    `../src/components/Toast/ToastProvider.js` node from the test's
    `importOriginal<typeof import(...)>` and re-clusters `useTrades.ts` / `TradeBlotterPage.tsx`
    into the `useRealtimeTrades.ts` community. Both are artifacts like #61/#70, not dependencies.
    `coding-standards.md` now describes the multi-variant reconcile.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-013 (2026-09-24)

83. **ToastProvider had no tests of its own.** It was only exercised through the spy wrapper in
    `useRealtimeTrades.test.tsx`. It now has `frontend/test/ToastProvider.test.tsx` (17 tests).
84. **Auto-dismiss timers leaked.** `setTimeout` was never cleared: not on dismiss, and not on
    provider unmount. Timers now live in a `useRef<Map>`. `dismissToast` clears the toast's
    timer, and an unmount effect clears all of them.
85. **The context value was a new object on every render.** Every `useToast()` consumer
    re-rendered whenever the provider rendered. The value is now `useMemo`'d.
    `showToast` / `dismissToast` were already stable.
86. **Toasts could not be dismissed by hand.** `dismissToast` was exposed but nothing called it.
    Each toast now has a lucide `X` button (`aria-label="Dismiss notification"`).
87. **Error toasts were announced politely.** Errors now use `role="alert"`; info, success and
    connection keep `role="status"`. The message is in its own `<span>`, so existing
    `getByText(message)` checks still match.
88. **The stack had no cap.** The connect-then-drop flap (#80) could pile up lost/restored pairs
    without limit. `MAX_TOASTS = 5` now evicts the oldest toast along with its timer. The `Map`'s
    insertion order matches the display order, so eviction happens outside the state updater
    and the updater stays pure.
89. **`crypto.randomUUID()` requires a secure context.** It is undefined when the app is opened
    over plain HTTP on a LAN IP, so the first toast would have thrown. Ids now come from a
    per-provider counter.
90. **Mutation-checked: 15 mutants, all killed.** The toast-specific test pattern is in
    `knowledge/patterns/toast-provider-tests.md`. `useRealtimeTrades.test.tsx` passes unchanged,
    so the public API (`toasts`, `showToast`, `dismissToast`) is intact.
91. **Still open, out of scope for TASK-013:**
    - `TradeBlotterPage`'s success/failure toasts have no test yet (they belong to TASK-018).
    - graphify still has no edge from `useRealtimeTrades.ts` / `TradeBlotterPage.tsx` to
      `ToastProvider.tsx` (#80), so `graphify path` reports no path. Use grep for blast radius.
    - Hovering a toast does not pause its auto-dismiss. Not required by ARCH §11.

## Found by `/validate` on TASK-013 (2026-09-24)

92. **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** The Chrome
    extension was not connected, so the check ran Chrome with `--headless=new
--remote-debugging-port` and drove it with a small Node CDP script. Stopping the backend
    showed "Connection lost, reconnecting…" (`role=status`, `bg-toast-connection`, bottom-right,
    with the X button). A create submitted while the backend was down showed "Failed to create
    trade" (`role=alert`, `bg-toast-error`). Clicking its X removed only that toast. Restarting
    the backend showed "Connection restored" about 10s later (backoff). Gotcha: a 5s toast
    expires between separate CDP round-trips, so trigger, wait and assert inside one in-page
    `Runtime.evaluate`.
93. **BACKLOG: a local `pnpm dev` has no API/WS URL.** `VITE_API_BASE_URL` / `VITE_WS_URL` live in
    the root `.env`, but Vite reads `.env` from `frontend/` (no `envDir` set). The page renders
    "No trades match the current filters", with no error and no WebSocket. Docker Compose sets
    both explicitly, so it hides the problem. Fix: `envDir: '..'` in `frontend/vite.config.ts`,
    or validate the vars at startup (see #59/#80).
94. **BACKLOG: a failed create/amend closes the modal and loses the user's input.**
    `TradeBlotterPage`'s `onSubmit` catches the error to show the toast, so `CreateTradeModal`
    always reaches `onClose()`. Rethrowing after the toast, or returning a success flag, would
    keep the form open. Belongs to TASK-015/016/018.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-014 (2026-09-24)

95. **The first click on the default-sorted Timestamp header cleared the sort.** In TanStack v9
    the first direction is chosen from the sampled value's type. ISO timestamps are strings, so
    it was ascending. The grid starts at desc, which is not the first direction, so with
    `enableSortingRemoval` (default `true`) the next click removed the sort. Rows fell back to
    API order, which is also timestamp desc, so the ▼ disappeared and nothing moved. Found with a
    throwaway RTL probe against the real component. The grid now sets
    `enableSortingRemoval: false`, and Timestamp has `sortDescFirst: true`, so coming back to it
    from another column also starts newest first.
96. **Every column cycled through three states, and shift-click stacked sorts.** Text columns
    went asc → desc → unsorted and number columns desc → asc → unsorted. Shift-click added a
    second sort key with no priority shown. The AC says headers toggle asc/desc, and the API's
    `TradeListQuery` has a single `sort`/`order`, so the grid now sets `enableMultiSort: false`.
    Sorting is one column with two states.
97. **Sort state was not exposed to assistive tech.** There was no `aria-sort`, the ▲/▼ glyph was
    part of the button's name ("Timestamp ▼"), and the Actions header was a disabled `<button>`.
    Now the sorted `<th>` gets `aria-sort` (only one header at a time, as ARIA asks, which the
    single-column sort makes possible), the glyph is `aria-hidden`, and headers that can't sort
    render as plain text.
98. **Prices were cut to 2dp.** The DB stores `Decimal(12,4)`, but the formatter used the USD
    default of 2 fraction digits, so an amend from 10.1234 to 10.1249 showed $10.12 both times and
    looked like a no-op. It now shows 2–4 digits: $189.50, $10.1234. This goes beyond the ACs; it
    was flagged as optional in the plan.
99. **New tests:** `frontend/test/TradeGrid.test.tsx` went from 4 to 35. Covered: states, the 10
    columns + Actions in order, every cell, price formatting, badge and dimming classes, action
    visibility and callbacks (including after a re-sort and with new callbacks), the default
    sort, the Timestamp toggle, all 9 other columns via `it.each`, returning to Timestamp,
    shift-click, the Actions header, the hidden arrow, and live data (prepended arrivals sorted,
    the user's sort kept, focus kept, a trade arriving cancelled). 20 of the 35 fail against the
    old component. Pattern in `knowledge/patterns/trade-grid-tests.md`.
100.  **Mutation-checked: 24 mutants, 23 killed.** `getRowId` first survived because the
      live-data tests appended. TanStack's default row id is the input index, so appending
      changes no ids. `reconcile` prepends, which shifts every index, so the tests now prepend,
      and a focus test kills it. The survivor, `sortFn: 'datetime'`, is equivalent: the auto
      `alphanumeric` sort orders `toISOString` strings the same way.
101.  **Still open, out of scope for TASK-014:**
      - Quantity has no thousands separator (1000, not 1,000).
      - ARCH §11 says "grid rows color-coded by side". The CSV and the grid use a side badge
        instead, and design-system.md documents the badge. Accepted as is.
      - graphify has no `TradeBlotterPage.tsx` → `TradeGrid.tsx` import edge. `graphify path`
        only connects them through `react` (the same gap as #80). Use grep for blast radius.
      - Bonus TASK-003 (virtualization) names this suite as its regression check. The queries
        are role-based and row-order based, but how a virtualizer renders under jsdom (no
        layout) was not checked.

## Found by `/validate` on TASK-014 (2026-09-24)

102.  **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** Same
      setup as #92: a local backend, plus Vite started with `VITE_API_BASE_URL` / `VITE_WS_URL`
      set on the command line (#93 is still open), against the 500-row dev database. Results:
      - All 10 columns plus Actions render in order.
      - Every column, clicked 3 times, stays sorted over all 500 rows (checked against the API
        data) and never becomes unsorted. Returning to Timestamp starts newest first.
      - Shift-click leaves only the new column sorted, and Actions has no button.
      - The 46 cancelled rows compute `opacity: 0.5` with no buttons. The 454 active rows compute
        `1` with both buttons.
      - The BUY and SELL badges compute different colours.
      - All 500 price cells match the 2–4dp format.
      - Chrome's accessibility tree names the header buttons "Timestamp" / "Symbol", without the
        arrow.

      Gotchas:
      - `Accessibility.getFullAXTree` on this page never resolved. Use
        `Accessibility.getPartialAXTree` for each `thead th` node instead.
      - The partial tree reported no sort property for the sorted header, so `aria-sort` was
        checked on the DOM.
      - The only console messages were pre-existing: a `favicon.ico` 404, and a WebSocket
        "closed before the connection is established" warning from the StrictMode double mount
        in dev.

103.  **`/validate` graph check: no unplanned boundary crossings.** `TradeGrid.tsx` still imports
      only `react`, `@tanstack/react-table` and the shared `Trade`. The test's new helpers
      (`expectSortedBy`, `columnValues`, …) form their own `TradeGrid.test.tsx` community. The
      test's import resolves to a phantom `ref_src_components_tradegrid_js` node, and graphify
      re-clusters `TradeGrid()` into `useRealtimeTrades`. Both are artifacts like #82.
104.  **BACKLOG: the 2–4dp price format leaves the Price column with mixed decimal places.**
      `Intl` drops trailing zeros, so the seeded prices show as 444 × 4dp, 52 × 3dp
      (`$114.236`) and 4 × 2dp. The plan chose 2–4dp (`$189.50`) and was approved that way.
      Before this task every price had 2dp. `minimumFractionDigits: 4` would give one precision
      for every row (`$189.5000`). That changes an approved decision, so it is left for the owner.
105.  **BACKLOG: grid cells wrap mid-token at 1440px.** Trade ID (`TRD-` / `100450`), Book and
      Timestamp wrap on every row. The wrapping is pre-existing: it measured the same with the
      old 2dp price text swapped into the same page. `whitespace-nowrap` on the cells would fix
      it; the container already has `overflow-x-auto`. This hurts the user story's "scan the
      grid quickly", but no AC covers it.
106.  **BACKLOG: the seed gives only 30 distinct timestamps for 500 trades** (one per day). The
      default sort therefore has runs of about 17 tied rows, which keep the API's order within
      a day (Postgres picks it). The fix belongs to the seed (TASK-009), not the grid.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-015 (2026-09-24)

107.  **A whitespace-only filter broke the grid.** `toUndefined` only mapped `''` to
      `undefined`, so a stray space in Symbol or Trader was sent as `symbol=%20`.
      `tradeListQuerySchema` trims it to `''`, fails `min(1)`, and the list request returned 400. `useTrades` now runs every filter set through `normalizeTradeListQuery`
      (`frontend/src/lib/tradeListQuery.ts`) before it builds the key or the request. That
      function trims symbol and trader, and drops blank and undefined fields.
108.  **Leading and trailing spaces split the client from the server.** The server trimmed
      `"AAPL "` and returned AAPL trades, but the cache key and `useRealtimeTrades`'
      `matchesFilter` kept `"AAPL "`. So every live AAPL event failed `===` and was dropped
      from that list. The key now holds the normalised filters, and `useRealtimeTrades` reads
      filters from `key[1]`, so it gets the fix without a change. Typing a surrounding space
      also no longer adds a key or a request.
109.  **The trim happens at the query boundary, not in the input.** The inputs are
      controlled, and trimming their value would delete the space as you type it
      (`"j doe"` could not be typed). They keep the raw text, and only what becomes a key or a
      request is normalised.
110.  **The side and status handlers are typed.** A shared `keyof TradeListQuery` handler
      wrote any string into `side` and `status`. They now go through
      `sideSchema.safeParse(value).data` / `tradeStatusSchema.safeParse(value).data`, so
      "All" (`''`) becomes `undefined` and nothing outside the enum can get in.
111.  **New tests:** `TradeFilters.test.tsx` has 24 tests: the controls with a mocked
      `onChange`, plus a `TradeFilters` + `useTrades` harness with a stubbed `fetch`.
      `tradeListQuery.test.ts` has 8, and `useTrades.test.tsx` has 1 new one. 3 fail against
      the old code, and they are exactly #107/#108. Both ACs already held for ordinary input.
      Pattern in `knowledge/patterns/trade-filters-tests.md`.
112.  **Mutation-checked: 17 mutants, 17 killed.** Covered: each trim, each blank-drop, each
      pass-through field, key vs request normalisation in `useTrades`, `toUndefined`, the
      `...filters` spread, both schema parses, a crossed handler, and controlled `value`s.
113.  **Still open, out of scope for TASK-015:**
      - No debounce. Typing "AAPL" fetches A, AA, AAP and AAPL, and the in-between keys return
        empty lists under exact matching. The CSV says each onChange "immediately updates
        real query params", so a debounce needs an AC change.
      - Matching is exact and case-sensitive (`aapl` finds nothing). This is the backend and
        `matchesFilter` contract, and they have to change together.
      - There is no "Clear filters" control.

## Found by `/validate` on TASK-015 (2026-09-24)

114.  **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** Same
      setup as #102. The backend ran with `node --env-file=../.env --import tsx src/server.ts`,
      so `.env` is never printed. Vite ran with the URLs on the command line (#93 is still
      open). Tested against the 500-row dev database, recording each `GET /api/trades`.
      Results:
      - Typing `" AAPL "` key by key sent exactly `symbol=A`, `AA`, `AAP`, `AAPL`, with no
        request for either space. The grid showed the 55 AAPL rows and the input kept
        `" AAPL "`.
      - Side=SELL sent `symbol=AAPL&side=SELL`, and every row was AAPL SELL.
      - Clearing Symbol sent `side=SELL` with no `symbol`.
      - Status=CANCELLED added `status=CANCELLED`. Status=All then sent
        `trader=asmith&side=SELL` with no `status`, and the rows had both statuses.
      - A whitespace-only Trader sent no request and no `trader` param.
      - No API errors and no console errors.
      - The old bug still reproduces at the API: `?symbol=%20` returns `VALIDATION_ERROR`,
        which the client no longer sends.
      - Not checked live: #108's WebSocket path, which needs a DB write. It is covered by
        `useTrades` / `useRealtimeTrades` tests on the normalised key.

      Gotchas:
      - Count only `GET`s. Every request has a CORS preflight, so an unfiltered log shows each
        request twice (see #115).
      - Params follow the object's insertion order (`trader=…&side=…`), so compare them as a
        set, not as a string.

115.  **BACKLOG: every list request pays a CORS preflight.** `apiClient.request` sets
      `Content-Type: application/json` on every call, including bodyless GETs, which makes the
      request non-simple. The backend's `cors()` has no `maxAge`. Filtering therefore costs 2
      round trips per keystroke (15 `OPTIONS` for 15 `GET`s in #114). Fix: send the header only
      when there is a body, or set `maxAge` on `cors()`. This is the `apiClient` / backend
      boundary (TASK-010/005), not the filters.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-016 (2026-09-24)

116.  **A failed create/amend closed the modal and lost the input (closes #94).**
      `TradeBlotterPage` swallowed the mutation error after the toast, so the modal always
      reached `onClose()`. The page now rethrows after the error toast. Each modal catches the
      rejection, stays open with the input intact, and calls `onClose()` only after `onSubmit`
      resolves. Catching inside the modal also stops `handleSubmit` leaking an unhandled
      rejection.
117.  **The shared schema allowed values the database can't store.** `quantity` is a 32-bit
      `INTEGER` and `price` is `DECIMAL(12,4)`, but the schema only checked "positive". A
      quantity above 2^31−1 got a 500, and a 5dp price was silently rounded by Postgres. The
      schema now has `MAX_QUANTITY`, `MAX_PRICE` and a ≤4dp refine
      (`Number(v.toFixed(4)) === v`, which is exact, with no float tolerance). The form and the
      API both enforce these through `shared/`. 200k seed-style prices all pass.
118.  **Empty number inputs showed Zod's raw type error.** `valueAsNumber` turns an empty input
      into `NaN`. `numberError(field)` now reports missing/`null`/`NaN` as "… is required" and
      other non-numbers as "… must be a number". `.int()` has its own message, because a
      schema-level `error` otherwise overrides the check's default ("required" for 1.5).
119.  **Native validation hid the shared messages.** `step="0.0001"` let the browser block a
      5dp price with its own tooltip before Zod ran. Both forms are now `noValidate`, so every
      message comes from `shared/`. jsdom can't show this. It was a deviation from the plan,
      for the "same rules" AC.
120.  **Server field errors are shown next to their inputs.** `setServerFieldErrors` maps an
      `ApiError`'s `fields` onto known form fields with `setError`, and ignores other keys
      such as `_`. The toast still reports the failure as a whole.
121.  **`Modal` fixes:** `useId()` replaces the hardcoded `id="modal-title"`, which was
      duplicated if two dialogs were open. Escape closes the dialog, and its listener is
      removed on unmount. The dialog takes focus when it mounts.
122.  **New tests:** 48 in `schemas.test.ts` (up from 31). `CreateTradeModal.test.tsx` has 24
      (up from 3), `AmendTradeModal.test.tsx` 14 (new), and `TradeBlotterPage.test.tsx` 4
      (new). Helpers are in `frontend/test/tradeForm.ts`. 18 of the 42 fail against the old
      code, and so do the new shared limit tests. Mutation-checked: 24 mutants, 23 killed, and
      the 1 survivor (`defaultValues: { side: 'BUY' }`) is equivalent. Pattern in
      `knowledge/patterns/trade-form-modal-tests.md`.
123.  **Still open, out of scope for TASK-016:**
      - #6: `amendTradeSchema` still accepts `{}`. The amend form always sends all 7 fields,
        not just the changed ones, so an unchanged "Save" is a real PATCH and broadcast.
      - No focus trap and no return of focus to the opener on close. Tab can leave the dialog.
      - No backdrop-click close. Left out on purpose, so a stray click can't discard a form.

## Found by `/validate` on TASK-016 (2026-09-24)

124.  **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** The
      local backend was already running and had been started after the schema change. Vite
      was started with the URLs on the command line (#93 is still open). Every POST and PATCH
      was answered by the script using CDP `Fetch.fulfillRequest` and never reached the
      backend. Afterwards the DB still had 500 rows, the amended trade was unchanged, and no
      trades had been created. Results:
      - The create dialog takes focus on open, and its accessible name is "New Trade". Side
        defaults to BUY.
      - An empty submit shows all 6 shared "… is required" messages and sends no request.
      - A 5dp price, a quantity of 1.5 or 2^31, a price of 1e8, and a whitespace-only Symbol
        each show the exact shared message and send no request. Chrome's own `validity` reports
        `stepMismatch` for the 5dp price and for 1.5.
      - With `noValidate` removed in the page, the same 5dp submit is blocked by the browser
        and no Zod message appears (`checkValidity() === false`). This is the #119 bug, and it
        shows `noValidate` is required.
      - A valid create answered with 500 shows the "Failed to create trade" toast. The dialog
        stays open with `" AAPL "`, SELL and 10.1249 intact. The request body was trimmed and
        numeric: `{symbol:"AAPL", side:"SELL", quantity:100, price:10.1249, …}`.
      - A simulated 400 envelope with `fields.symbol` shows the message under Symbol, and the
        `_` key is not rendered.
      - Escape, × and Cancel each close the dialog.
      - Amend on a real trade (TRD-100450, SELL, 387.0572) pre-fills all 7 fields exactly, and
        the dialog is titled "Amend TRD-100450". A 10.12491 price is rejected client-side. A
        valid edit answered with 409 shows the "Failed to amend trade" toast and keeps 411.25.
        The PATCH went to `/trades/:id` with all 7 fields.
      - No console errors and no uncaught exceptions or unhandled rejections.
      - The live API returns 400 with the same field messages for a 5dp price, a quantity of
        2^31, a price of 1e8 and a null quantity, on both POST and PATCH. Before this task,
        the oversized quantity was a 500 and the 5dp price was silently rounded.
      - Not checked live: a successful create or amend, because that needs a DB write. It is
        covered by the wired tests (#122).

      Gotchas:
      - A fulfilled cross-origin response needs `Access-Control-Allow-Origin` in its headers,
        or the page sees a network error instead of the status you chose.
      - Let `GET` and `OPTIONS` through with `Fetch.continueRequest`, and answer everything
        else.
      - Set React-controlled inputs with the native `value` setter plus an `input` (or, for
        a select, `change`) event. Assigning `.value` directly leaves RHF's state stale.

125.  **BACKLOG: Escape or Cancel while a submit is pending closes the modal anyway.** If that
      request then fails, the toast appears but the typed input is gone. Fix: ignore dismissal
      while `isSubmitting`, or disable Cancel and × and skip Escape while it is set. Low
      impact, because the user chose to close.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-017 (2026-09-24)

126.  **`CancelTradeConfirm` copied `Modal`'s markup but none of its #121 fixes.** The title
      id was hardcoded (`cancel-confirm-title`), Escape did nothing, and focus stayed on the
      row's Cancel button behind the overlay. It now uses `useId()` for both the title and a
      new `aria-describedby` description, closes on Escape (the listener is removed on
      unmount), and focuses **Keep Trade** when it opens. WAI-ARIA says a destructive
      alertdialog should focus its least destructive action, so a stray Enter keeps the trade.
      `Modal.tsx` is unchanged. It is `role="dialog"` and has a × button, so reusing it would
      have changed both trade forms.
127.  **Dismissing while the cancel was pending closed the dialog early.** The toast then
      appeared with no dialog on screen, which is #125 for this component. While the request
      is pending, Keep Trade is disabled, Escape is ignored, and the confirm button reads
      "Cancelling…". A ref mirrors `isSubmitting` so the one-time keydown listener sees the
      current value.
128.  **A rejected `onConfirm` leaked an unhandled rejection** from the click handler, because
      the handler used `try/finally` with no `catch`. The page's handler never rejects today,
      so this was latent. The component now catches and unlocks, and reporting stays with
      the caller (the page toasts). This change went beyond the plan: the rejection test
      found it.
129.  **The page wiring was already correct and is now tested.** `TradeBlotterPage.test.tsx`
      checks four things. A confirm sends exactly one `POST /trades/trade-1/cancel`, toasts
      "Trade cancelled" and closes. A 500 or a 409 already-cancelled response toasts
      "Failed to cancel trade" and **still closes** (TASK-017 AC, `finally`). Keep Trade
      closes the dialog and sends no request.
130.  **New tests:** 9 in `CancelTradeConfirm.test.tsx` (new) and 4 more in
      `TradeBlotterPage.test.tsx` (now 8). 6 of the 9 component tests fail against the old
      component. Mutation-checked with 14 mutants, all killed: 9 in the component (Escape
      guard, ref set/reset, listener cleanup, initial focus, Keep disabled, catch,
      describedby, pending label) and 5 on the page (drop the `finally` close, close only on
      failure, wrong id, and each toast). Pattern in `knowledge/patterns/cancel-confirm-tests.md`.
131.  **Still open, out of scope for TASK-017:**
      - The dialog shows a snapshot of `trade`. If another client cancels the trade while the
        dialog is open, the WebSocket update refreshes the grid but not the dialog, so
        confirming gets a 409 and an error toast. The AC accepts this. A possible fix: the page
        closes the dialog (with an info toast) when the cached row for `cancelTarget.id`
        becomes `CANCELLED`.
      - As with `Modal` (#123), there is no focus trap and focus isn't returned to the row's
        Cancel button when the dialog closes.

## Found by `/validate` on TASK-017 (2026-09-24)

132.  **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** Same
      setup as #124. The script answered every POST with `Fetch.fulfillRequest`, so none reached
      the backend. Afterwards the DB still had 500 rows and 46 cancelled, and the target
      TRD-100450 was still `ACTIVE` with its seed `updatedAt`. Results:
      - The row's Cancel opens an `alertdialog` with `aria-modal="true"`. Its accessible name
        is "Cancel TRD-100450?" and its `aria-describedby` points at the warning text. Focus
        starts on **Keep Trade**.
      - Escape, a click on Keep Trade, and Enter on the focused button each close the dialog
        and send no request.
      - A confirm answered with 500 or 409 sends one `POST /api/trades/:id/cancel` (the DB id,
        not the `TRD-` id). It toasts "Failed to cancel trade", the dialog closes, and the row
        stays `ACTIVE` with its actions.
      - A confirm whose 200 response was held for 1.5s shows "Cancelling…" with both buttons
        disabled. Escape and a Keep click during that time leave the dialog open. When the
        response arrives it toasts "Trade cancelled" and closes.
      - No console errors and no uncaught exceptions or unhandled rejections.

      Gotcha: headless Chrome reports `document.activeElement` reliably only after
      `Emulation.setFocusEmulationEnabled({ enabled: true })`.

133.  **BACKLOG: focus drops to `<body>` while the cancel is pending.** Disabling the focused
      confirm button blurs it, so screen reader and keyboard users lose their place until the
      dialog closes. Fix: use `aria-disabled` plus an early return instead of `disabled`, or
      move focus to the dialog container (`tabIndex={-1}`) when submitting starts. The same
      applies to the Create/Amend submit buttons. Low impact: the pending window is short and
      the dialog closes right after.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-018 (2026-09-24)

134.  **A failed Refresh did nothing.** The button called `refetch()`, which resolves with
      `isError` instead of throwing, so the grid kept its rows and nobody was told. The page
      now awaits the result and toasts "Failed to refresh trades" when it failed.
135.  **A failed load looked like an empty result (closes #69).** The page ignored `isError`,
      so a failed first load showed "No trades match the current filters." When `isError` is
      true and there are no rows, the page now shows a `role="alert"` message ("Couldn't load
      trades. Use Refresh to retry.", `text-sell` token) in place of the grid. If rows are
      already cached (a failed refetch), the grid stays. `TradeGrid` is unchanged.
136.  **The rest of the page wiring was already correct and is now tested.** New checks:
      - The filters, Refresh and New Trade render before the grid, in the ARCH §11 order.
      - Refresh refetches even inside `staleTime` and shows the new rows.
      - A failed Refresh toasts and keeps the rows. A failed load shows the alert, and
        Refresh then recovers.
      - Choosing a Side filter sends `side=SELL`, and the grid shows only what came back.
      - WebSocket TRADE_CREATED, TRADE_AMENDED and TRADE_CANCELLED events reach the grid
        with their info toast and **no extra GET**. A cancelled row is dimmed and loses its
        actions.
137.  **New tests:** 8 more in `TradeBlotterPage.test.tsx` (now 16). The `MockWebSocket` stub
      can now emit; the 8 earlier tests pass unchanged. Frontend total: 234.
      Mutation-checked with 8 mutants, all killed: Refresh not refetching, no Refresh toast,
      no error branch, error branch hiding cached rows, `filters` not passed to `useTrades`,
      `useRealtimeTrades` removed, toolbar moved below the grid, and filters removed. Pattern
      in `knowledge/patterns/blotter-page-tests.md`.
138.  **Still open, out of scope for TASK-018:** #125 (a pending save can still be dismissed),
      #131 (the cancel dialog can show a trade that is already cancelled), #133 (focus drops
      while pending) and #93 (local `pnpm dev` has no API or WebSocket URL). The graph still
      has no import edge from the page to `TradeGrid`, `TradeFilters` or `ToastProvider`
      (#80). Use grep for blast radius.

## Found by `/validate` on TASK-018 (2026-09-24)

139.  **`/validate`: checked in the real app with headless Chrome (CDP), no DB writes.** The
      local backend was already running. Vite was started with `VITE_API_BASE_URL` pointing at
      it and `VITE_WS_URL=ws://localhost:4100`, a throwaway `ws` server that broadcasts
      whatever is POSTed to it. That makes this the first live check of the WebSocket path
      (#108, #120 and #124 each skipped it because it needed a DB write). CDP `Fetch` was used
      to fail GETs on demand. Non-GETs would have been failed too, but none were sent.
      Afterwards the DB still had 500 rows and 46 cancelled, and TRD-100323 was still BAC /
      `ACTIVE` with its seed `updatedAt`. Results:
      - All 500 rows load. The `Filter trades` fieldset (Symbol, Trader, Side, Status),
        Refresh and New Trade all come before the `Trade blotter` table.
      - Side = SELL sends one `?side=SELL` and shows 247 rows, all SELL, the same as the API.
      - Refresh inside `staleTime` sends one GET and shows no toast.
      - A failed Refresh shows "Failed to refresh trades" after 2 GETs (`retry: 1`). The 500
        rows stay, and there is no load-error message.
      - A failed first load shows the `role="alert"` message, not "No trades match", and
        renders no table. Refresh then brings back all 500 rows and clears the message.
      - Pushed TRADE_CREATED (TRD-999999), TRADE_AMENDED (symbol → AMND) and TRADE_CANCELLED
        for TRD-100323: 501 rows, the amended symbol shown, the row at `opacity: 0.5` with no
        buttons, toasts "created: TRD-999999", "amended: TRD-100323" and "cancelled:
        TRD-100323", and **0 GETs** during the events.
      - No console errors and no uncaught exceptions.
140.  **`/validate` graph check: no unplanned boundary crossings.** The change is limited to the
      page's own JSX and click handler. The graph query matched backend `errorHandler` nodes
      only on the words "error"/"toast". Those are not edges from this change.
141.  **BACKLOG: Refresh gives no feedback while it runs.** The button is never disabled and
      shows no spinner, and a failure only shows its toast after the retry, about 1s later
      (#59). A click on a slow network looks like nothing happened. Fix: expose `isFetching`
      from `useTrades`, then disable the button and spin the icon while it is true.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-019 (2026-09-24)

142.  **There was no `.dockerignore`.** Both images build from the repo root, and
      `COPY backend backend` / `COPY frontend frontend` copied the host's `node_modules` (pnpm
      symlinks, or junctions on Windows), `backend/generated` and `frontend/dist` over what the
      container had just installed and built. The build also sent the root `.env` to the daemon.
      A root `.dockerignore` now excludes `**/node_modules`, `**/dist`, `**/generated`,
      `graphify-out`, `.env*` (except `.env.example`), `.git`, `docs` and `knowledge`.
      `shared/` resolves to `src/` (`main: ./src/index.ts`), so excluding `shared/dist` is safe.
143.  **The healthcheck accepted any 2xx.** `r.ok` is true for 200-299, but the AC says "only once
      /health returns 200". It now checks `r.status===200`.
144.  **Added `start_period: 30s` to the backend healthcheck.** CMD runs `migrate deploy` and the
      seed before the server listens. Without a start period, a slow first boot (Docker Desktop on
      Windows or Mac) could use up 10 × 5s of retries, get marked unhealthy, and the frontend
      would then never start.
145.  **Non-issue: nginx IPv6.** `nginx:1.27-alpine`'s `default.conf` has only `listen 80;`, with no
      `[::]:80` line, so the Dockerfile's `sed` to 5173 covers every listen directive.
146.  **New test: `backend/test/composeWiring.test.ts`** (10, static, parses the compose file with
      `yaml` 2.9.1, a new exact-pinned backend devDependency). It covers the `depends_on`
      conditions, the healthcheck URL/status/start period, the build contexts, CORS_ORIGIN and the
      VITE_* ports against the published ports, and the `.dockerignore` coverage. **Mutation-checked,
      10 mutants, 10 killed.** The first pass let `/health` → `/healthz` survive because
      `toContain` matched a prefix. It is fixed by asserting the quoted `fetch('…/health')`.
147.  **graphify has no nodes for `Dockerfile`, `docker-compose.yml` or `.dockerignore`**
      (`graphify path backend/Dockerfile health.ts` found no path). The blast radius was traced by
      hand, the same as the seed in #51.

## Found by `/validate` on TASK-019 (2026-09-24)

148.  **`/validate`: booted the real stack from a clean checkout.** I `git clone`d the repo into the
      scratchpad (no `node_modules`, no `.env`), applied the uncommitted diff, and ran
      `docker compose -p task019`. Host ports were remapped to 55432/14000/15173 because the dev
      Postgres (5432) and a local backend (4000) were running; the dev stack was not touched.
      Sampling `docker compose ps` every second:
      postgres `starting` → `healthy` at 6s, then the backend started (`starting`); the backend
      was `healthy` at 16s, and only then did the frontend leave `Created`. Boot 1 applied
      both migrations, seeded 500 trades, then logged "Backend listening". `/health` gave 200,
      `/api/trades` returned data, nginx served `index.html` on 5173, the bundle had the
      build-arg URLs baked in, and CORS echoed the frontend origin. A backend restart logged "No
      pending migrations", skipped the seed (`existingCount: 500`) and was healthy again.
      Afterwards: `down -v --rmi local` on `task019` only, and the scratch clone was deleted.
149.  **Negative healthcheck probes:** the exact healthcheck command exits 1 for a 404 path and
      for a port with nothing listening, so a not-yet-listening backend (during migrate/seed)
      never reports healthy.
150.  **The `.dockerignore` holds on a dirty tree.** `docker build -f backend/Dockerfile .` from the
      real working tree (host `node_modules`, `generated`, `frontend/dist`, `.env` all present)
      produced an image whose `backend/node_modules` was created by the container install (root,
      at build time), with no `darwin` packages and no `.env`.
151.  **BACKLOG: Windows is unverified.** Only macOS (arm64 Docker Desktop) was booted. The known
      Windows failure (host junctions copied into the image) is now excluded by `.dockerignore`, and
      the repo has no shell scripts that CRLF checkouts could break. A real Windows run is still
      owed for the "any OS" AC.
152.  **BACKLOG: default host ports clash with a running local stack.** 5432/4000/5173 are
      hardcoded in `docker-compose.yml`, so `docker compose up` fails if the dev Postgres or
      `pnpm dev` is up. Fix: `${POSTGRES_PORT:-5432}`-style variables, plus deriving CORS_ORIGIN and
      the VITE_* args from them. `composeWiring.test.ts` already asserts the ports agree, so it would
      catch a partial change.

## Found by `/evaluate` + `/plan` + `/apply` on TASK-020 (2026-09-24)

153.  **CI never generated the Prisma client.** `backend/generated/` is gitignored, there is no
      `postinstall` hook, and `ci.yml` went straight from `pnpm install` to lint. The backend
      Dockerfile has always run `prisma generate` (line 17), but CI never did. On a clean runner
      the backend typecheck, tests and build would fail on the missing import. Fixed with a
      "Generate Prisma client" step right after install.
154.  **The repo has no git remote, so the workflow has never run on GitHub.** The TASK-020 CSV
      row said "already running on every push". That was unverified, and the row is now
      corrected. **BACKLOG:** the first real GitHub Actions run is still owed once a remote exists.
155.  **Retro #17 closed.** `backend/tsconfig.json` now includes `test` and `vitest.config.ts`,
      so `pnpm typecheck` (and `build`, which uses the same tsconfig) covers the backend tests.
      Widening it surfaced 2 hidden errors in `tradeRepository.test.ts`: `SeedOverrides` took
      `side` from `baseRecord`, whose literal `'BUY'` rejected `'SELL'`. Fixed at the type level
      only. The Docker build is unaffected (`.dockerignore` keeps `test/`, and devDependencies
      are installed).
156.  **Retro #4 closed.** ADR-001 now says pnpm workspaces and has a dated Amendment. The same
      stale line was also fixed in `ARCH.md` (the stack table, plus `npm install && npm run dev`
      → `pnpm install && pnpm dev`) and in `knowledge/rules/arch-summary.md`.
157.  **New test: `backend/test/ciWiring.test.ts`** (7 tests, static, parses `ci.yml` with
      `yaml`). It covers the triggers, `HUSKY=0`, the step order (install → generate → lint →
      typecheck → migrate → test → build), pnpm version = `packageManager`, Node ≥
      `engines.node`, the service image = the compose postgres image, the `pg_isready` gate, and
      `DATABASE_URL` user/password/database/port against the service's own env and port.
      **Mutation-checked, 12 mutants, 12 killed.**
158.  **BACKLOG: ADR-001's Consequences are also stale.** They say Prisma's client is generated
      into `backend/node_modules` via `--schema=...`. In reality it goes to `backend/generated/`
      via `prisma7.config.ts`. This was left alone because TASK-020 only owned the pnpm
      correction.

## Found by `/validate` on TASK-020 (2026-09-24)

159.  **`/validate`: replayed the workflow from a clean clone.** I `git clone`d the repo into the
      scratchpad (no `node_modules`, `generated/` or `.env`) and started a throwaway
      `postgres:16-alpine` on port 55433 with the workflow's credentials. The step commands were
      read from `ci.yml` itself, not retyped.
      - **Negative control (HEAD, before the diff):** install, then `pnpm --filter backend
typecheck`, exits 1 with `TS2307: Cannot find module '../../generated/prisma/client.ts'`.
        The old workflow would have failed on its first real run.
      - **With the diff:** all 7 steps exit 0. `migrate deploy` applied both migrations. The
        tests were shared 48, backend 158 + 4 todo (DB-backed, against the service DB), and
        frontend 234. The build passed.
      - The dev DB was never touched. The container, the image and the clone were removed.
160.  **Every gate fails on an injected regression:**
      - A type error in a backend _test_ makes `pnpm typecheck` exit 1. It was invisible before
        #155.
      - A wrong expectation in a DB-backed suite makes `pnpm test` exit 1.
      - A frontend type error makes `pnpm build` exit 1.
      - An explicit `any` (error-level lint rule) makes `pnpm lint` exit 1.
161.  **`docker build -f backend/Dockerfile .` still succeeds with the wider tsconfig.** The build
      stage's `tsc` now also checks `backend/test/`, and it passes.
162.  **BACKLOG: lint _warnings_ never fail CI.** `@typescript-eslint/no-unused-vars` is `warn`
      in the root `eslint.config.js`, and no lint script passes `--max-warnings 0`. An unused
      local variable passed `pnpm lint` with exit 0. The repo has 0 warnings today, so adding
      `--max-warnings 0` to each workspace's `lint` script is cheap. It is a policy change
      (someone chose `warn`), so it was left for an explicit decision.

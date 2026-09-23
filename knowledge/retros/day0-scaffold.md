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

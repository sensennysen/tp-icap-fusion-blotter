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

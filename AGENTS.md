# AGENTS.md

> Cross-tool project rules. Every AI assistant working on this project must read this file first.

## Project

**Fusion Trade Blotter** — a real-time equity trade blotter: view, create, amend, and cancel
trades, with changes pushed live to every connected client. Single-sitting take-home deliverable
(see `docs/arch-docs/trade-blotter/ARCH.md` §13) — not a phased production rollout, so this pass
wires **real** Prisma-backed persistence and real WebSocket broadcasting directly; it does not use
`/scaffold`'s usual mock-data-only Day-0 restriction. Auth is a **mock** cookie/role session (bonus
TASK-002, `ARCH.md` §7), not real authentication.

**Stack:** TypeScript everywhere · pnpm workspaces (`frontend/`, `backend/`, `shared/`) · Express ·
PostgreSQL 16 + Prisma · raw `ws` WebSocket server on the same HTTP port · Vite + React ·
TanStack Table + TanStack Query · React Hook Form + Zod · Tailwind CSS v4 · Vitest.

Full architecture rationale: `docs/arch-docs/trade-blotter/ARCH.md` and its four ADRs.

## Coding Standards

See `knowledge/rules/coding-standards.md` for the full ruleset.

### Non-negotiable rules

- Validate at the API boundary only (Zod, from `shared/schemas.ts`) — internal calls trust
  already-validated data.
- All Prisma queries are parameterized via the Prisma client — no raw SQL, no injection surface.
- Every thrown error maps to the JSON envelope `{ "error": { "code", "message", "fields"? } }`
  (`backend/src/middleware/errorHandler.ts`). Status codes: 400 validation, 401 no session,
  403 wrong role, 404 not found, 409 conflict, 500 unexpected (logged server-side, generic message
  to the client).
- No `console.log` — use `pino` (`backend/src/lib/logger.ts`).
- CORS is restricted to `CORS_ORIGIN` from the environment — never wildcarded.
- All secrets/config via environment variables (`.env`, documented in `.env.example`) — never
  hardcoded.
- Pin exact dependency versions in every `package.json` — no `^`/`~`, no "latest", no beta/RC
  packages. Resolve real versions via the package manager, never from memory.
- `shared/` is the single source of truth for the `Trade` type and Zod schemas — never duplicate
  validation logic between `frontend/` and `backend/`.
- `useRealtimeTrades` must reconcile WebSocket events directly into the exact TanStack Query cache
  key the blotter is reading (`ADR-004` consequence) — never force a network refetch per event.
- Auth is mock-only (`ARCH.md` §7): an unsigned `fusion_session` cookie holding `{ username, role }`.
  Do not grow it into real auth (passwords, JWTs, identity providers) without an explicit ask.
  Every trade mutation route sits behind `requireRole('trader')`, and the audit `changedBy` is the
  session username passed down from the route. Never reintroduce a fixed placeholder user.

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- One logical change per commit
- Branch naming: `feat/`, `fix/`, `chore/`
- Pre-commit runs lint-staged (ESLint + Prettier) via Husky; commit messages are linted by
  commitlint (`@commitlint/config-conventional`). CI sets `HUSKY=0`.

## Quality Gates

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass before calling work done.
- Run `/validate` after every `/apply`.
- Contribute new patterns to `knowledge/patterns/` when a reusable one emerges.

## Local Development

- `pnpm install && pnpm dev` (root), or `docker compose up` (preferred — starts Postgres, backend,
  frontend together with healthchecks).
- Build order matters: `shared/` before `backend/`/`frontend/` — the root `pnpm build` script
  already runs them in that order.
- `pnpm --filter backend prisma:migrate` to apply schema changes; `pnpm --filter backend seed` to
  seed idempotent sample data (skips if trades already exist).

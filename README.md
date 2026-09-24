# Fusion Trade Blotter

A real-time equity trade blotter: view, create, amend, and cancel trades, with changes pushed
live to every connected client via WebSocket. See `docs/arch-docs/trade-blotter/ARCH.md` for the
full architecture and its ADRs for the reasoning behind each stack choice.

## Stack

TypeScript everywhere · pnpm workspaces (`frontend/`, `backend/`, `shared/`) · Express ·
PostgreSQL 16 + Prisma · raw `ws` WebSocket server (same port as HTTP) · Vite + React ·
TanStack Table + TanStack Query · React Hook Form + Zod · Tailwind CSS v4.

## Quick start (Docker — preferred)

```bash
docker compose up
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000 (health check at `/health`)
- Postgres: localhost:5432 (user/pass/db: `trades`/`trades`/`trades`)

The backend seeds ~500 sample trades on first boot if the table is empty (idempotent — safe to
restart).

## Quick start (without Docker)

Requires Node.js 22+, pnpm 12+, and a local PostgreSQL 16 instance.

```bash
cp .env.example .env   # edit DATABASE_URL to point at your local Postgres
pnpm install
pnpm --filter backend prisma:migrate
pnpm --filter backend seed
pnpm dev
```

`pnpm dev` runs the backend and frontend together. `shared/` needs no separate build step for
dev — both workspaces resolve it straight from `shared/src` — but the root `pnpm build` script
builds `shared/` first, then `backend/`, then `frontend/`, in that order (see ADR-001).

## Testing

```bash
pnpm test        # shared → backend → frontend, in that order
pnpm lint
pnpm typecheck
```

Backend integration tests run against a real Postgres (see `.github/workflows/ci.yml` for the CI
service container setup) — point `DATABASE_URL` at a disposable test database before running
`pnpm --filter backend test` locally.

## Project structure

```
frontend/   Vite + React UI
backend/    Express API + WebSocket broadcaster
shared/     Trade domain type, Zod schemas, WS event types (imported by both)
database/   Prisma schema + migrations
docs/arch-docs/trade-blotter/   Architecture document + ADRs
knowledge/  Coding standards, design tokens, dev prompt templates
```

## Notes on scope

- **Auth**: mock only (bonus). Sign in with any username and pick a role. A **trader** can create,
  amend and cancel. A **viewer** is read-only. The session is an unsigned cookie with no password,
  so it's a stand-in for real auth, not a security boundary (`ARCH.md` §7). Audit rows record the
  signed-in username as `changedBy`.
- **No Figma export**: the UI was built from `ARCH.md` §11's functional layout notes and a small
  Tailwind token set documented in `knowledge/rules/design-system.md`, not a design handoff.

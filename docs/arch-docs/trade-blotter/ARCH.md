# Architecture Document — TP ICAP Fusion Platform: Trade Blotter

Status: Draft for `/scaffold`
Source brief: "Full Stack Developer Take-Home Exercise" (TP ICAP Fusion Platform), received 2026-09-22, 7-day window, 8-15h target effort.

## 1. Overview & Goals

A small trading platform application exposing a real-time trade blotter for equity trades: view, create, amend, and cancel trades, with changes pushed live to every connected client.

This is a **single-sitting take-home deliverable**, not a phased production rollout. Section 13 explains how that changes the way `/scaffold`'s Day-0/Day-1 split should be applied here — read it before running APPLY.

Non-goals (explicitly out of scope per the brief): complex regulatory trade workflows, production-hardening, multi-tenant auth (unless the bonus is attempted).

## 2. Stack Decisions (summary)

| Layer            | Choice                                                                  | Why (detail in ADRs)                                                                                                 |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Language         | TypeScript everywhere (frontend, backend, shared)                       | Required by brief; enables one shared domain-type/validation layer                                                   |
| Monorepo         | pnpm workspaces: `frontend/`, `backend/`, `shared/`                     | Zero extra tooling (no Nx/Turborepo) for a project this size — see [ADR-001](./ADR-001-stack-and-monorepo.md)        |
| Backend          | Node.js + Express                                                       | Simplest of the brief's acceptable options, least boilerplate — see [ADR-001](./ADR-001-stack-and-monorepo.md)       |
| Database         | PostgreSQL 16 via Docker Compose                                        | Matches "Docker preferred" deliverable; avoids dev/prod drift — see [ADR-002](./ADR-002-database-and-persistence.md) |
| ORM              | Prisma                                                                  | Typed client, migrations + seed CLI built in — see [ADR-002](./ADR-002-database-and-persistence.md)                  |
| Real-time        | Raw `ws` WebSocket server on the same HTTP server                       | Fewer deps than Socket.IO for this scope — see [ADR-003](./ADR-003-realtime-transport.md)                            |
| Frontend         | Vite + React + TypeScript                                               | Fast dev loop, no framework overhead needed                                                                          |
| Grid             | TanStack Table                                                          | Headless, typed, lighter than AG Grid for ~100-1,000 rows — see [ADR-004](./ADR-004-frontend-grid-and-state.md)      |
| Server state     | TanStack Query                                                          | Cache + manual refetch + optimistic updates map directly to "Refreshing data from the API" requirement               |
| Forms/validation | React Hook Form + Zod, schemas shared from `shared/`                    | One validation source of truth for both client and server                                                            |
| Testing          | Vitest + Supertest (backend), Vitest + React Testing Library (frontend) | Single test runner across the monorepo                                                                               |

## 3. Component Breakdown

### Backend (`backend/`)

- `TradeRepository` — Prisma-backed data access for trades (CRUD + filtered/sorted list query)
- `TradeService` — business logic: create/amend/cancel, status-transition rules, delegates validation to shared Zod schemas
- `TradeController` / `routes/trades.ts` — Express routes: `GET /trades`, `GET /trades/:id`, `POST /trades`, `PATCH /trades/:id`, `POST /trades/:id/cancel`
- `WebSocketBroadcaster` — wraps the `ws` server, exposes `broadcast(event)` called by `TradeService` after each successful mutation
- `errorHandler` middleware — maps thrown errors (validation, not-found, conflict) to the JSON error envelope in §8
- `seed.ts` — idempotent startup seed: generates 100-1,000 randomized trades if the table is empty (Prisma script, run from `database/`)

### Frontend (`frontend/`)

- `TradeBlotterPage` — top-level page: toolbar (filters, create button, refresh) + grid
- `TradeGrid` — TanStack Table wrapper: sorting, column defs, status/side styling
- `TradeFilters` — symbol/trader/side/status filter controls, local state feeding the query
- `CreateTradeModal` / `AmendTradeModal` — React Hook Form + Zod resolver, shared field-level validation with backend
- `CancelTradeConfirm` — confirm-and-cancel action per row
- `useTrades` — TanStack Query hook wrapping `GET /trades` (+ mutations for create/amend/cancel)
- `useRealtimeTrades` — WebSocket client hook: connects, reconnects with backoff, dispatches incoming events into the TanStack Query cache
- `apiClient.ts` — typed fetch wrapper using `shared/` request/response types

### Shared (`shared/`)

- `trade.ts` — `Trade` domain type (extends the brief's minimum shape with `book`, `counterparty`)
- `schemas.ts` — Zod schemas for create/amend payloads, imported by both backend routes and frontend forms
- `events.ts` — WebSocket event envelope types: `TRADE_CREATED` / `TRADE_AMENDED` / `TRADE_CANCELLED`

### Database (`database/`)

- `schema.prisma` — Prisma schema (§4)
- `migrations/` — Prisma-generated migrations
- `seed.ts` invocation wiring (actual script lives in `backend/` per above, referenced from here via `prisma db seed` config)

### Infra (repo root)

- `docker-compose.yml` — postgres + backend + frontend, healthchecked
- `backend/Dockerfile`, `frontend/Dockerfile`

## 4. Data Model

`trades` table (Prisma model `Trade`):

| Column                    | Type                                       | Notes                                  |
| ------------------------- | ------------------------------------------ | -------------------------------------- |
| `id`                      | `String @id @default(cuid())`              | internal PK                            |
| `tradeId`                 | `String @unique`                           | human-readable code, e.g. `TRD-100001` |
| `symbol`                  | `String`                                   | indexed                                |
| `side`                    | `Side` enum (`BUY`, `SELL`)                |                                        |
| `quantity`                | `Int`                                      | app + DB check: `> 0`                  |
| `price`                   | `Decimal(12,4)`                            | app + DB check: `> 0`                  |
| `trader`                  | `String`                                   | indexed; required, non-empty           |
| `book`                    | `String`                                   | extension beyond brief's minimum model |
| `counterparty`            | `String`                                   | extension beyond brief's minimum model |
| `tradeTimestamp`          | `DateTime`                                 | indexed (default sort key)             |
| `status`                  | `TradeStatus` enum (`ACTIVE`, `CANCELLED`) | indexed                                |
| `createdAt` / `updatedAt` | `DateTime`                                 | Prisma-managed                         |

Indexes: `symbol`, `trader`, `status`, `tradeTimestamp` — covers the brief's sort/filter requirements.

`trade_audit` table (Prisma model `TradeAudit`, bonus Audit Trail — implemented):

| Column          | Type                          | Notes                                                                        |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `id`            | `String @id @default(cuid())` | internal PK                                                                  |
| `tradeId`       | `String`                      | FK → `trades.id` (the cuid PK, **not** the `TRD-n` code); cascades on delete |
| `changedFields` | `Json`                        | `{ <field>: { from, to } }` for each field whose value changed               |
| `changedAt`     | `DateTime @default(now())`    |                                                                              |
| `changedBy`     | `String`                      | username of the mock-auth session that made the change (§7)                  |

Index: `(tradeId, changedAt)`. Every successful amend/cancel writes exactly one row in the same transaction as the trade change (row-locked with `SELECT … FOR UPDATE` so the `from` values are exact); a rejected write (404/409) writes none. An amend that changes no values still writes one row with `changedFields = {}`. Creates are not audited. The cascade exists only so prefix-scoped test cleanups keep working — the app never deletes trades.

## 5. API Design & Contracts

REST, JSON, base path `/api`:

| Method | Path                                                 | Purpose                                       |
| ------ | ---------------------------------------------------- | --------------------------------------------- |
| GET    | `/trades?symbol=&trader=&side=&status=&sort=&order=` | list with filter/sort                         |
| GET    | `/trades/:id`                                        | single trade                                  |
| POST   | `/trades`                                            | create (validated by shared Zod schema)       |
| PATCH  | `/trades/:id`                                        | amend (rejects if `status=CANCELLED`)         |
| POST   | `/trades/:id/cancel`                                 | status transition to `CANCELLED`              |
| GET    | `/trades/:id/audit`                                  | audit history, oldest first (404 if no trade) |
| POST   | `/auth/login`                                        | mock sign-in: sets the session cookie (§7)    |
| POST   | `/auth/logout`                                       | clears the session cookie (204)               |
| GET    | `/auth/me`                                           | current session user (401 if none)            |

The three trade mutations (`POST /trades`, `PATCH /trades/:id`, `POST /trades/:id/cancel`) require a
`trader` session: `401` without a valid session, `403` for a `viewer`. Reads stay public.

Request/response bodies typed from `shared/trade.ts` and `shared/auth.ts`; validation errors return field-level detail (§8).

## 6. Real-Time Architecture

Single `ws` WebSocketServer attached to the same HTTP server as Express (one port, simplest local/Docker networking). On each successful mutation, `TradeService` calls `WebSocketBroadcaster.broadcast()` with a typed envelope:

```ts
{ type: "TRADE_CREATED" | "TRADE_AMENDED" | "TRADE_CANCELLED", payload: Trade }
```

All connected clients receive every event (no per-client filtering needed at this scale). Frontend's `useRealtimeTrades` reconciles the event into the TanStack Query cache directly (no forced refetch), satisfying "visible to all connected clients without a page refresh."

## 7. Middleware, Auth & Security

- CORS restricted to the frontend's origin (env-configured), with `credentials: true` so the browser sends and stores the session cookie. The frontend calls the API with `credentials: 'include'`.
- JSON body parsing + request size limit.
- Request logging via `pino` (not `console.log`).
- **Mock authentication (bonus TASK-002, implemented).** There is no identity provider and no password. `POST /api/auth/login` takes `{ username, role }` (`loginSchema` in `shared/src/auth.ts`, role `trader` | `viewer`) and sets the `fusion_session` cookie: base64url JSON of that user, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `AUTH_COOKIE_SECURE=true`.
  - `authenticate` middleware re-validates the cookie on every request. A garbled or tampered cookie reads as no session, so it never causes a 500.
  - `requireRole('trader')` guards the three mutations: `401` with no session, `403` for a viewer.
  - Routes pass the session username to `TradeService.amend/cancel` as the audit `changedBy`.
  - Creates are not audited, so they record no user.
- **The cookie is unsigned, so anyone can forge one.** That is acceptable only because this is a mock. Real auth would need a signed/opaque session backed by a real identity provider.
- Reads (`GET /api/trades*`), `/health` and the WebSocket upgrade stay public. The socket only broadcasts, and the frontend puts the whole blotter behind the login screen.
- CSRF: `SameSite=Lax` keeps the cookie off cross-site POST/PATCH requests. The frontend (`:5173`) and API (`:4000`) are the same _site_, because ports don't count toward site, so Lax doesn't get in their way.
- `pino-http` redacts `req.headers.cookie` and `res.headers["set-cookie"]`, so sessions never reach the logs.
- Input validation at the API boundary only (Zod) — internal calls trust validated data.
- All queries go through Prisma (parameterized) — no raw SQL, no injection surface.

## 8. Error Handling Strategy

Consistent JSON error envelope from a centralized Express error-handling middleware:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "fields": { "quantity": "must be positive" }
  }
}
```

Status code mapping: `400` validation, `401` no/invalid session on a protected route, `403` wrong role (viewer attempting a mutation), `404` not found, `409` conflict (e.g. amending/cancelling an already-cancelled trade), `500` unexpected (logged, generic message to client).

## 9. Environment Variables

| Var                  | Used by                    | Example                                          |
| -------------------- | -------------------------- | ------------------------------------------------ |
| `DATABASE_URL`       | backend, database (Prisma) | `postgresql://user:pass@postgres:5432/trades`    |
| `PORT`               | backend                    | `4000`                                           |
| `CORS_ORIGIN`        | backend                    | `http://localhost:5173`                          |
| `VITE_API_BASE_URL`  | frontend                   | `http://localhost:4000/api`                      |
| `VITE_WS_URL`        | frontend                   | `ws://localhost:4000`                            |
| `NODE_ENV`           | backend                    | `development` / `production`                     |
| `AUTH_COOKIE_SECURE` | backend                    | `false` (set `true` only when served over HTTPS) |

Full list documented in `.env.example` during APPLY.

## 10. Repository & Deployment Layout

```
/
├── frontend/
├── backend/
├── shared/
├── database/          # schema.prisma, migrations/
├── docker-compose.yml
├── README.md
└── docs/arch-docs/trade-blotter/   # this ARCH doc + ADRs
```

Local run: `docker compose up` (preferred) or `pnpm install && pnpm dev` at root (workspaces) against a local/dockerized Postgres. Must work unmodified on Windows/Linux/Mac.

## 11. UI Notes (Figma substitute)

No Figma export exists for this exercise — see §13. In its place, a minimal functional layout to build against during PLAN/APPLY:

- Single page: toolbar (filter fields, "New Trade" button, refresh icon) above the trade grid.
- Grid rows color-coded by `side` (BUY/SELL) and dimmed when `status=CANCELLED`.
- Create/Amend open as a modal dialog; Cancel is an inline row action with a confirm step.
- Toasts for: real-time event received, mutation success/failure, connection lost/restored.
- No design tokens/component library to port — use a small, consistent Tailwind (or CSS Modules) setup decided during PLAN.

## 12. Testing Strategy

- Backend: unit tests for `TradeService` (status transitions, validation edge cases); integration tests for each route via Supertest against a test database.
- Frontend: component tests for `TradeGrid`, `CreateTradeModal`/`AmendTradeModal`; a mocked-WebSocket test proving `useRealtimeTrades` updates the cache on each event type.
- Shared Zod schemas get their own unit tests (single source of truth — worth testing directly rather than only through the routes/forms that use them).

## 13. Open Questions / Adaptation Notes for `/scaffold`

1. **No Figma export.** `/scaffold`'s prerequisites call for one; §11 above is the substitute input for the UI-shell portion of PLAN. Skip the `ingest_figma_zip` prerequisite step.
2. **Day-0/Day-1 split doesn't map cleanly onto a solo take-home.** `/scaffold` is designed for a multi-day rollout: Day 0 = mock data/mock auth shell, Day 1 = real DB/real integrations wired in later by (often) someone else. This exercise has no Day-1 handoff — the same person must deliver a fully working, really-persisted, really-real-time app within one 8-15h window. Recommendation: **do not apply the mock-data-only restriction.** Run `/scaffold` for project structure, tooling, Dockerfiles, and the design-system/UI-shell scaffolding, but wire the real Prisma-backed CRUD + real WebSocket broadcasting directly in APPLY rather than deferring it — i.e., treat this whole exercise as a single Day-0-and-Day-1-combined pass. If you'd rather keep `/scaffold` literal (mock-only) and follow up with `/dev-tasks-planner` + `/epav` per task for the "real" wiring, that also works — just be aware it adds a mock→real swap step this brief doesn't ask for and that eats into the 8-15h budget.
3. **Auth is bonus-only.** Don't scaffold the mock-auth cookie/login flow unless the bonus is explicitly in scope for this pass. _(Update: picked up as bonus TASK-002. See §7.)_

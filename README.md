# Fusion Trade Blotter

A real-time equity trade blotter. You can view, sort, filter, create, amend and cancel trades.
Every change is pushed over WebSocket to every connected browser, with no page refresh.

- **Stack:** TypeScript everywhere · pnpm workspaces (`frontend/`, `backend/`, `shared/`) ·
  Express 5 · PostgreSQL 16 + Prisma 7 · raw `ws` WebSocket server on the HTTP port · Vite + React ·
  TanStack Table + TanStack Query · React Hook Form + Zod · Tailwind CSS v4 · Vitest.
- **Bonus features built:** audit trail, mock login with trader/viewer roles, virtualised grid,
  trade validation rules, Docker support, and a CI pipeline.
- **AI usage:** see [`AI_USAGE_REPORT.md`](AI_USAGE_REPORT.md) and [`PROMPT_LOG.md`](PROMPT_LOG.md).

---

## Contents

1. [Quick start](#quick-start)
2. [Architecture decisions](#architecture-decisions)
3. [Installation](#installation)
4. [Running the application](#running-the-application)
5. [Running tests](#running-tests)
6. [Assumptions](#assumptions)
7. [Trade-offs accepted](#trade-offs-accepted)
8. [Project structure](#project-structure)
9. [Further reading](#further-reading)

---

## Quick start

With Docker installed:

```bash
docker compose up --build
```

Then open **http://localhost:5173**. Sign in with any username and pick a role:

- **trader** can create, amend and cancel trades.
- **viewer** is read-only.

To see live updates, open a second browser window, sign in there too, and change a trade in one
window. The other window updates at once.

---

## Architecture decisions

The full rationale is in [`docs/arch-docs/trade-blotter/ARCH.md`](docs/arch-docs/trade-blotter/ARCH.md)
and four ADRs. Here is the short version.

### High-level shape

```
┌────────────── Browser (Vite + React) ───────────────┐
│ TradeBlotterPage                                    │
│  ├─ TradeFilters ──► useTrades (TanStack Query) ────┼──► REST  /api/trades…
│  ├─ TradeGrid (TanStack Table, virtualised >200)    │
│  ├─ Create / Amend modals (RHF + shared Zod)        │
│  └─ useRealtimeTrades ── writes events into the ◄───┼─── WebSocket  ws://…:4000
│                          Query cache (no refetch)   │
└─────────────────────────────────────────────────────┘
                              │ same port
┌──────────────── Backend (Express + ws) ─────────────┐
│ routes ─► TradeService ─► TradeRepository ─► Prisma ─┼──► PostgreSQL 16
│             │                                       │    trades, trade_audit
│             └─► WebSocketBroadcaster.broadcast()    │
└─────────────────────────────────────────────────────┘
         shared/  = Trade type · Zod schemas · WS event types (used by both sides)
```

### Key decisions

| Area                        | Decision                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo**                | pnpm workspaces with a `shared/` package. No Nx or Turborepo.                                                                                            | The `Trade` type, the Zod schemas and the WebSocket event types are defined once and imported by both sides. Client and server validation can't drift apart. Three small packages don't need a build orchestrator. ([ADR-001](docs/arch-docs/trade-blotter/ADR-001-stack-and-monorepo.md))  |
| **Backend**                 | Express, in layers: routes → service → repository.                                                                                                       | Express is the simplest option the brief allows. Routes only parse and delegate. `TradeService` owns the status rules and the broadcasts. `TradeRepository` is the only code that talks to Prisma.                                                                                          |
| **Database**                | PostgreSQL 16 with Prisma. Schema and migrations live in `database/`.                                                                                    | The trade model is relational and has fixed fields. Prisma gives a typed client, migrations and a seed hook. Docker makes Postgres zero-install on any OS, so there is no SQLite fallback to keep in sync. ([ADR-002](docs/arch-docs/trade-blotter/ADR-002-database-and-persistence.md))    |
| **Integrity in the DB too** | `CHECK` constraints (`quantity > 0`, `price > 0`), indexes on `symbol`, `trader`, `status` and `tradeTimestamp`, and a Postgres sequence for `TRD-` ids. | App validation is the first line of defence. The database is the last. The sequence replaced an earlier `count() + 1` id that could hand two concurrent creates the same id.                                                                                                                |
| **Concurrency**             | Amend and cancel run in one transaction with `SELECT … FOR UPDATE`.                                                                                      | Two clients acting on the same trade at once can't both pass the "is it still ACTIVE?" check. The audit row's `from` values are exact.                                                                                                                                                      |
| **Real-time**               | Raw `ws` server on the same HTTP server and port as Express. It broadcasts `{ type, payload }` after each successful mutation.                           | Server-to-client push is all we need, so Socket.IO's rooms and fallbacks would be dead weight. One port keeps Docker networking and CORS simple. ([ADR-003](docs/arch-docs/trade-blotter/ADR-003-realtime-transport.md))                                                                    |
| **Client state**            | TanStack Query owns server state. WebSocket events are written straight into the cached lists with `setQueryData`.                                       | Live updates cost no network round trip. Each cached filter variant is updated against its own filters, so switching filters never shows stale rows. There is no Redux or Zustand layer duplicating the cache. ([ADR-004](docs/arch-docs/trade-blotter/ADR-004-frontend-grid-and-state.md)) |
| **Grid**                    | TanStack Table (headless). It adds `@tanstack/react-virtual` row virtualisation above 200 rows.                                                          | TanStack Table is lighter than AG Grid and fully typed. At or below the threshold it renders every row. Above it, only about 20–36 rows are in the DOM (tested with 2,000 trades), and rows are measured, so scrolling doesn't jump.                                                        |
| **Forms**                   | React Hook Form + `zodResolver` on the same schemas the API uses. The forms use `noValidate`.                                                            | Every message the user sees comes from `shared/`, never from the browser's built-in validation. Server field errors are mapped back onto the matching inputs.                                                                                                                               |
| **Errors**                  | One JSON envelope, `{ error: { code, message, fields? } }`, from a central `errorHandler`.                                                               | 400 validation · 401 no session · 403 wrong role · 404 not found · 409 conflict (e.g. amending a cancelled trade) · 500 unexpected (logged, generic message).                                                                                                                               |
| **Auth (bonus)**            | Mock only: an `HttpOnly`, `SameSite=Lax` cookie holding `{ username, role }`. `requireRole('trader')` guards the three mutations.                        | It shows role-based access and attributes audit rows (`changedBy`) to a user, without building real identity. See the trade-offs below.                                                                                                                                                     |
| **Observability**           | `pino` structured logs through `pino-http`. Session cookies are redacted. `/health` is used by Docker.                                                   | No `console.log` anywhere. Credentials never reach the logs.                                                                                                                                                                                                                                |

### Data model

- **`trades`**:
  - `id` is an internal cuid.
  - `tradeId` is the human-readable id, e.g. `TRD-100001`, unique and sequence-backed.
  - The other columns are `symbol`, `side`, `quantity` (int), `price` (`DECIMAL(12,4)`), `trader`,
    `book`, `counterparty`, `tradeTimestamp`, `status`, `createdAt` and `updatedAt`.
- **`trade_audit`** (bonus): one row per amend or cancel, written in the same transaction:
  - `changedFields` records `{ field: { from, to } }` for each field that changed.
  - `changedAt` and `changedBy` record when and by whom.

### API

| Method | Path                                                     | Auth    | Purpose                                                     |
| ------ | -------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| GET    | `/api/trades?symbol=&trader=&side=&status=&sort=&order=` | public  | List with filters and sort                                  |
| GET    | `/api/trades/:id`                                        | public  | One trade                                                   |
| GET    | `/api/trades/:id/audit`                                  | public  | Audit history, oldest first                                 |
| POST   | `/api/trades`                                            | trader  | Create                                                      |
| PATCH  | `/api/trades/:id`                                        | trader  | Amend (409 if cancelled)                                    |
| POST   | `/api/trades/:id/cancel`                                 | trader  | Set status to `CANCELLED` (409 if already cancelled)        |
| POST   | `/api/auth/login` · `/api/auth/logout`                   | —       | Mock sign-in and sign-out                                   |
| GET    | `/api/auth/me`                                           | session | Current user                                                |
| GET    | `/health`                                                | public  | Liveness                                                    |
| WS     | `ws://localhost:4000`                                    | public  | Events: `TRADE_CREATED`, `TRADE_AMENDED`, `TRADE_CANCELLED` |

---

## Installation

### Option A: Docker (recommended)

You need **Docker Desktop** (or Docker Engine with Compose v2). Nothing else is required. You don't
need Node or Postgres on the host.

```bash
git clone https://github.com/sensennysen/tp-icap-fusion-blotter.git
cd tp-icap-fusion-blotter
```

### Option B: local toolchain

You need:

- **Node.js 22+**
- **pnpm 12** (`corepack enable` picks up the pinned `pnpm@12.5.1` from `package.json`)
- **PostgreSQL 16**, running locally or in Docker (see below)

```bash
git clone https://github.com/sensennysen/tp-icap-fusion-blotter.git
cd tp-icap-fusion-blotter
corepack enable
pnpm install

# Backend and Prisma read the root .env. Vite reads frontend/.env. Copy the example to both.
cp .env.example .env
cp .env.example frontend/.env
```

The defaults in `.env.example` point at `postgresql://trades:trades@localhost:5432/trades`. The
easiest way to get a matching database is to start only the Compose Postgres service:

```bash
docker compose up -d postgres
```

Then generate the Prisma client, apply the migrations and seed the sample data:

```bash
pnpm --filter backend prisma:generate
pnpm --filter backend prisma:migrate
pnpm --filter backend seed
```

The seed is idempotent. It generates about 500 randomised trades (roughly 10% cancelled) only when
the table is empty.

---

## Running the application

### With Docker

```bash
docker compose up --build
```

| Service                                 | URL                                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| Frontend (nginx serving the Vite build) | http://localhost:5173                                      |
| Backend API and WebSocket               | http://localhost:4000 · ws://localhost:4000                |
| Health check                            | http://localhost:4000/health                               |
| Postgres                                | `localhost:5432`, user, password and database all `trades` |

Start-up order is enforced by healthchecks: **postgres healthy → backend runs `migrate deploy` +
seed, then listens → backend healthy → frontend starts.** Restarting is safe. Migrations and the
seed are both no-ops the second time.

- Stop the stack: `docker compose down`.
- Also wipe the database: `docker compose down -v`.

> Ports 5432, 4000 and 5173 are fixed. Stop any local Postgres or `pnpm dev` first, or Compose will
> fail to bind.

### Without Docker

```bash
pnpm dev          # backend (tsx watch, :4000) and frontend (Vite, :5173) together
```

Open http://localhost:5173.

### Using the app

1. **Sign in.** Enter any username and choose **trader** or **viewer**.
2. **Filter.** The Symbol, Trader, Side and Status filters query the API. Symbol and Trader are
   exact matches and case-sensitive.
3. **Sort.** Click any column header to toggle ascending or descending. The default is newest
   timestamp first.
4. **Refresh.** Refetches from the API. A failed refresh shows a toast and keeps the current rows.
5. **Create, amend or cancel** (trader only).
   - **New Trade** and a row's **Amend** open a validated form. If the save fails, the form stays
     open and keeps your input.
   - **Cancel** asks for confirmation first. Focus starts on "Keep Trade".
6. **Live updates.** Changes from other clients appear at once, with a toast. If the WebSocket
   drops, you see "Connection lost". The client reconnects with exponential backoff (1s up to 30s)
   and then shows "Connection restored".

---

## Running tests

```bash
pnpm test         # shared → backend → frontend
pnpm lint
pnpm typecheck    # includes backend test files
pnpm build        # shared → backend → frontend
```

These four commands are the quality gate. CI (`.github/workflows/ci.yml`) runs the same steps
against a Postgres 16 service container: install → Prisma generate → lint → typecheck → migrate →
test → build.

| Package    | Tests           | What they cover                                                                                                                                                                                                                                                                                                                                        |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared`   | 48              | Zod schemas: required fields, positive quantity and price, int32 and `DECIMAL(12,4)` limits, trimming, list-query parsing                                                                                                                                                                                                                              |
| `backend`  | 223 (+2 `todo`) | Service rules (unit, mocked repository). Repository, routes, audit and DB `CHECK` constraints against **real Postgres**. Real `ws` clients for fan-out, pruning and malformed-frame handling. Error envelope, CORS, helmet, body limit, auth guard. The seed. Static checks that `docker-compose.yml` and `ci.yml` stay consistent.                    |
| `frontend` | 264             | Grid sorting, styling, virtualisation and live prepends. Filters. Form modals (shared validation, server field errors, failure keeps input). Cancel dialog. Toasts. `useTrades`. `useRealtimeTrades` (cache reconcile across filter variants, no refetch, backoff, malformed frames). Login and viewer mode. Full-page wiring with a mocked WebSocket. |

**535 tests pass** (48 + 223 + 264) as of this commit. Most suites were mutation-checked while they
were written: a bug was planted on purpose and the suite had to catch it. The retro log in
`knowledge/retros/day0-scaffold.md` records the results.

### Backend tests need Postgres

The backend's DB-backed suites connect to whatever `DATABASE_URL` points at. They fail rather than
skip if the database isn't reachable. Before running `pnpm test` locally:

```bash
docker compose up -d postgres
pnpm --filter backend prisma:migrate
```

The suites create uniquely prefixed rows and delete only what they created, so the seeded data
survives. A dedicated test database is still the safer choice. To run one package at a time:

```bash
pnpm --filter shared test
pnpm --filter backend test
pnpm --filter frontend test   # jsdom, no database needed
```

---

## Assumptions

- **Trade model.** It extends the brief's minimum shape with `book` and `counterparty`, as in the
  sample data.
  - The brief's `tradeDate` is `tradeTimestamp`, a full ISO-8601 UTC timestamp.
  - `id` is an internal key. `tradeId` (`TRD-100001`) is the human-facing id.
- **Status lifecycle.** `ACTIVE → CANCELLED` is the only transition, and cancelling is terminal.
  Amending or cancelling a cancelled trade returns **409**. There is no reinstate, and trades are
  never deleted.
- **Amend** can change any business field (symbol, side, quantity, price, trader, book,
  counterparty, timestamp) but never `status` or `tradeId`.
- **Validation rules.**
  - Symbol, trader, book and counterparty are required and trimmed.
  - Quantity is a positive integer that fits in int32.
  - Price is positive, below 100,000,000, with at most 4 decimal places.
  - The same rules run in the form, the API and (for quantity and price) the database.
- **`trader` is a trade attribute, not the logged-in user.** A sales user can book a trade for
  another trader. The session user is recorded separately as the audit `changedBy`.
- **Everyone sees every trade.** There is no per-desk or per-user visibility. Every client receives
  every event.
- **Scale.** Around 100–1,000 trades, as the brief says. The list endpoint returns the whole
  filtered set with no pagination. The grid virtualises above 200 rows and was tested with 2,000.
- **Display.** Prices show in USD with 2–4 decimal places, matching the stored precision.
  Timestamps show in the browser's locale.
- **Desktop-first.** It is a trading tool. Narrow screens scroll horizontally rather than reflow.

---

## Trade-offs accepted

**Security and auth**

- **The mock auth is not a security boundary.** The session cookie is unsigned base64 JSON with no
  password, so anyone can forge a trader session. This was a deliberate mock to show roles and
  audit attribution. Real auth would need a signed or opaque session backed by an identity
  provider.
- **The WebSocket and the read endpoints are unauthenticated.** The socket only broadcasts, and the
  UI sits behind the login screen. A raw `ws://` client can still read the event stream.
- **Creates are not audited.** Only amends and cancels write audit rows, and the audit history has
  no UI yet. It is available at `GET /api/trades/:id/audit`.

**Scaling**

- **The broadcaster is in-memory and single-instance.** Connected sockets are held in a `Set`. Two
  backend replicas would each broadcast only their own changes. Scaling out would need
  Postgres `LISTEN/NOTIFY`, Redis pub/sub or similar.
- **There is no event replay or sequence numbers.** A client that reconnects doesn't get the events
  it missed. It keeps its cache, and **Refresh** resyncs it. That is fine at this scale. A real
  blotter would resync on reconnect.
- **There is no pagination.** Filtering runs on the server. Sorting runs on the client, because the
  whole filtered set is loaded. Both are fine for about 1,000 rows, not for millions.
- **Row locking holds pool connections.** Amend and cancel wait on a row lock inside an interactive
  transaction. A burst of more than about 10 concurrent writes to one hot trade could exhaust
  Prisma's pool or transaction timeout.

**UX**

- **Filters are exact and case-sensitive, with no debounce.** Each keystroke sends a request. This
  keeps server filtering and client-side event matching identical and simple.
- **The Cancel dialog shows a snapshot of the trade.** If another user cancels the same trade while
  your dialog is open, confirming returns a 409 error toast.
- **Accessibility isn't complete.** The dialogs close on Escape and focus the safe action, but they
  have no focus trap. In virtualised mode, a focused row button that scrolls out of view loses
  focus.

**Build and deployment**

- **The backend runs TypeScript via `tsx`, not compiled JS.** Prisma 7 generates its client as `.ts`
  source. Running through `tsx` avoided a separate compile step for generated code. `tsc` still
  typechecks everything.
- **Ports are hard-coded in `docker-compose.yml`**, and Docker was verified on macOS (arm64) only.
  The build is designed to be OS-agnostic: `.dockerignore` keeps host `node_modules` out, and the
  repo has no shell scripts. A real Windows run hasn't been done.

**Known rough edges** (logged, not fixed)

- `PATCH` accepts an empty body as a no-op.
- A body over 100 KB returns 500 instead of 413.
- Unknown `/api/*` paths return Express's HTML 404.
- Lint warnings don't fail CI.

These and the rest of the 190 logged findings, each with its reasoning, are in
`knowledge/retros/day0-scaffold.md`.

---

## Project structure

```
frontend/            Vite + React UI
  src/pages/         TradeBlotterPage (composition root)
  src/components/    TradeGrid, TradeFilters, Create/Amend modals, CancelTradeConfirm, LoginForm, Toast
  src/hooks/         useTrades, useRealtimeTrades, useAuth
  src/lib/           apiClient, queryClient, tradeListQuery
backend/             Express API + WebSocket broadcaster
  src/routes/        trades, auth, health
  src/services/      TradeService (status rules, audit, broadcast)
  src/repositories/  TradeRepository, TradeAuditRepository (Prisma only)
  src/realtime/      WebSocketBroadcaster
  src/middleware/    auth, errorHandler, requestLogger
  src/seed*.ts       idempotent randomised seed
shared/              Trade type, Zod schemas, auth types, WS event types (imported by both)
database/            schema.prisma + SQL migrations (CHECK constraints, id sequence, audit table)
docs/arch-docs/      ARCH.md + ADR-001…004
docs/dev-tasks/      Task breakdown (core + bonus CSVs) the build followed
knowledge/           Coding standards, design tokens, reusable test patterns, retro log
.github/workflows/   CI
docker-compose.yml   postgres + backend + frontend, healthchecked
```

---

## Further reading

- [`docs/arch-docs/trade-blotter/ARCH.md`](docs/arch-docs/trade-blotter/ARCH.md) covers the full
  architecture: components, API, errors, security and env vars.
- [`AI_USAGE_REPORT.md`](AI_USAGE_REPORT.md) covers how AI was used, and what was accepted or
  rejected.
- [`PROMPT_LOG.md`](PROMPT_LOG.md) is a representative sample of prompts and outcomes.
- [`knowledge/retros/day0-scaffold.md`](knowledge/retros/day0-scaffold.md) is the running log of
  findings, bugs caught and backlog items.
- [`AGENTS.md`](AGENTS.md) and [`knowledge/rules/coding-standards.md`](knowledge/rules/coding-standards.md)
  hold the project rules every AI assistant (and human) followed.

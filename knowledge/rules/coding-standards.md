# Coding Standards

_Derived from `docs/arch-docs/trade-blotter/ARCH.md` and its ADRs. Update via PR when conventions
change._

## Backend (`backend/`)

- Layering: `routes/` (HTTP + Zod parsing) → `services/` (business rules, status transitions) →
  `repositories/` (Prisma access). Routes never call Prisma directly.
- `TradeService` owns status-transition rules: amending or cancelling an already-`CANCELLED` trade
  throws `ConflictError` (409) — see `backend/src/lib/errors.ts`.
- Every successful mutation in `TradeService` calls `WebSocketBroadcaster.broadcast()` with a typed
  envelope (`{ type, payload }`) from `shared/src/events.ts` — never broadcast partial/untyped data.
- Config is loaded once through `backend/src/config/env.ts` (Zod-validated `process.env`) — do not
  read `process.env` directly elsewhere.
- Logging via `pino`/`pino-http` (`backend/src/lib/logger.ts`, `requestLogger.ts`) — never
  `console.log`.

## Frontend (`frontend/`)

- Server state lives in TanStack Query only — no Redux/Zustand/second cache layer (ADR-004).
- Forms use React Hook Form + the Zod resolver against schemas imported from
  `@fusion-blotter/shared` — never hand-roll validation that duplicates a shared schema.
- `useRealtimeTrades` reconciles WebSocket events into the exact query cache key the active filter
  set is reading — it must not trigger a network refetch per event.
- Tailwind v4: any hand-written base selector in `globals.css` (`html`, `body`, etc.) must live
  inside `@layer base { }` — an unlayered rule silently beats every `text-*`/`bg-*` utility
  app-wide, not just on hover.
- Icons from `lucide-react` render as block-level `<svg>` (Tailwind preflight) — center them with
  flex/`mx-auto`, never a parent's `text-align: center`.

## Shared (`shared/`)

- `shared/src/trade.ts`, `schemas.ts`, `events.ts` are the single source of truth for the `Trade`
  domain type, its Zod validation, and the WebSocket event envelope. Both `backend/` and
  `frontend/` import from here — never redefine these types locally.

## Cross-cutting

- No `console.log` in production code — use the project logger (`pino` on the backend).
- All secrets/config via environment variables, documented in `.env.example` — never hardcoded.
- Pin exact dependency versions (no `^`/`~`, no "latest", no beta/RC) — resolve real versions via
  the package manager, not from memory.
- No authentication in this pass — auth is bonus-only per `ARCH.md` §13.

## Rationale

Rules without rationale get ignored. Every rule above traces to a decision in
`docs/arch-docs/trade-blotter/ARCH.md` or one of its four ADRs — read those when a rule seems
arbitrary or you need to extend it.

# ADR-004: Frontend Grid & State Management

## Status

Accepted

## Context

The blotter must display, sort, and filter roughly 100-1,000 trades, refresh from the API on demand, and reflect real-time push events without a manual refresh. The brief's bonus list explicitly names AG Grid and TanStack Table as acceptable virtualized-grid options.

## Decision

- Grid: **TanStack Table** (headless), with `@tanstack/react-virtual` if row count in testing warrants virtualization.
- Server state / caching: **TanStack Query**, with real-time WebSocket events reconciled directly into its cache (`queryClient.setQueryData`) rather than forcing a network refetch per event.
- Forms: **React Hook Form** + **Zod resolver**, resolving against the schemas defined once in `shared/schemas.ts`.

## Alternatives Considered

- **AG Grid**: more built-in features (column menus, enterprise filtering UI) but a heavier dependency and a steeper API to wire correctly within the time budget; TanStack Table's headless model is a better fit for a small custom UI.
- **Redux / Zustand for trade state**: unnecessary — TanStack Query already owns server-state caching, invalidation, and now real-time reconciliation; a second state layer would just duplicate it.
- **Uncontrolled forms without a resolver library**: rejected — hand-rolled validation would duplicate the Zod rules already defined for the backend, reintroducing the drift `shared/` exists to prevent.

## Consequences

- Real-time reconciliation logic (`useRealtimeTrades`) must know the exact TanStack Query cache key(s) the blotter list uses — documented as a task dependency, not left implicit.
- If row counts in testing exceed what TanStack Table's default rendering handles smoothly, virtualization is a follow-up task, not assumed from day one.

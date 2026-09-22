# Prompt template: add a backend endpoint

Use for a new REST endpoint on the trade blotter API.

```
Add `<METHOD> /api/<path>` to the trade blotter backend.

- Define/extend the Zod schema in shared/src/schemas.ts if the payload or query shape changes.
- Add the route handler in backend/src/routes/trades.ts (or a new router file if this isn't a
  trades endpoint), delegating business logic to a service, not inline in the route.
- Any state-changing mutation must call WebSocketBroadcaster.broadcast() with a typed event from
  shared/src/events.ts after it succeeds.
- Errors must throw AppError subclasses (backend/src/lib/errors.ts) — never res.status() directly
  in a route — so they hit the shared error envelope.
- Add a Supertest integration test in backend/test/routes/ covering the happy path and at least
  one error case (validation, not-found, or conflict as applicable).
```

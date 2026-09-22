# ADR-003: Real-Time Transport

## Status

Accepted

## Context

The brief requires changes made by one client to be visible to all connected clients without a page refresh, and lists WebSockets, Socket.IO, and Server-Sent Events as acceptable. The blotter only needs server-to-client push of trade events (created/amended/cancelled) — clients never need to push arbitrary events to each other.

## Decision

Use the **`ws`** library for a raw WebSocket server, attached to the same HTTP server instance Express listens on (one port). A single `WebSocketBroadcaster` broadcasts a typed event envelope to every connected client after each successful trade mutation.

## Alternatives Considered

- **Socket.IO**: adds room/namespace features, auto-reconnect, and a fallback transport this app doesn't need — one more dependency and a heavier client bundle for no functional gain at this scale.
- **Server-Sent Events**: simpler than WebSockets (plain HTTP, auto-reconnect built into `EventSource`), and would have been a reasonable choice too — passed over only because a raw WebSocket keeps the door open for future bidirectional needs (e.g. a bonus feature pushing client actions) at negligible extra cost, and gives one clear "real-time" story to document rather than two considered options left ambiguous.

## Consequences

- Frontend must implement its own reconnect/backoff logic (`ws`/`EventSource` differ here; `EventSource` would have given this for free) — this is a named task in the component breakdown (`useRealtimeTrades`), not an afterthought.
- No message queue or pub/sub layer — broadcaster holds an in-memory `Set` of open sockets, which is correct for a single backend instance and explicitly out of scope for horizontal scaling (acceptable per "we do not expect production-ready systems").

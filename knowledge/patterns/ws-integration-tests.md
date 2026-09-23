# WebSocket Integration Test Pattern

For tests that need real sockets (`backend/test/realtime/`). Shared plumbing lives in
`backend/test/realtime/helpers.ts`.

- Bind `listen(0, '127.0.0.1')` — never a fixed port — so tests can't collide with a running dev
  server or each other.
- Collect frames from the moment the client is constructed (`connect()` attaches the `message`
  listener before awaiting `open`), otherwise a frame sent right after the handshake is lost.
- Never assert "nothing was sent" with a sleep. Send a sentinel afterwards and assert it is the first
  frame the client saw.
- Wait on server-side state with `waitFor(() => set.size === n)`, not on client `open` alone.
- Tear down in this order: terminate clients, close the broadcaster, then `server.close()` +
  `closeAllConnections()`. `wss.close()` leaves clients connected and `http.Server.close()` waits for
  them, so skipping the first step hangs the run (retro #20).
- To hit the "socket is CLOSING" window deterministically, call `close()` on the server-side socket
  and broadcast synchronously — it stays in the client Set until the peer answers the close frame.
- To test error handling, write a raw invalid frame to the client's underlying socket
  (`ws._socket.write(Buffer.from([0xc1, 0x80, 0, 0, 0, 0]))` — RSV1 set, which the server rejects).
  It only passes if the server attaches an `'error'` listener; otherwise it is an unhandled event
  that crashes the process (retro #19).
- Mock the repository (`vi.mock`) when the goal is the transport, not persistence, so the suite
  needs no DB. Silence the real pino logger with `logger.level = 'silent'` — pino-http needs a real
  instance, so don't replace it with a stub.

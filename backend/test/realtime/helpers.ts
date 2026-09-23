import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';

// Shared plumbing for the real-socket suites in this folder. Every server binds
// port 0, so nothing collides with a running dev server or another test file.

export interface TestClient {
  socket: WebSocket;
  // Parsed JSON frames, collected from the moment the socket is constructed so
  // nothing sent right after the handshake can be missed.
  messages: unknown[];
}

export async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

export async function connect(port: number): Promise<TestClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages: unknown[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return { socket, messages };
}

export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Terminates clients first: http.Server.close() waits for every open connection,
// including upgraded WebSocket ones, and would otherwise hang the test run.
export async function shutdown(
  server: Server,
  clients: TestClient[],
  closeBroadcaster: () => void,
): Promise<void> {
  for (const { socket } of clients) {
    socket.terminate();
  }
  closeBroadcaster();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

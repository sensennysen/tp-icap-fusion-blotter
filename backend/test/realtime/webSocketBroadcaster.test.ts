import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade, TradeEvent } from '@fusion-blotter/shared';
import { logger } from '../../src/lib/logger.js';
import { WebSocketBroadcaster } from '../../src/realtime/webSocketBroadcaster.js';
import { connect, listen, shutdown, waitFor, type TestClient } from './helpers.js';

// The broadcaster logs every connect/disconnect at debug level; keep the run quiet.
vi.mock('../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Exercises WebSocketBroadcaster with real `ws` clients over a real socket — no
// mocks, no DB. Nothing here can rely on a fixed delay: "no message" is proven
// by broadcasting a sentinel afterwards and checking it is the first frame seen.

const trade: Trade = {
  id: '00000000-0000-4000-8000-000000000001',
  tradeId: 'TRD-TEST-1',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: '2026-09-23T09:30:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-23T09:30:00.000Z',
  updatedAt: '2026-09-23T09:30:00.000Z',
};

const created: TradeEvent = { type: 'TRADE_CREATED', payload: trade };
const sentinel: TradeEvent = { type: 'TRADE_AMENDED', payload: { ...trade, quantity: 999 } };

let server: Server;
let broadcaster: WebSocketBroadcaster;
let port: number;
let clients: TestClient[];

// `clients` is private; reading it is the only way to observe pruning directly.
const clientSet = () =>
  (broadcaster as unknown as { clients: Set<import('ws').WebSocket> }).clients;

const open = async () => {
  const client = await connect(port);
  clients.push(client);
  return client;
};

beforeEach(async () => {
  clients = [];
  server = createServer();
  broadcaster = new WebSocketBroadcaster(server);
  port = await listen(server);
});

afterEach(async () => {
  await shutdown(server, clients, () => broadcaster.close());
});

describe('WebSocketBroadcaster.broadcast', () => {
  it('delivers the {type, payload} envelope to every open client', async () => {
    const [a, b, c] = [await open(), await open(), await open()];
    await waitFor(() => clientSet().size === 3);

    broadcaster.broadcast(created);
    await waitFor(() => [a, b, c].every((client) => client.messages.length === 1));

    for (const client of [a, b, c]) {
      expect(client.messages).toEqual([created]);
    }
  });

  it.each<TradeEvent>([
    { type: 'TRADE_CREATED', payload: trade },
    { type: 'TRADE_AMENDED', payload: { ...trade, quantity: 250, price: 190.25 } },
    { type: 'TRADE_CANCELLED', payload: { ...trade, status: 'CANCELLED' } },
  ])('delivers $type with its payload intact', async (event) => {
    const client = await open();
    await waitFor(() => clientSet().size === 1);

    broadcaster.broadcast(event);
    await waitFor(() => client.messages.length === 1);

    expect(client.messages[0]).toEqual(event);
  });

  it('is a no-op when nobody is connected', () => {
    expect(() => broadcaster.broadcast(created)).not.toThrow();
  });

  it('does not replay earlier events to a client that connects later', async () => {
    broadcaster.broadcast(created);

    const late = await open();
    await waitFor(() => clientSet().size === 1);
    broadcaster.broadcast(sentinel);
    await waitFor(() => late.messages.length >= 1);

    expect(late.messages).toEqual([sentinel]);
  });

  it('skips a socket that is no longer OPEN', async () => {
    const closing = await open();
    const healthy = await open();
    await waitFor(() => clientSet().size === 2);

    // socket.close() puts the server-side socket in CLOSING synchronously; it
    // stays in the Set until the peer answers the close frame, so broadcast()
    // hits it in exactly that window.
    const [closingServerSide, healthyServerSide] = [...clientSet()];
    const closingSend = vi.spyOn(closingServerSide, 'send');
    const healthySend = vi.spyOn(healthyServerSide, 'send');
    closingServerSide.close();
    expect(closingServerSide.readyState).toBe(closingServerSide.CLOSING);

    expect(() => broadcaster.broadcast(created)).not.toThrow();

    expect(closingSend).not.toHaveBeenCalled();
    expect(healthySend).toHaveBeenCalledTimes(1);
    await waitFor(() => healthy.messages.length === 1);
    expect(closing.messages).toEqual([]);
  });
});

describe('WebSocketBroadcaster client pruning', () => {
  it('removes a client from the Set when it disconnects', async () => {
    const leaving = await open();
    const staying = await open();
    await waitFor(() => clientSet().size === 2);

    leaving.socket.close();
    await waitFor(() => clientSet().size === 1);

    broadcaster.broadcast(created);
    await waitFor(() => staying.messages.length === 1);

    expect(staying.messages).toEqual([created]);
    expect(leaving.messages).toEqual([]);
  });

  it('removes a client that vanishes without a close handshake', async () => {
    const dropped = await open();
    const staying = await open();
    await waitFor(() => clientSet().size === 2);

    dropped.socket.terminate();
    await waitFor(() => clientSet().size === 1);

    expect(() => broadcaster.broadcast(created)).not.toThrow();
    await waitFor(() => staying.messages.length === 1);
  });

  it('survives and prunes a client whose socket errors (protocol violation)', async () => {
    const bad = await open();
    const staying = await open();
    await waitFor(() => clientSet().size === 2);

    // Masked text frame with RSV1 set: the server has no permessage-deflate, so
    // its receiver raises an 'error' on the server-side socket. With no listener
    // that is an unhandled event and crashes the process (retro #19).
    const raw = (bad.socket as unknown as { _socket: import('node:net').Socket })._socket;
    raw.write(Buffer.from([0xc1, 0x80, 0x00, 0x00, 0x00, 0x00]));

    await waitFor(() => clientSet().size === 1);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'WebSocket client error',
    );

    broadcaster.broadcast(created);
    await waitFor(() => staying.messages.length === 1);
    expect(staying.messages).toEqual([created]);
  });

  it('keeps serving new clients after others have been pruned', async () => {
    const first = await open();
    await waitFor(() => clientSet().size === 1);
    first.socket.close();
    await waitFor(() => clientSet().size === 0);

    const second = await open();
    await waitFor(() => clientSet().size === 1);
    broadcaster.broadcast(created);
    await waitFor(() => second.messages.length === 1);

    expect(second.messages).toEqual([created]);
  });
});

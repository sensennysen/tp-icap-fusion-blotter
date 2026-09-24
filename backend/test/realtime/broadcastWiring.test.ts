import { createServer, type Server } from 'node:http';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@fusion-blotter/shared';
import { createApp } from '../../src/app.js';
import { logger } from '../../src/lib/logger.js';
import { WebSocketBroadcaster } from '../../src/realtime/webSocketBroadcaster.js';
import { tradeRepository } from '../../src/repositories/tradeRepository.js';
import { TradeService } from '../../src/services/tradeService.js';
import { connect, listen, shutdown, waitFor, type TestClient } from './helpers.js';
import { sessionCookie } from '../helpers/auth.js';

// Re-creates the wiring in server.ts (server.ts itself listens on import, so it
// cannot be loaded in a test): one http.Server carries Express AND the
// WebSocketBroadcaster, and TradeService broadcasts after each mutation. The
// repository is mocked, so this needs no DB; everything else is real.
vi.mock('../../src/repositories/tradeRepository.js', () => ({
  tradeRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    nextTradeId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));
const repo = vi.mocked(tradeRepository);

const trade: Trade = {
  id: '00000000-0000-4000-8000-000000000001',
  tradeId: 'TRD-100001',
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
const amended: Trade = { ...trade, quantity: 250 };
const cancelled: Trade = { ...trade, status: 'CANCELLED' };

const createBody = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

let server: Server;
let broadcaster: WebSocketBroadcaster;
let baseUrl: string;
let client: TestClient;

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: sessionCookie() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// pino-http needs a real pino instance, so silence it rather than mock it.
beforeAll(() => {
  logger.level = 'silent';
});

beforeEach(async () => {
  vi.resetAllMocks();
  server = createServer();
  broadcaster = new WebSocketBroadcaster(server);
  server.on('request', createApp(new TradeService(broadcaster)));
  const port = await listen(server);
  baseUrl = `http://127.0.0.1:${port}`;
  client = await connect(port);
});

afterEach(async () => {
  await shutdown(server, [client], () => broadcaster.close());
});

describe('one port serves HTTP and WebSocket', () => {
  it('answers GET /health on the port the WebSocket is connected to', async () => {
    const res = await send('GET', '/health');

    expect(res.status).toBe(200);
    expect(client.socket.readyState).toBe(client.socket.OPEN);
  });
});

describe('TradeService mutations reach WebSocket clients', () => {
  it('pushes TRADE_CREATED after POST /api/trades', async () => {
    repo.nextTradeId.mockResolvedValue('TRD-100001');
    repo.create.mockResolvedValue(trade);

    const res = await send('POST', '/api/trades', createBody);

    expect(res.status).toBe(201);
    await waitFor(() => client.messages.length === 1);
    expect(client.messages).toEqual([{ type: 'TRADE_CREATED', payload: trade }]);
  });

  it('pushes TRADE_AMENDED after PATCH /api/trades/:id', async () => {
    repo.findById.mockResolvedValue(trade);
    repo.update.mockResolvedValue(amended);

    const res = await send('PATCH', '/api/trades/TRD-100001', { quantity: 250 });

    expect(res.status).toBe(200);
    await waitFor(() => client.messages.length === 1);
    expect(client.messages).toEqual([{ type: 'TRADE_AMENDED', payload: amended }]);
  });

  it('pushes TRADE_CANCELLED after POST /api/trades/:id/cancel', async () => {
    repo.findById.mockResolvedValue(trade);
    repo.cancel.mockResolvedValue(cancelled);

    const res = await send('POST', '/api/trades/TRD-100001/cancel');

    expect(res.status).toBe(200);
    await waitFor(() => client.messages.length === 1);
    expect(client.messages).toEqual([{ type: 'TRADE_CANCELLED', payload: cancelled }]);
  });

  it('fans one mutation out to every connected client', async () => {
    const second = await connect(Number(new URL(baseUrl).port));
    await waitFor(() => (broadcaster as unknown as { clients: Set<unknown> }).clients.size === 2);
    repo.findById.mockResolvedValue(trade);
    repo.cancel.mockResolvedValue(cancelled);

    await send('POST', '/api/trades/TRD-100001/cancel');

    await waitFor(() => client.messages.length === 1 && second.messages.length === 1);
    expect(second.messages).toEqual(client.messages);
    second.socket.terminate();
  });
});

describe('failed mutations do not broadcast', () => {
  // Each case ends with a successful create; if the failed call had broadcast,
  // its frame would arrive first and the assertion on messages[0] would fail.
  const thenSucceed = async () => {
    repo.nextTradeId.mockResolvedValue('TRD-100001');
    repo.create.mockResolvedValue(trade);
    await send('POST', '/api/trades', createBody);
    await waitFor(() => client.messages.length >= 1);
    expect(client.messages).toEqual([{ type: 'TRADE_CREATED', payload: trade }]);
  };

  it('stays silent when amending an unknown trade (404)', async () => {
    repo.findById.mockResolvedValue(null);

    const res = await send('PATCH', '/api/trades/TRD-NOPE', { quantity: 250 });

    expect(res.status).toBe(404);
    await thenSucceed();
  });

  it('stays silent when amending a cancelled trade (409)', async () => {
    repo.findById.mockResolvedValue(cancelled);

    const res = await send('PATCH', '/api/trades/TRD-100001', { quantity: 250 });

    expect(res.status).toBe(409);
    await thenSucceed();
  });

  it('stays silent when the payload fails validation (400)', async () => {
    const res = await send('POST', '/api/trades', { ...createBody, quantity: -1 });

    expect(res.status).toBe(400);
    await thenSucceed();
  });
});

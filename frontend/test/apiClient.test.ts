import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  AmendTradeInput,
  CreateTradeInput,
  Trade,
  TradeListQuery,
} from '@fusion-blotter/shared';

const BASE = 'http://api.test/api';

type ApiClientModule = typeof import('../src/lib/apiClient.js');

const trade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-1',
  counterparty: 'GS',
  tradeTimestamp: '2026-09-24T09:00:00.000Z',
  status: 'ACTIVE',
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
};

const createInput: CreateTradeInput = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-1',
  counterparty: 'GS',
};

let fetchMock: ReturnType<typeof vi.fn>;
let apiClient: ApiClientModule['apiClient'];
let ApiError: ApiClientModule['ApiError'];

function respond(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  fetchMock.mockResolvedValueOnce(new Response(text, { status }));
}

function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  return call as [string, RequestInit];
}

async function caught(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_API_BASE_URL', BASE);
  vi.resetModules();
  ({ apiClient, ApiError } = await import('../src/lib/apiClient.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('request shape', () => {
  it('listTrades GETs /trades with no query string when no filters are set', async () => {
    respond(200, { data: [trade] });
    await apiClient.listTrades();
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/trades`);
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('getTrade GETs /trades/:id', async () => {
    respond(200, { data: trade });
    await apiClient.getTrade('trade-1');
    expect(lastCall()[0]).toBe(`${BASE}/trades/trade-1`);
    expect(lastCall()[1].method).toBeUndefined();
  });

  it('createTrade POSTs the exact input as JSON', async () => {
    respond(201, { data: trade });
    await apiClient.createTrade(createInput);
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/trades`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(createInput);
  });

  it('amendTrade PATCHes /trades/:id with only the amended fields', async () => {
    respond(200, { data: trade });
    await apiClient.amendTrade('trade-1', { price: 190 });
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/trades/trade-1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ price: 190 });
  });

  it('cancelTrade POSTs /trades/:id/cancel with no body', async () => {
    respond(200, { data: { ...trade, status: 'CANCELLED' } });
    await apiClient.cancelTrade('trade-1');
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/trades/trade-1/cancel`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('sends Content-Type: application/json on every call', async () => {
    respond(200, { data: [] });
    await apiClient.listTrades();
    expect(lastCall()[1].headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});

describe('list query string', () => {
  it('serializes every filter and sort option', async () => {
    respond(200, { data: [] });
    const query: TradeListQuery = {
      symbol: 'AAPL',
      trader: 'jdoe',
      side: 'SELL',
      status: 'CANCELLED',
      sort: 'price',
      order: 'desc',
    };
    await apiClient.listTrades(query);
    const url = new URL(lastCall()[0]);
    expect(url.pathname).toBe('/api/trades');
    expect(Object.fromEntries(url.searchParams)).toEqual(query);
  });

  it('omits undefined values', async () => {
    respond(200, { data: [] });
    await apiClient.listTrades({ symbol: 'AAPL', trader: undefined });
    expect(lastCall()[0]).toBe(`${BASE}/trades?symbol=AAPL`);
  });

  it('omits the ? entirely when every value is undefined', async () => {
    respond(200, { data: [] });
    await apiClient.listTrades({ symbol: undefined });
    expect(lastCall()[0]).toBe(`${BASE}/trades`);
  });

  it('encodes special characters in values', async () => {
    respond(200, { data: [] });
    await apiClient.listTrades({ symbol: 'A&B=C d' });
    const url = new URL(lastCall()[0]);
    expect(url.searchParams.get('symbol')).toBe('A&B=C d');
    expect([...url.searchParams.keys()]).toEqual(['symbol']);
  });
});

describe('path ids', () => {
  it.each([
    ['getTrade', (id: string) => apiClient.getTrade(id), ''],
    ['amendTrade', (id: string) => apiClient.amendTrade(id, { price: 1 }), ''],
    ['cancelTrade', (id: string) => apiClient.cancelTrade(id), '/cancel'],
  ])('%s encodes the id so it cannot alter the path', async (_name, call, suffix) => {
    respond(200, { data: trade });
    await call('a/b?c#d');
    expect(lastCall()[0]).toBe(`${BASE}/trades/a%2Fb%3Fc%23d${suffix}`);
  });
});

describe('success responses', () => {
  it('unwraps the data envelope', async () => {
    respond(200, { data: [trade] });
    expect(await apiClient.listTrades()).toEqual([trade]);
  });

  it('accepts the 201 from createTrade', async () => {
    respond(201, { data: trade });
    expect(await apiClient.createTrade(createInput)).toEqual(trade);
  });
});

describe('ApiError mapping', () => {
  it('keeps status, code, message and fields from a 400', async () => {
    const fields = { symbol: 'symbol is required', price: 'price must be positive' };
    respond(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload', fields },
    });
    const err = await caught(apiClient.createTrade(createInput));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      fields,
    });
  });

  it.each([
    [404, 'NOT_FOUND', 'Trade not found'],
    [409, 'CONFLICT', 'Trade is already cancelled'],
  ])('keeps status and code from a %i', async (status, code, message) => {
    respond(status, { error: { code, message } });
    const err = await caught(apiClient.cancelTrade('trade-1'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status, code, message });
    expect((err as InstanceType<typeof ApiError>).fields).toBeUndefined();
  });

  it('maps a 500 envelope without fields', async () => {
    respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    const err = await caught(apiClient.listTrades());
    expect(err).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('throws on non-2xx even when the body also has a data key', async () => {
    respond(409, { data: trade, error: { code: 'CONFLICT', message: 'nope' } });
    await expect(apiClient.amendTrade('trade-1', { price: 1 })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('failures that are not the server error envelope', () => {
  it('maps a non-JSON error body (proxy HTML) to HTTP_ERROR with the status', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const err = await caught(apiClient.listTrades());
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_ERROR', message: 'Bad Gateway' });
  });

  it('maps an empty error body to HTTP_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const err = await caught(apiClient.listTrades());
    expect(err).toMatchObject({ status: 503, code: 'HTTP_ERROR', message: 'Request failed' });
  });

  it.each([
    ['JSON without an error key', { message: 'oops' }],
    ['a non-object error', { error: 'oops' }],
    ['a null error', { error: null }],
    ['an error missing code', { error: { message: 'oops' } }],
    ['an error missing message', { error: { code: 'X' } }],
    ['a null body', null],
  ])('maps %s to HTTP_ERROR', async (_name, body) => {
    respond(500, body);
    const err = await caught(apiClient.listTrades());
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500, code: 'HTTP_ERROR' });
  });

  it('maps a rejected fetch to NETWORK_ERROR with status 0 and the cause', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValueOnce(cause);
    const err = await caught(apiClient.listTrades());
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect((err as Error).cause).toBe(cause);
  });
});

describe('types', () => {
  it('types every method against the shared shapes', () => {
    expectTypeOf(apiClient.listTrades).parameter(0).toEqualTypeOf<TradeListQuery | undefined>();
    expectTypeOf(apiClient.listTrades).returns.resolves.toEqualTypeOf<Trade[]>();
    expectTypeOf(apiClient.getTrade).returns.resolves.toEqualTypeOf<Trade>();
    expectTypeOf(apiClient.createTrade).parameter(0).toEqualTypeOf<CreateTradeInput>();
    expectTypeOf(apiClient.createTrade).returns.resolves.toEqualTypeOf<Trade>();
    expectTypeOf(apiClient.amendTrade).parameter(1).toEqualTypeOf<AmendTradeInput>();
    expectTypeOf(apiClient.amendTrade).returns.resolves.toEqualTypeOf<Trade>();
    expectTypeOf(apiClient.cancelTrade).returns.resolves.toEqualTypeOf<Trade>();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { NotFoundError } from '../src/lib/errors.js';
import { logger } from '../src/lib/logger.js';
import type { TradeService } from '../src/services/tradeService.js';
import { sessionCookie } from './helpers/auth.js';

// createApp with a stub service: proves the middleware wiring and that each route
// delegates to the service, with no DB and no sockets.
const service = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  amend: vi.fn(),
  cancel: vi.fn(),
};
const app = createApp(service as unknown as TradeService);

const validPayload = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

const HOSTILE_ORIGIN = 'http://evil.example';

const TRADER = sessionCookie({ username: 'asmith' });

let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  service.list.mockResolvedValue([]);
  service.create.mockResolvedValue({ id: 'c1' });
  service.getById.mockResolvedValue({ id: 't1' });
  service.amend.mockResolvedValue({ id: 't1' });
  service.cancel.mockResolvedValue({ id: 't1' });
  logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CORS', () => {
  it('answers with the configured origin, never a wildcard or the caller origin', async () => {
    const res = await request(app).get('/api/trades').set('Origin', HOSTILE_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(env.CORS_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
    expect(res.headers['access-control-allow-origin']).not.toBe(HOSTILE_ORIGIN);
  });

  it('answers a preflight from the configured origin without reaching the service', async () => {
    const res = await request(app)
      .options('/api/trades')
      .set('Origin', env.CORS_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(env.CORS_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(service.create).not.toHaveBeenCalled();
  });

  // The frontend is a different origin, so the session cookie only travels
  // when the server allows credentials.
  it('allows credentials for the configured origin only', async () => {
    const allowed = await request(app).get('/api/trades').set('Origin', env.CORS_ORIGIN);
    const hostile = await request(app).get('/api/trades').set('Origin', HOSTILE_ORIGIN);

    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(hostile.headers['access-control-allow-origin']).not.toBe(HOSTILE_ORIGIN);
  });
});

describe('mock auth on mutations', () => {
  const mutations = [
    ['POST /trades', () => request(app).post('/api/trades').send(validPayload)],
    ['PATCH /trades/:id', () => request(app).patch('/api/trades/t1').send({ quantity: 5 })],
    ['POST /trades/:id/cancel', () => request(app).post('/api/trades/t1/cancel')],
  ] as const;

  it.each(mutations)('%s without a session returns 401 and skips the service', async (_, call) => {
    const res = await call();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(service.create).not.toHaveBeenCalled();
    expect(service.amend).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it.each(mutations)('%s as a viewer returns 403 and skips the service', async (_, call) => {
    const res = await call().set('Cookie', sessionCookie({ role: 'viewer' }));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(service.create).not.toHaveBeenCalled();
    expect(service.amend).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('treats a tampered session cookie as no session (401)', async () => {
    const res = await request(app)
      .post('/api/trades/t1/cancel')
      .set('Cookie', 'fusion_session=not-base64-json');

    expect(res.status).toBe(401);
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('keeps reads public', async () => {
    const res = await request(app).get('/api/trades');

    expect(res.status).toBe(200);
  });
});

describe('helmet', () => {
  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/trades');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('JSON body limit (100kb)', () => {
  it('accepts a body just under the limit', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', TRADER)
      .send({ ...validPayload, counterparty: 'X'.repeat(90 * 1024) });

    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  // Characterization, not endorsed: body-parser raises PayloadTooLargeError (413), which
  // falls into errorHandler's unhandled branch. ARCH §8 has no 413, so mapping it is a
  // spec decision (retro #28). Flip this to 413 PAYLOAD_TOO_LARGE once that is decided.
  it('rejects a body over the limit before the service runs (currently 500)', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', TRADER)
      .send({ ...validPayload, counterparty: 'X'.repeat(101 * 1024) });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(service.create).not.toHaveBeenCalled();
  });
});

describe('request logging', () => {
  it('logs each request through pino, not console.log', async () => {
    const completed: unknown[] = [];
    const realChild = logger.child.bind(logger);
    // pino-http logs on a per-request child logger, so observe the children. Record only:
    // passing through makes pino dump the raw req/res objects into the test output.
    vi.spyOn(logger, 'child').mockImplementation(((...args: Parameters<typeof logger.child>) => {
      const child = realChild(...args);
      child.info = ((...a: unknown[]) => {
        completed.push(a[1]);
      }) as never;
      return child;
    }) as never);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await request(app).get('/api/trades');

    expect(completed).toEqual(['request completed']);
    expect(consoleLog).not.toHaveBeenCalled();
  });
});

describe('middleware order', () => {
  it('routes service errors through errorHandler as a JSON envelope', async () => {
    service.getById.mockRejectedValue(new NotFoundError('Trade nope not found'));

    const res = await request(app).get('/api/trades/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Trade nope not found' } });
    expect(logError).not.toHaveBeenCalled();
  });

  // Unknown /api paths fall through to Express's default HTML 404, not the JSON envelope.
  // Whether to add an envelope 404 is a spec decision.
  it.todo('returns the JSON error envelope for an unknown /api path');
});

describe('route delegation', () => {
  it('GET /trades passes the parsed query to service.list', async () => {
    service.list.mockResolvedValue([{ id: 't1' }]);

    const res = await request(app).get('/api/trades?symbol=%20AAPL%20&sort=price&order=asc');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ id: 't1' }] });
    expect(service.list).toHaveBeenCalledWith({ symbol: 'AAPL', sort: 'price', order: 'asc' });
  });

  it('GET /trades/:id passes the id to service.getById', async () => {
    const res = await request(app).get('/api/trades/t1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 't1' } });
    expect(service.getById).toHaveBeenCalledWith('t1');
  });

  it('POST /trades passes the parsed body to service.create and returns 201', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', TRADER)
      .send({ ...validPayload, symbol: '  AAPL  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: 'c1' } });
    expect(service.create).toHaveBeenCalledWith(validPayload);
  });

  it('PATCH /trades/:id passes the id and parsed body to service.amend', async () => {
    const res = await request(app)
      .patch('/api/trades/t1')
      .set('Cookie', TRADER)
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 't1' } });
    expect(service.amend).toHaveBeenCalledWith('t1', { quantity: 5 }, 'asmith');
  });

  it('POST /trades/:id/cancel passes the id to service.cancel', async () => {
    const res = await request(app).post('/api/trades/t1/cancel').set('Cookie', TRADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: 't1' } });
    expect(service.cancel).toHaveBeenCalledWith('t1', 'asmith');
  });

  it('never calls the service when validation fails', async () => {
    const responses = await Promise.all([
      request(app).get('/api/trades?side=HOLD'),
      request(app)
        .post('/api/trades')
        .set('Cookie', TRADER)
        .send({ ...validPayload, quantity: -1 }),
      request(app).patch('/api/trades/t1').set('Cookie', TRADER).send({ price: -5 }),
    ]);

    expect(responses.map((r) => r.status)).toEqual([400, 400, 400]);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
    expect(service.amend).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.ts';
import { createApp } from '../../src/app.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/lib/errors.js';
import { logger } from '../../src/lib/logger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import type { TradeService } from '../../src/services/tradeService.js';
import { sessionCookie } from '../helpers/auth.js';

const INTERNAL_BODY = {
  error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
};

const service = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  amend: vi.fn(),
  cancel: vi.fn(),
};
const app = createApp(service as unknown as TradeService);

// Minimal app for errors the real routes cannot be made to throw (root-level
// ZodErrors, non-Error values). errorHandler is mounted last, as in app.ts.
function appThrowing(err: unknown) {
  const mini = express();
  mini.get('/boom', (_req, _res, next) => next(err));
  mini.use(errorHandler);
  return mini;
}

const validPayload = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

describe('errorHandler: ZodError -> 400 VALIDATION_ERROR', () => {
  it('maps a bad create payload to per-field messages', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', sessionCookie())
      .send({ ...validPayload, quantity: -1, price: 0, symbol: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Invalid request payload');
    expect(res.body.error.fields).toEqual({
      symbol: 'symbol is required',
      quantity: 'quantity must be positive',
      price: 'price must be positive',
    });
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(service.create).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('reports every missing field, not just the first', async () => {
    const res = await request(app).post('/api/trades').set('Cookie', sessionCookie()).send({});

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual([
      'book',
      'counterparty',
      'price',
      'quantity',
      'side',
      'symbol',
      'trader',
    ]);
  });

  it('maps a bad list query to 400 without touching the service', async () => {
    const res = await request(app).get('/api/trades?side=HOLD');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('side');
    expect(service.list).not.toHaveBeenCalled();
  });

  it('keys a root-level issue (empty path) as "_"', async () => {
    const result = z.string().safeParse(5);
    if (result.success) throw new Error('expected parse failure');

    const res = await request(appThrowing(result.error)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ _: expect.any(String) });
  });

  it('joins nested paths with dots', async () => {
    const result = z.object({ a: z.object({ b: z.number() }) }).safeParse({ a: { b: 'x' } });
    if (result.success) throw new Error('expected parse failure');

    const res = await request(appThrowing(result.error)).get('/boom');

    expect(Object.keys(res.body.error.fields)).toEqual(['a.b']);
  });

  it('keeps only the last message when two issues share a path (current behaviour)', async () => {
    const result = z.object({ a: z.string().min(3, 'too short').regex(/x/, 'needs x') }).safeParse({
      a: 'a',
    });
    if (result.success) throw new Error('expected parse failure');
    expect(result.error.issues).toHaveLength(2);

    const res = await request(appThrowing(result.error)).get('/boom');

    // Characterization, not endorsement: 'too short' is silently dropped.
    expect(res.body.error.fields).toEqual({ a: 'needs x' });
  });
});

describe('errorHandler: AppError subclasses -> own status and code', () => {
  it.each([
    ['ValidationError', new ValidationError('bad'), 400, 'VALIDATION_ERROR'],
    ['NotFoundError', new NotFoundError('gone'), 404, 'NOT_FOUND'],
    ['ConflictError', new ConflictError('clash'), 409, 'CONFLICT'],
    ['UnauthorizedError', new UnauthorizedError('who are you'), 401, 'UNAUTHORIZED'],
    ['ForbiddenError', new ForbiddenError('not you'), 403, 'FORBIDDEN'],
    ['AppError', new AppError(418, 'TEAPOT', 'short and stout'), 418, 'TEAPOT'],
  ])('%s', async (_name, err, status, code) => {
    const res = await request(appThrowing(err)).get('/boom');

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: err.message } });
    expect(logError).not.toHaveBeenCalled();
  });

  it('includes fields when the error carries them', async () => {
    const err = new ValidationError('bad', { quantity: 'must be positive' });

    const res = await request(appThrowing(err)).get('/boom');

    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad', fields: { quantity: 'must be positive' } },
    });
  });

  it('omits the fields key entirely when the error has none', async () => {
    const res = await request(appThrowing(new NotFoundError('gone'))).get('/boom');

    expect(res.body.error).not.toHaveProperty('fields');
  });
});

describe('errorHandler: Prisma unique-constraint violation -> 409 CONFLICT', () => {
  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed on tradeId', {
      code,
      clientVersion: Prisma.prismaVersion.client,
    });

  it('maps P2002 to a 409 envelope without leaking the Prisma message', async () => {
    const res = await request(appThrowing(prismaError('P2002'))).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'CONFLICT', message: 'A trade with the same unique value already exists' },
    });
    expect(res.text).not.toContain('tradeId');
    expect(logError).not.toHaveBeenCalled();
  });

  it('still treats other Prisma errors as a logged 500', async () => {
    const res = await request(appThrowing(prismaError('P2025'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe('errorHandler: unexpected errors -> logged 500, nothing leaked', () => {
  it('returns the generic envelope and logs the original error once', async () => {
    const boom = new Error('connection string postgres://user:hunter2@db/prod exploded');

    const res = await request(appThrowing(boom)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(res.text).not.toContain('hunter2');
    expect(res.text).not.toContain('exploded');
    expect(res.text).not.toContain('stack');
    expect(logError).toHaveBeenCalledExactlyOnceWith({ err: boom }, 'Unhandled error');
  });

  it.each([
    ['a string', 'plain string'],
    ['a plain object', { message: 'secret', statusCode: 401 }],
  ])('handles %s being thrown', async (_name, thrown) => {
    const res = await request(appThrowing(thrown)).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(res.text).not.toContain('secret');
    expect(logError).toHaveBeenCalledExactlyOnceWith({ err: thrown }, 'Unhandled error');
  });

  it('does not treat a lookalike object with a statusCode as an AppError', async () => {
    const res = await request(
      appThrowing({ statusCode: 404, code: 'NOT_FOUND', message: 'x' }),
    ).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
  });

  it.todo(
    // Fix location: errorHandler.ts, `if (res.headersSent) return next(err)` before any branch.
    'delegates to Express when headers were already sent instead of throwing ERR_HTTP_HEADERS_SENT',
  );
});

describe('errorHandler: wired through createApp (real middleware order)', () => {
  it('turns a service NotFoundError into a 404 envelope', async () => {
    service.getById.mockRejectedValue(new NotFoundError('Trade x not found'));

    const res = await request(app).get('/api/trades/x');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Trade x not found' } });
  });

  it('turns a service ConflictError into a 409 envelope', async () => {
    service.cancel.mockRejectedValue(new ConflictError('already cancelled'));

    const res = await request(app).post('/api/trades/x/cancel').set('Cookie', sessionCookie());

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'already cancelled' } });
  });

  it('turns an unexpected service failure into a generic 500 and logs it', async () => {
    const boom = new Error('prisma exploded: P1001');
    service.list.mockRejectedValue(boom);

    const res = await request(app).get('/api/trades');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_BODY);
    expect(res.text).not.toContain('prisma');
    expect(logError).toHaveBeenCalledExactlyOnceWith({ err: boom }, 'Unhandled error');
  });

  it('returns a 400 envelope for a malformed JSON body, not a 500', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', sessionCookie())
      .set('Content-Type', 'application/json')
      .send('{"symbol": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON in request body' },
    });
    expect(res.text).not.toContain('symbol');
    expect(service.create).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('still returns a 201-path success without the handler interfering', async () => {
    service.create.mockResolvedValue({ id: '1', ...validPayload });

    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', sessionCookie())
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(logError).not.toHaveBeenCalled();
  });
});

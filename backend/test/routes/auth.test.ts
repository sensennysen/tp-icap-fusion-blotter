import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { logger } from '../../src/lib/logger.js';
import { SESSION_COOKIE } from '../../src/middleware/auth.js';
import type { TradeService } from '../../src/services/tradeService.js';
import { sessionCookie } from '../helpers/auth.js';

// The auth routes never touch the trade service.
const app = createApp({} as TradeService);

beforeAll(() => {
  logger.level = 'silent';
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setCookieHeader(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  expect(header).toHaveLength(1);
  return header![0]!;
}

describe('POST /api/auth/login', () => {
  it('sets an HttpOnly, SameSite=Lax session cookie and returns the user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '  asmith ', role: 'trader' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { username: 'asmith', role: 'trader' } });
    const cookie = setCookieHeader(res);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('issues a cookie that /me and mutations accept', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'asmith', role: 'viewer' }).expect(200);

    const me = await agent.get('/api/auth/me');

    expect(me.status).toBe(200);
    expect(me.body).toEqual({ data: { username: 'asmith', role: 'viewer' } });
  });

  it('rejects an invalid body with field errors and sets no cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['role', 'username']);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  // Captures at pino's destination, i.e. after serializers and redaction run.
  it('keeps the session cookie out of request logs', async () => {
    const lines: string[] = [];
    const stream = (logger as unknown as Record<symbol, { write: (line: string) => boolean }>)[
      pino.symbols.streamSym
    ]!;
    vi.spyOn(stream, 'write').mockImplementation((line: string) => {
      lines.push(line);
      return true;
    });
    logger.level = 'info';

    try {
      await request(app).post('/api/auth/login').send({ username: 'asmith', role: 'trader' });
      await request(app).get('/api/auth/me').set('Cookie', sessionCookie());
    } finally {
      logger.level = 'silent';
    }

    const logged = lines.filter((line) => line.includes('request completed'));
    expect(logged).toHaveLength(2);
    expect(logged.join('')).toContain('[Redacted]');
    for (const line of logged) expect(line).not.toContain(`${SESSION_COOKIE}=`);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the session user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie({ username: 'bjones' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { username: 'bjones', role: 'trader' } });
  });

  it('returns 401 in the error envelope without a session', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie with matching attributes', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', sessionCookie());

    expect(res.status).toBe(204);
    const cookie = setCookieHeader(res);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('Path=/');
  });

  it('ends the session for an agent that logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'asmith', role: 'trader' }).expect(200);
    await agent.post('/api/auth/logout').expect(204);

    const me = await agent.get('/api/auth/me');

    expect(me.status).toBe(401);
  });
});

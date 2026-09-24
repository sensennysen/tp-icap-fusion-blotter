import { afterAll, afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { TradeService } from '../../src/services/tradeService.js';
import { prisma } from '../../src/lib/prisma.js';
import { sessionCookie } from '../helpers/auth.js';

const broadcaster = { broadcast: () => undefined } as never;
const app = createApp(new TradeService(broadcaster));

// Mutations require a trader session; the username is what audit rows record.
const TRADER = sessionCookie({ username: 'asmith' });

// POST /trades generates tradeId itself (TRD-<n>), so rows can't carry a test prefix.
// Track the ids this file creates and delete only those, so the seeded dev DB survives.
const created: string[] = [];

// Distinctive symbols keep filter/sort assertions narrowed to this file's rows.
const samplePayload = {
  symbol: 'ZZROUTE',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

async function createTrade(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/trades')
    .set('Cookie', TRADER)
    .send({ ...samplePayload, ...overrides });
  // Track before asserting, so a failed assertion can't leak the row.
  if (res.body.data?.id) created.push(res.body.data.id);
  expect(res.status).toBe(201);
  return res.body.data as { id: string; tradeId: string; status: string };
}

afterEach(async () => {
  await prisma.trade.deleteMany({ where: { id: { in: created.splice(0) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/trades', () => {
  it('creates a trade and returns it in a data envelope', async () => {
    const res = await request(app).post('/api/trades').set('Cookie', TRADER).send(samplePayload);
    if (res.body.data?.id) created.push(res.body.data.id);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ ...samplePayload, status: 'ACTIVE' });
    expect(res.body.data.tradeId).toMatch(/^TRD-\d+$/);
    expect(res.body.data.id).toEqual(expect.any(String));
  });

  it('rejects an invalid payload with a VALIDATION_ERROR envelope and persists nothing', async () => {
    const before = await prisma.trade.count();
    const res = await request(app)
      .post('/api/trades')
      .set('Cookie', TRADER)
      .send({ ...samplePayload, quantity: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual({ quantity: 'quantity must be positive' });
    expect(await prisma.trade.count()).toBe(before);
  });

  it('gives concurrent creates distinct tradeIds, all 201', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/trades').set('Cookie', TRADER).send(samplePayload),
      ),
    );
    for (const res of responses) if (res.body.data?.id) created.push(res.body.data.id);

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(new Set(responses.map((r) => r.body.data.tradeId)).size).toBe(10);
  });
});

describe('GET /api/trades', () => {
  it('lists created trades', async () => {
    const trade = await createTrade();
    const res = await request(app).get('/api/trades?symbol=ZZROUTE');

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([trade.id]);
  });

  it('filters by symbol', async () => {
    const a = await createTrade();
    await createTrade({ symbol: 'ZZOTHER' });
    const res = await request(app).get('/api/trades?symbol=ZZOTHER');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].symbol).toBe('ZZOTHER');
    expect(res.body.data[0].id).not.toBe(a.id);
  });

  it('sorts by the requested column and order', async () => {
    await createTrade({ price: 20 });
    await createTrade({ price: 10 });
    await createTrade({ price: 30 });

    const asc = await request(app).get('/api/trades?symbol=ZZROUTE&sort=price&order=asc');
    const desc = await request(app).get('/api/trades?symbol=ZZROUTE&sort=price&order=desc');

    expect(asc.body.data.map((t: { price: number }) => t.price)).toEqual([10, 20, 30]);
    expect(desc.body.data.map((t: { price: number }) => t.price)).toEqual([30, 20, 10]);
  });

  it('rejects an invalid query with a VALIDATION_ERROR envelope', async () => {
    const res = await request(app).get('/api/trades?side=HOLD');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('side');
  });
});

describe('GET /api/trades/:id', () => {
  it('returns the trade in a data envelope', async () => {
    const trade = await createTrade();
    const res = await request(app).get(`/api/trades/${trade.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: trade.id,
      tradeId: trade.tradeId,
      symbol: 'ZZROUTE',
    });
  });

  it('returns 404 for a missing trade', async () => {
    const res = await request(app).get('/api/trades/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/trades/:id', () => {
  it('amends a trade and persists the change', async () => {
    const trade = await createTrade();
    const res = await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', TRADER)
      .send({ quantity: 250 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: trade.id, quantity: 250, symbol: 'ZZROUTE' });

    const fetched = await request(app).get(`/api/trades/${trade.id}`);
    expect(fetched.body.data.quantity).toBe(250);
  });

  it('rejects an invalid field with a VALIDATION_ERROR envelope and leaves the trade unchanged', async () => {
    const trade = await createTrade();
    const res = await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', TRADER)
      .send({ price: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual({ price: 'price must be positive' });

    const fetched = await request(app).get(`/api/trades/${trade.id}`);
    expect(fetched.body.data.price).toBe(189.5);
  });

  it('rejects amending a cancelled trade with 409', async () => {
    const trade = await createTrade();
    await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER);

    const res = await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', TRADER)
      .send({ quantity: 200 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for a missing trade', async () => {
    const res = await request(app)
      .patch('/api/trades/does-not-exist')
      .set('Cookie', TRADER)
      .send({ quantity: 200 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/trades/:id/cancel', () => {
  it('cancels a trade then rejects a second cancel with 409', async () => {
    const trade = await createTrade();

    const first = await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('CANCELLED');

    const second = await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for a missing trade', async () => {
    const res = await request(app).post('/api/trades/does-not-exist/cancel').set('Cookie', TRADER);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/trades/:id/audit', () => {
  it('returns an empty history for a trade that has not been changed', async () => {
    const trade = await createTrade();

    const res = await request(app).get(`/api/trades/${trade.id}/audit`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns one entry per amend/cancel, oldest first, excluding rejected writes', async () => {
    const trade = await createTrade();
    await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', TRADER)
      .send({ quantity: 250 })
      .expect(200);
    await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER).expect(200);
    await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER).expect(409);
    await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', TRADER)
      .send({ quantity: 300 })
      .expect(409);

    const res = await request(app).get(`/api/trades/${trade.id}/audit`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: expect.any(String),
        tradeId: trade.id,
        changedFields: { quantity: { from: 100, to: 250 } },
        changedAt: expect.any(String),
        changedBy: 'asmith',
      },
      {
        id: expect.any(String),
        tradeId: trade.id,
        changedFields: { status: { from: 'ACTIVE', to: 'CANCELLED' } },
        changedAt: expect.any(String),
        changedBy: 'asmith',
      },
    ]);
  });

  it('attributes each change to the user whose session made it', async () => {
    const trade = await createTrade();
    await request(app)
      .patch(`/api/trades/${trade.id}`)
      .set('Cookie', sessionCookie({ username: 'bjones' }))
      .send({ quantity: 250 })
      .expect(200);
    await request(app).post(`/api/trades/${trade.id}/cancel`).set('Cookie', TRADER).expect(200);

    const res = await request(app).get(`/api/trades/${trade.id}/audit`);

    expect(res.body.data.map((e: { changedBy: string }) => e.changedBy)).toEqual([
      'bjones',
      'asmith',
    ]);
  });

  it('returns 404 for a missing trade', async () => {
    const res = await request(app).get('/api/trades/does-not-exist/audit');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('mock auth on mutations', () => {
  it.each([
    ['no session', undefined, 401, 'UNAUTHORIZED'],
    ['a viewer session', sessionCookie({ role: 'viewer' }), 403, 'FORBIDDEN'],
  ])('with %s, rejects every mutation and writes nothing', async (_, cookie, status, code) => {
    const trade = await createTrade();
    const before = await prisma.trade.count();
    const withCookie = (req: request.Test) => (cookie ? req.set('Cookie', cookie) : req);

    const responses = await Promise.all([
      withCookie(request(app).post('/api/trades')).send(samplePayload),
      withCookie(request(app).patch(`/api/trades/${trade.id}`)).send({ quantity: 250 }),
      withCookie(request(app).post(`/api/trades/${trade.id}/cancel`)),
    ]);
    for (const res of responses) if (res.body.data?.id) created.push(res.body.data.id);

    expect(responses.map((r) => r.status)).toEqual([status, status, status]);
    expect(responses.map((r) => r.body.error.code)).toEqual([code, code, code]);
    expect(await prisma.trade.count()).toBe(before);
    const fetched = await request(app).get(`/api/trades/${trade.id}`);
    expect(fetched.body.data).toMatchObject({ quantity: 100, status: 'ACTIVE' });
    expect(await prisma.tradeAudit.count({ where: { tradeId: trade.id } })).toBe(0);
  });
});

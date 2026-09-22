import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { TradeService } from '../../src/services/tradeService.js';
import { prisma } from '../../src/lib/prisma.js';

const broadcaster = { broadcast: () => undefined } as never;
const app = createApp(new TradeService(broadcaster));

const samplePayload = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
};

beforeEach(async () => {
  await prisma.trade.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/trades', () => {
  it('creates a trade', async () => {
    const res = await request(app).post('/api/trades').send(samplePayload);
    expect(res.status).toBe(201);
    expect(res.body.data.tradeId).toMatch(/^TRD-\d+$/);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('rejects an invalid payload with a VALIDATION_ERROR envelope', async () => {
    const res = await request(app)
      .post('/api/trades')
      .send({ ...samplePayload, quantity: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/trades', () => {
  it('lists created trades', async () => {
    await request(app).post('/api/trades').send(samplePayload);
    const res = await request(app).get('/api/trades');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filters by symbol', async () => {
    await request(app).post('/api/trades').send(samplePayload);
    await request(app)
      .post('/api/trades')
      .send({ ...samplePayload, symbol: 'MSFT' });
    const res = await request(app).get('/api/trades?symbol=MSFT');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].symbol).toBe('MSFT');
  });
});

describe('POST /api/trades/:id/cancel', () => {
  it('cancels a trade then rejects a second cancel with 409', async () => {
    const created = await request(app).post('/api/trades').send(samplePayload);
    const id = created.body.data.id;

    const first = await request(app).post(`/api/trades/${id}/cancel`);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('CANCELLED');

    const second = await request(app).post(`/api/trades/${id}/cancel`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /api/trades/:id', () => {
  it('rejects amending a cancelled trade with 409', async () => {
    const created = await request(app).post('/api/trades').send(samplePayload);
    const id = created.body.data.id;
    await request(app).post(`/api/trades/${id}/cancel`);

    const res = await request(app).patch(`/api/trades/${id}`).send({ quantity: 200 });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/trades/:id', () => {
  it('returns 404 for a missing trade', async () => {
    const res = await request(app).get('/api/trades/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

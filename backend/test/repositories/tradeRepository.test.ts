import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TradeListQueryInput } from '@fusion-blotter/shared';
import { prisma } from '../../src/lib/prisma.js';
import { tradeRepository } from '../../src/repositories/tradeRepository.js';

// Exercises TradeRepository against a real, migrated Postgres — no mocks, no
// Zod, no TradeService. Only rows whose tradeId starts with TEST_PREFIX are
// created or deleted, and list() results are narrowed to that prefix before
// asserting, so seeded dev data can never make a test flaky.
const TEST_PREFIX = 'TEST-REPO-';

const baseRecord = (suffix: string) => ({
  tradeId: `${TEST_PREFIX}${suffix}`,
  symbol: 'AAPL',
  side: 'BUY' as const,
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
});

type SeedOverrides = Partial<ReturnType<typeof baseRecord>> & {
  status?: 'ACTIVE' | 'CANCELLED';
  tradeTimestamp?: Date;
};

// Seed via Prisma directly: CreateTradeRecord has no status/tradeTimestamp, and
// list() tests must control both.
const seed = (suffix: string, overrides: SeedOverrides = {}) =>
  prisma.trade.create({ data: { ...baseRecord(suffix), ...overrides } });

const listOwn = async (query: TradeListQueryInput = {}) =>
  (await tradeRepository.list(query)).filter((t) => t.tradeId.startsWith(TEST_PREFIX));

const ownIds = async (query: TradeListQueryInput = {}) =>
  (await listOwn(query)).map((t) => t.tradeId.slice(TEST_PREFIX.length));

const cleanup = () => prisma.trade.deleteMany({ where: { tradeId: { startsWith: TEST_PREFIX } } });

beforeEach(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('tradeRepository.list — filters', () => {
  beforeEach(async () => {
    await seed('F1', { symbol: 'REPOA', trader: 'repo-t1', side: 'BUY', status: 'ACTIVE' });
    await seed('F2', { symbol: 'REPOB', trader: 'repo-t2', side: 'SELL', status: 'ACTIVE' });
    await seed('F3', { symbol: 'REPOA', trader: 'repo-t1', side: 'SELL', status: 'CANCELLED' });
  });

  it.each<[string, TradeListQueryInput, string[]]>([
    ['symbol', { symbol: 'REPOA' }, ['F1', 'F3']],
    ['trader', { trader: 'repo-t2' }, ['F2']],
    ['side', { side: 'SELL' }, ['F2', 'F3']],
    ['status', { status: 'CANCELLED' }, ['F3']],
    [
      'all four combined',
      { symbol: 'REPOA', trader: 'repo-t1', side: 'SELL', status: 'CANCELLED' },
      ['F3'],
    ],
    ['a combination matching nothing', { symbol: 'REPOB', status: 'CANCELLED' }, []],
  ])('filters by %s', async (_label, query, expected) => {
    expect((await ownIds(query)).sort()).toEqual(expected);
  });

  it('returns every trade when no filter is given', async () => {
    expect((await ownIds()).sort()).toEqual(['F1', 'F2', 'F3']);
  });

  it('does not leak rows outside the filter', async () => {
    const rows = await tradeRepository.list({ side: 'SELL' });
    expect(rows.every((t) => t.side === 'SELL')).toBe(true);
  });
});

describe('tradeRepository.list — sorting', () => {
  // Distinct value on every sortable column so each ordering is unambiguous.
  beforeEach(async () => {
    await seed('A', {
      symbol: 'MSFT',
      trader: 'carol',
      price: 300.25,
      quantity: 50,
      tradeTimestamp: new Date('2026-01-02T10:00:00.000Z'),
    });
    await seed('B', {
      symbol: 'AAPL',
      trader: 'alice',
      price: 189.5,
      quantity: 300,
      tradeTimestamp: new Date('2026-01-03T10:00:00.000Z'),
    });
    await seed('C', {
      symbol: 'TSLA',
      trader: 'bob',
      price: 90,
      quantity: 100,
      tradeTimestamp: new Date('2026-01-01T10:00:00.000Z'),
    });
  });

  // Ascending order of ids A/B/C per sort field.
  const ascending = {
    symbol: ['B', 'A', 'C'],
    trader: ['B', 'C', 'A'],
    price: ['C', 'B', 'A'],
    quantity: ['A', 'C', 'B'],
    tradeTimestamp: ['C', 'A', 'B'],
  } as const;

  const cases = Object.entries(ascending).flatMap(([sort, asc]) => [
    [sort, 'asc', [...asc]],
    [sort, 'desc', [...asc].reverse()],
  ]) as [keyof typeof ascending, 'asc' | 'desc', string[]][];

  it.each(cases)('sorts by %s %s', async (sort, order, expected) => {
    expect(await ownIds({ sort, order })).toEqual(expected);
  });

  it('defaults to tradeTimestamp descending', async () => {
    expect(await ownIds()).toEqual(['B', 'A', 'C']);
  });

  it('defaults order to descending when only sort is given', async () => {
    expect(await ownIds({ sort: 'price' })).toEqual(['A', 'B', 'C']);
  });

  it('defaults sort to tradeTimestamp when only order is given', async () => {
    expect(await ownIds({ order: 'asc' })).toEqual(['C', 'A', 'B']);
  });
});

describe('tradeRepository.list — mapping', () => {
  it('maps a row to the shared Trade shape', async () => {
    await seed('MAP', { price: 189.5, tradeTimestamp: new Date('2026-01-02T10:00:00.000Z') });

    const [trade] = await listOwn();

    expect(trade).toEqual({
      id: expect.any(String),
      tradeId: `${TEST_PREFIX}MAP`,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 189.5,
      trader: 'jdoe',
      book: 'EQ-LON-01',
      counterparty: 'GOLDMAN',
      tradeTimestamp: '2026-01-02T10:00:00.000Z',
      status: 'ACTIVE',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
    expect(typeof trade.price).toBe('number');
  });
});

describe('tradeRepository.findById', () => {
  it('returns the trade', async () => {
    const { id } = await seed('FIND');

    const trade = await tradeRepository.findById(id);

    expect(trade?.id).toBe(id);
    expect(trade?.tradeId).toBe(`${TEST_PREFIX}FIND`);
  });

  it('returns null for an unknown id', async () => {
    expect(await tradeRepository.findById('does-not-exist')).toBeNull();
  });
});

describe('tradeRepository.create', () => {
  it('persists the trade and returns it as ACTIVE', async () => {
    const created = await tradeRepository.create(baseRecord('CREATE'));

    expect(created).toMatchObject({ ...baseRecord('CREATE'), status: 'ACTIVE' });
    expect(await tradeRepository.findById(created.id)).toEqual(created);
  });

  it('rejects a duplicate tradeId', async () => {
    await tradeRepository.create(baseRecord('DUP'));

    await expect(tradeRepository.create(baseRecord('DUP'))).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});

describe('tradeRepository.update', () => {
  it('changes only the given fields and advances updatedAt', async () => {
    const created = await tradeRepository.create(baseRecord('UPD'));
    await sleep(5);

    const updated = await tradeRepository.update(created.id, { quantity: 250, price: 190.25 });

    expect(updated).toEqual({
      ...created,
      quantity: 250,
      price: 190.25,
      updatedAt: updated.updatedAt,
    });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect(await tradeRepository.findById(created.id)).toEqual(updated);
  });

  it('rejects an unknown id with Prisma P2025 (the service owns the 404)', async () => {
    await expect(tradeRepository.update('does-not-exist', { quantity: 1 })).rejects.toMatchObject({
      code: 'P2025',
    });
  });
});

describe('tradeRepository.cancel', () => {
  it('sets status to CANCELLED and persists it', async () => {
    const created = await tradeRepository.create(baseRecord('CXL'));

    const cancelled = await tradeRepository.cancel(created.id);

    expect(cancelled.status).toBe('CANCELLED');
    expect((await tradeRepository.findById(created.id))?.status).toBe('CANCELLED');
  });

  it('does not itself reject a second cancel (the service owns the 409)', async () => {
    const created = await tradeRepository.create(baseRecord('CXL2'));
    await tradeRepository.cancel(created.id);

    expect((await tradeRepository.cancel(created.id)).status).toBe('CANCELLED');
  });

  it('rejects an unknown id with Prisma P2025', async () => {
    await expect(tradeRepository.cancel('does-not-exist')).rejects.toMatchObject({
      code: 'P2025',
    });
  });
});

describe('tradeRepository.nextTradeId', () => {
  const numeric = (id: string) => Number(id.replace('TRD-', ''));

  it('returns a TRD-<6+ digit> code', async () => {
    expect(await tradeRepository.nextTradeId()).toMatch(/^TRD-\d{6,}$/);
  });

  it('advances by one after a trade is created', async () => {
    const before = numeric(await tradeRepository.nextTradeId());
    await tradeRepository.create(baseRecord('SEQ'));

    expect(numeric(await tradeRepository.nextTradeId())).toBe(before + 1);
  });

  // Known limitation (retro item 13): the code is count()-based, so two
  // concurrent creates can be issued the same tradeId.
  it.todo('issues unique ids under concurrent creates');
});

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

// baseRecord's side is the literal 'BUY', so widen it for SELL overrides.
type SeedOverrides = Partial<Omit<ReturnType<typeof baseRecord>, 'side'>> & {
  side?: 'BUY' | 'SELL';
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

// update/cancel write their trade_audit rows in the same transaction. Rows are
// removed with their trade by the FK's ON DELETE CASCADE, so cleanup() covers them.
const CHANGED_BY = 'repo-test-user';

const auditsFor = (tradeId: string) =>
  prisma.tradeAudit.findMany({ where: { tradeId }, orderBy: { changedAt: 'asc' } });

describe('tradeRepository.update', () => {
  it('changes only the given fields and advances updatedAt', async () => {
    const created = await tradeRepository.create(baseRecord('UPD'));
    await sleep(5);

    const updated = await tradeRepository.update(
      created.id,
      { quantity: 250, price: 190.25 },
      CHANGED_BY,
    );
    if (!updated) throw new Error('expected the update to apply');

    expect(updated).toEqual({
      ...created,
      quantity: 250,
      price: 190.25,
      updatedAt: updated.updatedAt,
    });
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expect(await tradeRepository.findById(created.id)).toEqual(updated);
  });

  it('records exactly one audit row with from/to for each changed field', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-AUD'));

    await tradeRepository.update(created.id, { quantity: 250, price: 190.25 }, CHANGED_BY);

    const audits = await auditsFor(created.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      changedBy: CHANGED_BY,
      changedFields: {
        quantity: { from: 100, to: 250 },
        price: { from: 189.5, to: 190.25 },
      },
    });
    expect(audits[0].changedAt).toBeInstanceOf(Date);
  });

  it('leaves fields sent with their current value out of changedFields', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-SAME'));

    await tradeRepository.update(created.id, { symbol: 'AAPL', quantity: 300 }, CHANGED_BY);

    const [audit] = await auditsFor(created.id);
    expect(audit.changedFields).toEqual({ quantity: { from: 100, to: 300 } });
  });

  it('still records one row, with no changed fields, for a no-op amend', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-NOOP'));

    await tradeRepository.update(created.id, { quantity: 100 }, CHANGED_BY);

    const audits = await auditsFor(created.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].changedFields).toEqual({});
  });

  it('records one row per successive amend, each diffed against the previous state', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-SEQ'));

    await tradeRepository.update(created.id, { quantity: 200 }, CHANGED_BY);
    await tradeRepository.update(created.id, { quantity: 300 }, CHANGED_BY);

    const audits = await auditsFor(created.id);
    expect(audits.map((a) => a.changedFields)).toEqual([
      { quantity: { from: 100, to: 200 } },
      { quantity: { from: 200, to: 300 } },
    ]);
  });

  // The row lock is what makes each diff's "from" exact: without it, concurrent
  // amends all read the same before-state. Asserted as a chain (each from is
  // exactly one other row's to) so it doesn't depend on changedAt ordering.
  it('diffs concurrent amends against each other, forming one unbroken chain', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-CONC'));
    const quantities = [201, 202, 203, 204, 205, 206, 207, 208];

    await Promise.all(
      quantities.map((quantity) => tradeRepository.update(created.id, { quantity }, CHANGED_BY)),
    );

    const changes = (await auditsFor(created.id)).map(
      (a) => (a.changedFields as { quantity: { from: number; to: number } }).quantity,
    );
    const stored = await tradeRepository.findById(created.id);
    expect(changes).toHaveLength(quantities.length);
    expect(changes.map((c) => c.to).sort()).toEqual(quantities);
    // Every value except the final stored one was the "from" of exactly one amend.
    expect(changes.map((c) => c.from).sort()).toEqual(
      [100, ...quantities.filter((q) => q !== stored?.quantity)].sort(),
    );
  });

  it('returns null for an unknown id (the service owns the 404)', async () => {
    expect(await tradeRepository.update('does-not-exist', { quantity: 1 }, CHANGED_BY)).toBeNull();
  });

  it('returns null, changes nothing and records no audit row for a cancelled trade', async () => {
    const { id } = await seed('UPD-CXL', { status: 'CANCELLED' });

    expect(await tradeRepository.update(id, { quantity: 999 }, CHANGED_BY)).toBeNull();
    expect((await tradeRepository.findById(id))?.quantity).toBe(100);
    expect(await auditsFor(id)).toHaveLength(0);
  });

  it('does not amend a trade cancelled concurrently', async () => {
    const created = await tradeRepository.create(baseRecord('UPD-RACE'));

    const [updated, cancelled] = await Promise.all([
      tradeRepository.update(created.id, { quantity: 999 }, CHANGED_BY),
      tradeRepository.cancel(created.id, CHANGED_BY),
    ]);

    // Either order is fine, but an amend must never land on a cancelled row.
    const stored = await tradeRepository.findById(created.id);
    expect(cancelled?.status).toBe('CANCELLED');
    expect(stored?.status).toBe('CANCELLED');
    if (updated) {
      expect(updated.status).toBe('ACTIVE');
      expect(cancelled?.quantity).toBe(999);
    } else {
      expect(stored?.quantity).toBe(100);
    }
    // One audit row per write that actually landed.
    expect(await auditsFor(created.id)).toHaveLength(updated ? 2 : 1);
  });
});

describe('tradeRepository.cancel', () => {
  it('sets status to CANCELLED and persists it', async () => {
    const created = await tradeRepository.create(baseRecord('CXL'));

    const cancelled = await tradeRepository.cancel(created.id, CHANGED_BY);

    expect(cancelled?.status).toBe('CANCELLED');
    expect((await tradeRepository.findById(created.id))?.status).toBe('CANCELLED');
  });

  it('records exactly one audit row for the status transition', async () => {
    const created = await tradeRepository.create(baseRecord('CXL-AUD'));

    await tradeRepository.cancel(created.id, CHANGED_BY);

    const audits = await auditsFor(created.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      changedBy: CHANGED_BY,
      changedFields: { status: { from: 'ACTIVE', to: 'CANCELLED' } },
    });
  });

  it('returns null and records no second audit row for a second cancel', async () => {
    const created = await tradeRepository.create(baseRecord('CXL2'));
    await tradeRepository.cancel(created.id, CHANGED_BY);

    expect(await tradeRepository.cancel(created.id, CHANGED_BY)).toBeNull();
    expect(await auditsFor(created.id)).toHaveLength(1);
  });

  it('returns null for an unknown id', async () => {
    expect(await tradeRepository.cancel('does-not-exist', CHANGED_BY)).toBeNull();
  });

  it('lets exactly one of several concurrent cancels win, with one audit row', async () => {
    const created = await tradeRepository.create(baseRecord('CXL-RACE'));

    const results = await Promise.all(
      Array.from({ length: 10 }, () => tradeRepository.cancel(created.id, CHANGED_BY)),
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await auditsFor(created.id)).toHaveLength(1);
  });
});

describe('tradeRepository.nextTradeId', () => {
  const numeric = (id: string) => Number(id.replace('TRD-', ''));

  it('returns a TRD-<6+ digit> code', async () => {
    expect(await tradeRepository.nextTradeId()).toMatch(/^TRD-\d{6,}$/);
  });

  it('never issues the same id twice, even without a create in between', async () => {
    const first = numeric(await tradeRepository.nextTradeId());

    expect(numeric(await tradeRepository.nextTradeId())).toBeGreaterThan(first);
  });

  it('issues unique ids under concurrent calls', async () => {
    const ids = await Promise.all(Array.from({ length: 20 }, () => tradeRepository.nextTradeId()));

    expect(new Set(ids).size).toBe(20);
  });
});

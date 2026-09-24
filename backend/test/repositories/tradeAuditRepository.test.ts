import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { tradeAuditRepository } from '../../src/repositories/tradeAuditRepository.js';

// Exercises TradeAuditRepository against a real, migrated Postgres. Only trades
// whose tradeId starts with TEST_PREFIX are created or deleted; their audit
// rows go with them via the FK's ON DELETE CASCADE.
const TEST_PREFIX = 'TEST-AUDREPO-';

const seedTrade = (suffix: string) =>
  prisma.trade.create({
    data: {
      tradeId: `${TEST_PREFIX}${suffix}`,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 189.5,
      trader: 'jdoe',
      book: 'EQ-LON-01',
      counterparty: 'GOLDMAN',
    },
  });

const cleanup = () => prisma.trade.deleteMany({ where: { tradeId: { startsWith: TEST_PREFIX } } });

beforeEach(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('tradeAuditRepository.record', () => {
  it('writes one row inside the given transaction', async () => {
    const trade = await seedTrade('REC');

    await prisma.$transaction((tx) =>
      tradeAuditRepository.record(tx, {
        tradeId: trade.id,
        changedFields: { quantity: { from: 100, to: 200 } },
        changedBy: 'repo-test-user',
      }),
    );

    expect(await tradeAuditRepository.listByTradeId(trade.id)).toEqual([
      {
        id: expect.any(String),
        tradeId: trade.id,
        changedFields: { quantity: { from: 100, to: 200 } },
        changedAt: expect.any(String),
        changedBy: 'repo-test-user',
      },
    ]);
  });

  it('writes nothing when the surrounding transaction rolls back', async () => {
    const trade = await seedTrade('ROLLBACK');

    await expect(
      prisma.$transaction(async (tx) => {
        await tradeAuditRepository.record(tx, {
          tradeId: trade.id,
          changedFields: {},
          changedBy: 'repo-test-user',
        });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(await tradeAuditRepository.listByTradeId(trade.id)).toEqual([]);
  });
});

describe('tradeAuditRepository.listByTradeId', () => {
  it("returns only the given trade's rows, oldest first, with ISO changedAt", async () => {
    const trade = await seedTrade('LIST');
    const other = await seedTrade('OTHER');
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const t1 = new Date('2026-01-02T00:00:00.000Z');
    // Inserted newest first, so ordering can't come from insertion order.
    await prisma.tradeAudit.create({
      data: { tradeId: trade.id, changedFields: { n: 2 }, changedBy: 'b', changedAt: t1 },
    });
    await prisma.tradeAudit.create({
      data: { tradeId: trade.id, changedFields: { n: 1 }, changedBy: 'a', changedAt: t0 },
    });
    await prisma.tradeAudit.create({
      data: { tradeId: other.id, changedFields: {}, changedBy: 'x' },
    });

    const entries = await tradeAuditRepository.listByTradeId(trade.id);

    expect(entries.map((e) => [e.changedBy, e.changedAt])).toEqual([
      ['a', t0.toISOString()],
      ['b', t1.toISOString()],
    ]);
  });

  it('returns an empty list for a trade with no changes', async () => {
    const trade = await seedTrade('EMPTY');

    expect(await tradeAuditRepository.listByTradeId(trade.id)).toEqual([]);
  });
});

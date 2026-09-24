import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';

// Goes straight to the Prisma client to prove the trade_audit foreign key
// holds at the DB level. Needs a migrated Postgres.
const TEST_PREFIX = 'TEST-AUDFK-';

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

const auditRow = (tradeId: string) => ({
  tradeId,
  changedFields: { quantity: { from: 100, to: 200 } },
  changedBy: 'db-test',
});

describe('trade_audit table constraints', () => {
  // Only touch rows this file created — the dev DB may hold seeded data.
  afterEach(async () => {
    await prisma.trade.deleteMany({ where: { tradeId: { startsWith: TEST_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects an audit row for a trade that does not exist', async () => {
    await expect(
      prisma.tradeAudit.create({ data: auditRow('does-not-exist') }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('defaults changedAt to the insert time', async () => {
    const trade = await seedTrade('default');
    const before = Date.now();

    const row = await prisma.tradeAudit.create({ data: auditRow(trade.id) });

    expect(row.changedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  // Trades are never deleted by the app (cancel is a status change); the cascade
  // exists so prefix-scoped test cleanups keep working once audit rows exist.
  it('deletes audit rows with their trade', async () => {
    const trade = await seedTrade('cascade');
    await prisma.tradeAudit.create({ data: auditRow(trade.id) });

    await prisma.trade.delete({ where: { id: trade.id } });

    expect(await prisma.tradeAudit.count({ where: { tradeId: trade.id } })).toBe(0);
  });
});

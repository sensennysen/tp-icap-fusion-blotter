import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';

// Goes straight to the Prisma client, bypassing Zod and TradeService, to prove
// the DB-level CHECK constraints (ARCH §4) hold even if app validation is
// skipped. Needs a migrated Postgres (CI runs `prisma migrate deploy` first).
const TEST_PREFIX = 'TEST-CHK-';

const validTrade = (suffix: string) => ({
  tradeId: `${TEST_PREFIX}${suffix}`,
  symbol: 'AAPL',
  side: 'BUY' as const,
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
});

describe('trades table constraints', () => {
  // Only touch rows this file created — the dev DB may hold seeded data.
  afterEach(async () => {
    await prisma.trade.deleteMany({ where: { tradeId: { startsWith: TEST_PREFIX } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a valid trade', async () => {
    const created = await prisma.trade.create({ data: validTrade('valid') });

    expect(created.quantity).toBe(100);
    expect(Number(created.price)).toBe(189.5);
  });

  it.each([0, -1])('rejects quantity %d', async (quantity) => {
    await expect(
      prisma.trade.create({ data: { ...validTrade(`qty${quantity}`), quantity } }),
    ).rejects.toThrow(/trades_quantity_positive/);
  });

  it.each([0, -0.0001])('rejects price %d', async (price) => {
    await expect(
      prisma.trade.create({ data: { ...validTrade(`px${price}`), price } }),
    ).rejects.toThrow(/trades_price_positive/);
  });

  it('rejects an update that sets quantity or price to zero', async () => {
    const { id } = await prisma.trade.create({ data: validTrade('update') });

    await expect(prisma.trade.update({ where: { id }, data: { quantity: 0 } })).rejects.toThrow(
      /trades_quantity_positive/,
    );
    await expect(prisma.trade.update({ where: { id }, data: { price: 0 } })).rejects.toThrow(
      /trades_price_positive/,
    );
  });

  it('has the CHECK constraints and indexes from ARCH §4', async () => {
    const checks = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'trades'::regclass AND contype = 'c'`;
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'trades'`;

    expect(checks.map((c) => c.conname).sort()).toEqual([
      'trades_price_positive',
      'trades_quantity_positive',
    ]);
    expect(indexes.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'trades_symbol_idx',
        'trades_trader_idx',
        'trades_status_idx',
        'trades_tradeTimestamp_idx',
      ]),
    );
  });
});

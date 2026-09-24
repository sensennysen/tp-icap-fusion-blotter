import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { logger } from '../src/lib/logger.js';
import {
  DEFAULT_SEED_COUNT,
  generateTrades,
  seedIfEmpty,
  SYNC_TRADE_ID_SEQUENCE_SQL,
  type SeedClient,
} from '../src/seedTrades.js';

// Three layers: the pure generator, seedIfEmpty against a fake client (so the
// empty-table branch never needs the real table emptied), and generated rows
// against real Postgres. Only rows prefixed TEST_PREFIX are created or deleted,
// so the seeded dev DB survives.
const TEST_PREFIX = 'TEST-SEED-';
const DAY_MS = 24 * 60 * 60 * 1000;

const cleanup = () => prisma.trade.deleteMany({ where: { tradeId: { startsWith: TEST_PREFIX } } });

// A fake that behaves like the table: count reflects what createMany inserted.
function statefulClient(initialRows = 0) {
  let rows = initialRows;
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => {
    rows += data.length;
  });
  const executeRaw = vi.fn(async () => 0);
  const client: SeedClient = {
    trade: { count: async () => rows, createMany },
    $executeRawUnsafe: executeRaw,
  };
  return { client, createMany, executeRaw };
}

beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('generateTrades', () => {
  it('returns exactly the requested number of trades', () => {
    expect(generateTrades(0)).toHaveLength(0);
    expect(generateTrades(37)).toHaveLength(37);
  });

  it('gives each trade a unique, sequential tradeId from the prefix and start number', () => {
    const ids = generateTrades(5, { idPrefix: 'X-', startNumber: 42 }).map((t) => t.tradeId);
    expect(ids).toEqual(['X-42', 'X-43', 'X-44', 'X-45', 'X-46']);
    expect(new Set(generateTrades(500).map((t) => t.tradeId)).size).toBe(500);
  });

  it('defaults ids to TRD-100001 upwards, matching tradeRepository.nextTradeId', () => {
    const trades = generateTrades(3);
    expect(trades.map((t) => t.tradeId)).toEqual(['TRD-100001', 'TRD-100002', 'TRD-100003']);
  });

  it('produces values that satisfy the schema and DB constraints', () => {
    const now = Date.now();
    for (const t of generateTrades(1000, { now })) {
      expect(['BUY', 'SELL']).toContain(t.side);
      expect(['ACTIVE', 'CANCELLED']).toContain(t.status);
      expect(Number.isInteger(t.quantity)).toBe(true);
      expect(t.quantity).toBeGreaterThanOrEqual(1);
      expect(t.quantity).toBeLessThanOrEqual(5000);
      expect(t.price).toBeGreaterThan(0);
      expect(t.price).toBeLessThanOrEqual(501);
      expect(Number(t.price.toFixed(4))).toBe(t.price);
      expect(t.tradeTimestamp.getTime()).toBeLessThanOrEqual(now);
      expect(t.tradeTimestamp.getTime()).toBeGreaterThan(now - 30 * DAY_MS);
      for (const field of [t.symbol, t.trader, t.book, t.counterparty]) {
        expect(field.length).toBeGreaterThan(0);
      }
    }
  });

  // Random sampling hits a boundary too rarely to catch an off-by-one (quantity 0
  // is ~1 in 5,000), so pin Math.random to both ends of its range instead.
  it('keeps quantity, price and timestamp inside their bounds at the extremes of Math.random', () => {
    const now = Date.now();

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const [low] = generateTrades(1, { now });
    expect(low.quantity).toBe(1);
    expect(low.price).toBe(1);
    expect(low.tradeTimestamp.getTime()).toBe(now);

    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const [high] = generateTrades(1, { now });
    expect(high.quantity).toBe(5000);
    expect(high.price).toBeLessThanOrEqual(501);
    expect(high.tradeTimestamp.getTime()).toBe(now - 29 * DAY_MS);
  });

  it('cancels roughly 10% of trades', () => {
    const trades = generateTrades(10_000);
    const rate = trades.filter((t) => t.status === 'CANCELLED').length / trades.length;
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.13);
  });

  it('uses more than one value for each randomized field', () => {
    const trades = generateTrades(500);
    for (const key of ['symbol', 'side', 'trader', 'book', 'counterparty'] as const) {
      expect(new Set(trades.map((t) => t[key])).size).toBeGreaterThan(1);
    }
  });
});

describe('seedIfEmpty', () => {
  it('default count is inside the brief’s 100-1,000 range', () => {
    expect(DEFAULT_SEED_COUNT).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_SEED_COUNT).toBeLessThanOrEqual(1000);
  });

  it('inserts the default number of trades, once, into an empty table', async () => {
    const { client, createMany } = statefulClient(0);

    const result = await seedIfEmpty(client);

    expect(result).toEqual({ seeded: DEFAULT_SEED_COUNT, skipped: false });
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(DEFAULT_SEED_COUNT);
  });

  it('skips without writing when the table already has rows', async () => {
    const { client, createMany, executeRaw } = statefulClient(5);

    const result = await seedIfEmpty(client);

    expect(result).toEqual({ seeded: 0, skipped: true });
    expect(createMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('moves trade_id_seq past the seeded codes after inserting', async () => {
    const { client, createMany, executeRaw } = statefulClient(0);

    await seedIfEmpty(client);

    expect(executeRaw).toHaveBeenCalledExactlyOnceWith(SYNC_TRADE_ID_SEQUENCE_SQL);
    expect(createMany.mock.invocationCallOrder[0]).toBeLessThan(
      executeRaw.mock.invocationCallOrder[0],
    );
  });

  it('skips when the table has exactly one row', async () => {
    const { client, createMany } = statefulClient(1);

    expect((await seedIfEmpty(client)).skipped).toBe(true);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('running twice in a row inserts data only once', async () => {
    const { client, createMany } = statefulClient(0);

    const first = await seedIfEmpty(client);
    const second = await seedIfEmpty(client);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(await client.trade.count()).toBe(DEFAULT_SEED_COUNT);
  });

  it('logs the skip and the seed through pino', async () => {
    await seedIfEmpty(statefulClient(0).client);
    await seedIfEmpty(statefulClient(3).client);

    expect(logger.info).toHaveBeenCalledWith({ total: DEFAULT_SEED_COUNT }, 'Seeded trades');
    expect(logger.info).toHaveBeenCalledWith(
      { existingCount: 3 },
      'Trades already seeded, skipping',
    );
  });

  it('does not swallow a failing write', async () => {
    const client: SeedClient = {
      trade: {
        count: async () => 0,
        createMany: async () => {
          throw new Error('db down');
        },
      },
      $executeRawUnsafe: async () => 0,
    };

    await expect(seedIfEmpty(client)).rejects.toThrow('db down');
  });
});

describe('against real Postgres', () => {
  it('accepts generated trades (unique index, enums, CHECK constraints, Decimal(12,4))', async () => {
    const before = await prisma.trade.count();
    const data = generateTrades(50, { idPrefix: TEST_PREFIX, startNumber: 1 });

    await prisma.trade.createMany({ data });

    expect(await prisma.trade.count()).toBe(before + 50);
    const stored = await prisma.trade.findMany({
      where: { tradeId: { startsWith: TEST_PREFIX } },
    });
    expect(stored).toHaveLength(50);
    const byId = new Map(data.map((t) => [t.tradeId, t]));
    for (const row of stored) {
      expect(Number(row.price)).toBe(byId.get(row.tradeId)?.price);
    }
  });

  // Codes are TEST-SEED-<n> here, so this checks the SQL runs and ignores rows
  // that don't match TRD-<n>, without disturbing the dev sequence.
  it('the sequence sync SQL never moves the sequence backwards', async () => {
    const [{ before }] = await prisma.$queryRaw<[{ before: bigint }]>`
      SELECT last_value AS before FROM trade_id_seq`;

    await prisma.$executeRawUnsafe(SYNC_TRADE_ID_SEQUENCE_SQL);

    const [{ after }] = await prisma.$queryRaw<[{ after: bigint }]>`
      SELECT last_value AS after FROM trade_id_seq`;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('leaves a non-empty table untouched', async () => {
    await prisma.trade.createMany({
      data: generateTrades(1, { idPrefix: TEST_PREFIX, startNumber: 1 }),
    });
    const before = await prisma.trade.count();

    const result = await seedIfEmpty(prisma);

    expect(result).toEqual({ seeded: 0, skipped: true });
    expect(await prisma.trade.count()).toBe(before);
  });
});

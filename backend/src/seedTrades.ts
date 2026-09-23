import { logger } from './lib/logger.js';

const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'JPM', 'BAC'];
const TRADERS = ['jdoe', 'asmith', 'mchen', 'rpatel', 'lwong', 'kmuller'];
const BOOKS = ['EQ-LON-01', 'EQ-NYC-02', 'EQ-SGP-03'];
const COUNTERPARTIES = ['GOLDMAN', 'MORGAN_STANLEY', 'BARCLAYS', 'UBS', 'CITI'];

export const DEFAULT_SEED_COUNT = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GenerateTradesOptions {
  idPrefix?: string;
  startNumber?: number;
  now?: number;
}

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomTrade(tradeId: string, now: number) {
  const daysAgo = Math.floor(Math.random() * 30);
  const cancelled = Math.random() < 0.1;

  return {
    tradeId,
    symbol: randomFrom(SYMBOLS),
    side: Math.random() < 0.5 ? ('BUY' as const) : ('SELL' as const),
    quantity: Math.floor(Math.random() * 5000) + 1,
    price: Number((Math.random() * 500 + 1).toFixed(4)),
    trader: randomFrom(TRADERS),
    book: randomFrom(BOOKS),
    counterparty: randomFrom(COUNTERPARTIES),
    tradeTimestamp: new Date(now - daysAgo * DAY_MS),
    status: cancelled ? ('CANCELLED' as const) : ('ACTIVE' as const),
  };
}

export function generateTrades(
  count: number,
  { idPrefix = 'TRD-', startNumber = 100001, now = Date.now() }: GenerateTradesOptions = {},
) {
  return Array.from({ length: count }, (_, i) => randomTrade(`${idPrefix}${startNumber + i}`, now));
}

// The slice of the Prisma client the seed touches, so a test can pass a fake
// instead of emptying the real table.
export interface SeedClient {
  trade: {
    count(): Promise<number>;
    createMany(args: { data: ReturnType<typeof generateTrades> }): Promise<unknown>;
  };
}

export async function seedIfEmpty(client: SeedClient, count = DEFAULT_SEED_COUNT) {
  const existingCount = await client.trade.count();
  if (existingCount > 0) {
    logger.info({ existingCount }, 'Trades already seeded, skipping');
    return { seeded: 0, skipped: true };
  }

  await client.trade.createMany({ data: generateTrades(count) });
  logger.info({ total: count }, 'Seeded trades');
  return { seeded: count, skipped: false };
}

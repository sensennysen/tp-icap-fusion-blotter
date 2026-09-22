import './lib/loadEnv.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';

const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'JPM', 'BAC'];
const TRADERS = ['jdoe', 'asmith', 'mchen', 'rpatel', 'lwong', 'kmuller'];
const BOOKS = ['EQ-LON-01', 'EQ-NYC-02', 'EQ-SGP-03'];
const COUNTERPARTIES = ['GOLDMAN', 'MORGAN_STANLEY', 'BARCLAYS', 'UBS', 'CITI'];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomTrade(index: number) {
  const daysAgo = Math.floor(Math.random() * 30);
  const tradeTimestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const cancelled = Math.random() < 0.1;

  return {
    tradeId: `TRD-${100001 + index}`,
    symbol: randomFrom(SYMBOLS),
    side: Math.random() < 0.5 ? ('BUY' as const) : ('SELL' as const),
    quantity: Math.floor(Math.random() * 5000) + 1,
    price: Number((Math.random() * 500 + 1).toFixed(4)),
    trader: randomFrom(TRADERS),
    book: randomFrom(BOOKS),
    counterparty: randomFrom(COUNTERPARTIES),
    tradeTimestamp,
    status: cancelled ? ('CANCELLED' as const) : ('ACTIVE' as const),
  };
}

async function seed() {
  const existingCount = await prisma.trade.count();
  if (existingCount > 0) {
    logger.info({ existingCount }, 'Trades already seeded, skipping');
    return;
  }

  const total = 500;
  const trades = Array.from({ length: total }, (_, i) => randomTrade(i));
  await prisma.trade.createMany({ data: trades });
  logger.info({ total }, 'Seeded trades');
}

seed()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

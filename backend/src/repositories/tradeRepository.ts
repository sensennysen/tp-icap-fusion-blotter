import type { Trade as PrismaTrade } from '../../generated/prisma/client.ts';
import type { Trade, TradeListQueryInput } from '@fusion-blotter/shared';
import { prisma } from '../lib/prisma.js';

function toTrade(row: PrismaTrade): Trade {
  return {
    id: row.id,
    tradeId: row.tradeId,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: Number(row.price),
    trader: row.trader,
    book: row.book,
    counterparty: row.counterparty,
    tradeTimestamp: row.tradeTimestamp.toISOString(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateTradeRecord {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  trader: string;
  book: string;
  counterparty: string;
}

export interface UpdateTradeRecord {
  symbol?: string;
  side?: 'BUY' | 'SELL';
  quantity?: number;
  price?: number;
  trader?: string;
  book?: string;
  counterparty?: string;
}

export const tradeRepository = {
  async list(query: TradeListQueryInput): Promise<Trade[]> {
    const rows = await prisma.trade.findMany({
      where: {
        ...(query.symbol ? { symbol: query.symbol } : {}),
        ...(query.trader ? { trader: query.trader } : {}),
        ...(query.side ? { side: query.side } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { [query.sort ?? 'tradeTimestamp']: query.order ?? 'desc' },
    });
    return rows.map(toTrade);
  },

  async findById(id: string): Promise<Trade | null> {
    const row = await prisma.trade.findUnique({ where: { id } });
    return row ? toTrade(row) : null;
  },

  async nextTradeId(): Promise<string> {
    const count = await prisma.trade.count();
    return `TRD-${100001 + count}`;
  },

  async create(data: CreateTradeRecord): Promise<Trade> {
    const row = await prisma.trade.create({ data });
    return toTrade(row);
  },

  async update(id: string, data: UpdateTradeRecord): Promise<Trade> {
    const row = await prisma.trade.update({ where: { id }, data });
    return toTrade(row);
  },

  async cancel(id: string): Promise<Trade> {
    const row = await prisma.trade.update({ where: { id }, data: { status: 'CANCELLED' } });
    return toTrade(row);
  },
};

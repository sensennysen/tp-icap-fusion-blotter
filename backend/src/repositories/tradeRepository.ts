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

  // nextval() is atomic, so concurrent creates never share a number (a
  // count()-based code could). Numbers skipped by failed inserts are not reused.
  async nextTradeId(): Promise<string> {
    const [{ n }] = await prisma.$queryRaw<[{ n: bigint }]>`SELECT nextval('trade_id_seq') AS n`;
    return `TRD-${n}`;
  },

  async create(data: CreateTradeRecord): Promise<Trade> {
    const row = await prisma.trade.create({ data });
    return toTrade(row);
  },

  // update and cancel only match ACTIVE rows, so the status check and the write
  // are one statement: a concurrent cancel can't slip in between them. They
  // return null when the trade is missing or already cancelled; the service
  // tells those apart.
  async update(id: string, data: UpdateTradeRecord): Promise<Trade | null> {
    const [row] = await prisma.trade.updateManyAndReturn({
      where: { id, status: 'ACTIVE' },
      data,
    });
    return row ? toTrade(row) : null;
  },

  async cancel(id: string): Promise<Trade | null> {
    const [row] = await prisma.trade.updateManyAndReturn({
      where: { id, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    return row ? toTrade(row) : null;
  },
};

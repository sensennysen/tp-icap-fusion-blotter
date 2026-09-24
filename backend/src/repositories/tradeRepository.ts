import type { Prisma, Trade as PrismaTrade } from '../../generated/prisma/client.ts';
import type { FieldChange, Trade, TradeListQueryInput } from '@fusion-blotter/shared';
import { prisma } from '../lib/prisma.js';
import { tradeAuditRepository } from './tradeAuditRepository.js';

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

// Row-locks the trade for the rest of the transaction and returns its current
// state, so the audit diff's "from" values can't be changed by a concurrent
// writer before our update lands. Parameterised like nextTradeId's nextval().
async function lockForAudit(tx: Prisma.TransactionClient, id: string): Promise<Trade | null> {
  await tx.$queryRaw`SELECT 1 FROM "trades" WHERE "id" = ${id} FOR UPDATE`;
  const row = await tx.trade.findUnique({ where: { id } });
  return row ? toTrade(row) : null;
}

function diff(before: Trade, after: Trade, fields: (keyof Trade)[]): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
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
  // tells those apart. A successful write also records exactly one trade_audit
  // row in the same transaction; a null result records none.
  async update(id: string, data: UpdateTradeRecord, changedBy: string): Promise<Trade | null> {
    return prisma.$transaction(async (tx) => {
      const before = await lockForAudit(tx, id);
      const [row] = await tx.trade.updateManyAndReturn({
        where: { id, status: 'ACTIVE' },
        data,
      });
      if (!row || !before) return null;
      const after = toTrade(row);
      const fields = (Object.keys(data) as (keyof UpdateTradeRecord)[]).filter(
        (field) => data[field] !== undefined,
      );
      await tradeAuditRepository.record(tx, {
        tradeId: id,
        changedFields: diff(before, after, fields),
        changedBy,
      });
      return after;
    });
  },

  async cancel(id: string, changedBy: string): Promise<Trade | null> {
    return prisma.$transaction(async (tx) => {
      const before = await lockForAudit(tx, id);
      const [row] = await tx.trade.updateManyAndReturn({
        where: { id, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      if (!row || !before) return null;
      const after = toTrade(row);
      await tradeAuditRepository.record(tx, {
        tradeId: id,
        changedFields: diff(before, after, ['status']),
        changedBy,
      });
      return after;
    });
  },
};

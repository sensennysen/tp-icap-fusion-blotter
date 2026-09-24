import type { Prisma, TradeAudit as PrismaTradeAudit } from '../../generated/prisma/client.ts';
import type { FieldChange, TradeAuditEntry } from '@fusion-blotter/shared';
import { prisma } from '../lib/prisma.js';

function toTradeAuditEntry(row: PrismaTradeAudit): TradeAuditEntry {
  return {
    id: row.id,
    tradeId: row.tradeId,
    changedFields: row.changedFields as unknown as Record<string, FieldChange>,
    changedAt: row.changedAt.toISOString(),
    changedBy: row.changedBy,
  };
}

export interface CreateTradeAuditRecord {
  tradeId: string;
  changedFields: Record<string, FieldChange>;
  changedBy: string;
}

export const tradeAuditRepository = {
  // Takes the caller's transaction client so the audit row commits or rolls
  // back together with the trade change it describes.
  async record(tx: Prisma.TransactionClient, data: CreateTradeAuditRecord): Promise<void> {
    await tx.tradeAudit.create({ data });
  },

  async listByTradeId(tradeId: string): Promise<TradeAuditEntry[]> {
    const rows = await prisma.tradeAudit.findMany({
      where: { tradeId },
      orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toTradeAuditEntry);
  },
};

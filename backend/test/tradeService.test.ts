import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@fusion-blotter/shared';

const baseTrade: Trade = {
  id: 'trade-1',
  tradeId: 'TRD-100001',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
  tradeTimestamp: new Date().toISOString(),
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const createInput = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 189.5,
  trader: 'jdoe',
  book: 'EQ-LON-01',
  counterparty: 'GOLDMAN',
} as const;

vi.mock('../src/repositories/tradeRepository.js', () => ({
  tradeRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    nextTradeId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../src/repositories/tradeAuditRepository.js', () => ({
  tradeAuditRepository: { listByTradeId: vi.fn() },
}));

const { tradeRepository } = await import('../src/repositories/tradeRepository.js');
const { tradeAuditRepository } = await import('../src/repositories/tradeAuditRepository.js');
const { TradeService, AUDIT_CHANGED_BY } = await import('../src/services/tradeService.js');
const { ConflictError, NotFoundError } = await import('../src/lib/errors.js');

describe('TradeService', () => {
  let broadcast: ReturnType<typeof vi.fn>;
  let service: InstanceType<typeof TradeService>;

  beforeEach(() => {
    vi.resetAllMocks();
    broadcast = vi.fn();
    service = new TradeService({ broadcast } as never);
  });

  describe('list', () => {
    it('delegates to the repository with the query and returns its result', async () => {
      vi.mocked(tradeRepository.list).mockResolvedValue([baseTrade]);
      const query = { symbol: 'AAPL', sort: 'price', order: 'asc' } as const;

      const result = await service.list(query);

      expect(result).toEqual([baseTrade]);
      expect(tradeRepository.list).toHaveBeenCalledExactlyOnceWith(query);
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns the trade when it exists', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      await expect(service.getById('trade-1')).resolves.toEqual(baseTrade);
      expect(tradeRepository.findById).toHaveBeenCalledExactlyOnceWith('trade-1');
    });

    it('throws NotFoundError (404) when the trade is missing', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      const err = await service.getById('missing').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a trade and broadcasts TRADE_CREATED exactly once', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100001');
      vi.mocked(tradeRepository.create).mockResolvedValue(baseTrade);

      const result = await service.create(createInput);

      expect(result).toEqual(baseTrade);
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CREATED', payload: baseTrade });
    });

    it('passes the generated tradeId alongside the input to the repository', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100042');
      vi.mocked(tradeRepository.create).mockResolvedValue({ ...baseTrade, tradeId: 'TRD-100042' });

      await service.create(createInput);

      expect(tradeRepository.nextTradeId).toHaveBeenCalledTimes(1);
      expect(tradeRepository.create).toHaveBeenCalledExactlyOnceWith({
        tradeId: 'TRD-100042',
        ...createInput,
      });
    });

    it('does not broadcast when the repository rejects', async () => {
      vi.mocked(tradeRepository.nextTradeId).mockResolvedValue('TRD-100001');
      vi.mocked(tradeRepository.create).mockRejectedValue(new Error('db down'));

      await expect(service.create(createInput)).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('amend', () => {
    it('amends an active trade and broadcasts TRADE_AMENDED exactly once', async () => {
      const amended: Trade = { ...baseTrade, quantity: 250 };
      vi.mocked(tradeRepository.update).mockResolvedValue(amended);

      const result = await service.amend('trade-1', { quantity: 250 });

      expect(result).toEqual(amended);
      expect(tradeRepository.update).toHaveBeenCalledExactlyOnceWith(
        'trade-1',
        { quantity: 250 },
        AUDIT_CHANGED_BY,
      );
      expect(tradeRepository.findById).not.toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_AMENDED', payload: amended });
    });

    // The repository only writes ACTIVE rows, so a null means the trade was
    // missing or already cancelled; the service looks it up to tell which.
    it('rejects amending a cancelled trade with ConflictError (409) and does not broadcast', async () => {
      vi.mocked(tradeRepository.update).mockResolvedValue(null);
      vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });

      const err = await service.amend('trade-1', { quantity: 200 }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing trade and does not broadcast', async () => {
      vi.mocked(tradeRepository.update).mockResolvedValue(null);
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      await expect(service.amend('missing', { quantity: 200 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('does not broadcast when the repository update rejects', async () => {
      vi.mocked(tradeRepository.update).mockRejectedValue(new Error('db down'));

      await expect(service.amend('trade-1', { quantity: 200 })).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels an active trade and broadcasts TRADE_CANCELLED exactly once', async () => {
      const cancelled: Trade = { ...baseTrade, status: 'CANCELLED' };
      vi.mocked(tradeRepository.cancel).mockResolvedValue(cancelled);

      const result = await service.cancel('trade-1');

      expect(result.status).toBe('CANCELLED');
      expect(tradeRepository.cancel).toHaveBeenCalledExactlyOnceWith('trade-1', AUDIT_CHANGED_BY);
      expect(tradeRepository.findById).not.toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledTimes(1);
      expect(broadcast).toHaveBeenCalledWith({ type: 'TRADE_CANCELLED', payload: cancelled });
    });

    it('rejects cancelling an already-cancelled trade with ConflictError (409) and does not broadcast', async () => {
      vi.mocked(tradeRepository.cancel).mockResolvedValue(null);
      vi.mocked(tradeRepository.findById).mockResolvedValue({ ...baseTrade, status: 'CANCELLED' });

      const err = await service.cancel('trade-1').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictError);
      expect(err).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a missing trade and does not broadcast', async () => {
      vi.mocked(tradeRepository.cancel).mockResolvedValue(null);
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      await expect(service.cancel('missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('does not broadcast when the repository cancel rejects', async () => {
      vi.mocked(tradeRepository.cancel).mockRejectedValue(new Error('db down'));

      await expect(service.cancel('trade-1')).rejects.toThrow('db down');
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('broadcasts once for a double-cancel: the second call is a conflict', async () => {
      const cancelled: Trade = { ...baseTrade, status: 'CANCELLED' };
      vi.mocked(tradeRepository.cancel)
        .mockResolvedValueOnce(cancelled)
        .mockResolvedValueOnce(null);
      vi.mocked(tradeRepository.findById).mockResolvedValue(cancelled);

      await service.cancel('trade-1');
      await expect(service.cancel('trade-1')).rejects.toBeInstanceOf(ConflictError);

      expect(tradeRepository.cancel).toHaveBeenCalledTimes(2);
      expect(broadcast).toHaveBeenCalledTimes(1);
    });
  });

  describe('audit attribution', () => {
    // No auth exists yet (TASK-002), so changedBy is a fixed placeholder.
    it('attributes audit rows to the "system" placeholder until auth lands', () => {
      expect(AUDIT_CHANGED_BY).toBe('system');
    });
  });

  describe('getAuditHistory', () => {
    it('returns the audit entries for an existing trade', async () => {
      const entries = [
        {
          id: 'audit-1',
          tradeId: 'trade-1',
          changedFields: { quantity: { from: 100, to: 250 } },
          changedAt: new Date().toISOString(),
          changedBy: 'system',
        },
      ];
      vi.mocked(tradeRepository.findById).mockResolvedValue(baseTrade);
      vi.mocked(tradeAuditRepository.listByTradeId).mockResolvedValue(entries);

      expect(await service.getAuditHistory('trade-1')).toEqual(entries);
      expect(tradeAuditRepository.listByTradeId).toHaveBeenCalledExactlyOnceWith('trade-1');
    });

    it('throws NotFoundError (404) for a missing trade without reading audit rows', async () => {
      vi.mocked(tradeRepository.findById).mockResolvedValue(null);

      const err = await service.getAuditHistory('missing').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(tradeAuditRepository.listByTradeId).not.toHaveBeenCalled();
    });
  });
});

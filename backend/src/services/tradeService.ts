import type {
  CreateTradeInput,
  AmendTradeInput,
  TradeListQueryInput,
} from '@fusion-blotter/shared';
import { tradeRepository } from '../repositories/tradeRepository.js';
import { tradeAuditRepository } from '../repositories/tradeAuditRepository.js';
import { WebSocketBroadcaster } from '../realtime/webSocketBroadcaster.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

// PLACEHOLDER: there is no auth yet, so every audit row is attributed to this
// fixed value. TASK-002 (mock-auth) must replace it with the requesting user.
export const AUDIT_CHANGED_BY = 'system';

export class TradeService {
  constructor(private readonly broadcaster: WebSocketBroadcaster) {}

  list(query: TradeListQueryInput) {
    return tradeRepository.list(query);
  }

  async getById(id: string) {
    const trade = await tradeRepository.findById(id);
    if (!trade) {
      throw new NotFoundError(`Trade ${id} not found`);
    }
    return trade;
  }

  async create(input: CreateTradeInput) {
    const tradeId = await tradeRepository.nextTradeId();
    const trade = await tradeRepository.create({ tradeId, ...input });
    this.broadcaster.broadcast({ type: 'TRADE_CREATED', payload: trade });
    return trade;
  }

  // The repository writes only to ACTIVE trades, so a null result means the
  // trade is missing (404) or already cancelled (409).
  async amend(id: string, input: AmendTradeInput) {
    const trade = await tradeRepository.update(id, input, AUDIT_CHANGED_BY);
    if (!trade) {
      await this.getById(id);
      throw new ConflictError(`Trade ${id} is cancelled and cannot be amended`);
    }
    this.broadcaster.broadcast({ type: 'TRADE_AMENDED', payload: trade });
    return trade;
  }

  async cancel(id: string) {
    const trade = await tradeRepository.cancel(id, AUDIT_CHANGED_BY);
    if (!trade) {
      await this.getById(id);
      throw new ConflictError(`Trade ${id} is already cancelled`);
    }
    this.broadcaster.broadcast({ type: 'TRADE_CANCELLED', payload: trade });
    return trade;
  }

  async getAuditHistory(id: string) {
    await this.getById(id);
    return tradeAuditRepository.listByTradeId(id);
  }
}

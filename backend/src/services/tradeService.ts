import type {
  CreateTradeInput,
  AmendTradeInput,
  TradeListQueryInput,
} from '@fusion-blotter/shared';
import { tradeRepository } from '../repositories/tradeRepository.js';
import { WebSocketBroadcaster } from '../realtime/webSocketBroadcaster.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

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

  async amend(id: string, input: AmendTradeInput) {
    const existing = await this.getById(id);
    if (existing.status === 'CANCELLED') {
      throw new ConflictError(`Trade ${id} is cancelled and cannot be amended`);
    }
    const trade = await tradeRepository.update(id, input);
    this.broadcaster.broadcast({ type: 'TRADE_AMENDED', payload: trade });
    return trade;
  }

  async cancel(id: string) {
    const existing = await this.getById(id);
    if (existing.status === 'CANCELLED') {
      throw new ConflictError(`Trade ${id} is already cancelled`);
    }
    const trade = await tradeRepository.cancel(id);
    this.broadcaster.broadcast({ type: 'TRADE_CANCELLED', payload: trade });
    return trade;
  }
}

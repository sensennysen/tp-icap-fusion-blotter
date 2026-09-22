import type { Trade } from './trade.js';

export interface TradeCreatedEvent {
  type: 'TRADE_CREATED';
  payload: Trade;
}

export interface TradeAmendedEvent {
  type: 'TRADE_AMENDED';
  payload: Trade;
}

export interface TradeCancelledEvent {
  type: 'TRADE_CANCELLED';
  payload: Trade;
}

export type TradeEvent = TradeCreatedEvent | TradeAmendedEvent | TradeCancelledEvent;

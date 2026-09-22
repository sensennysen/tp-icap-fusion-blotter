export type Side = 'BUY' | 'SELL';

export type TradeStatus = 'ACTIVE' | 'CANCELLED';

export interface Trade {
  id: string;
  tradeId: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  trader: string;
  book: string;
  counterparty: string;
  tradeTimestamp: string;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
}

export type TradeSortField = 'symbol' | 'trader' | 'tradeTimestamp' | 'price' | 'quantity';

export type SortOrder = 'asc' | 'desc';

export interface TradeListQuery {
  symbol?: string;
  trader?: string;
  side?: Side;
  status?: TradeStatus;
  sort?: TradeSortField;
  order?: SortOrder;
}

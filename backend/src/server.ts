import './lib/loadEnv.js';
import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { WebSocketBroadcaster } from './realtime/webSocketBroadcaster.js';
import { TradeService } from './services/tradeService.js';
import { logger } from './lib/logger.js';

const httpServer = createServer();
const broadcaster = new WebSocketBroadcaster(httpServer);
const tradeService = new TradeService(broadcaster);
const app = createApp(tradeService);

httpServer.on('request', app);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Backend listening (HTTP + WebSocket on one port)');
});

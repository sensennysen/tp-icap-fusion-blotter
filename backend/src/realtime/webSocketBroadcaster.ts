import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { TradeEvent } from '@fusion-blotter/shared';
import { logger } from '../lib/logger.js';

export class WebSocketBroadcaster {
  private readonly clients = new Set<WebSocket>();
  private readonly wss: WebSocketServer;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (socket) => {
      this.clients.add(socket);
      logger.debug({ clientCount: this.clients.size }, 'WebSocket client connected');

      socket.on('close', () => {
        this.clients.delete(socket);
        logger.debug({ clientCount: this.clients.size }, 'WebSocket client disconnected');
      });
    });
  }

  broadcast(event: TradeEvent): void {
    const message = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  close(): void {
    this.wss.close();
  }
}

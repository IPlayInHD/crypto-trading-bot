import { WebSocketServer, WebSocket } from 'ws';
import { BotStats, WsMessage } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function startWebSocketServer(): WebSocketServer {
  wss = new WebSocketServer({ port: config.wsPort });

  wss.on('listening', () => {
    logger.info(`WebSocket server listening on ws://localhost:${config.wsPort}`);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    logger.info(`Dashboard client connected from ${ip}`);
    clients.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info(`Dashboard client disconnected`);
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket error: ${err.message}`);
      clients.delete(ws);
    });

    // Send welcome with current status
    ws.send(JSON.stringify({
      type: 'bot_status',
      payload: { connected: true, mode: config.tradingMode },
      timestamp: Date.now(),
    }));
  });

  wss.on('error', (err) => {
    logger.error(`WebSocket server error: ${err.message}`);
  });

  return wss;
}

function handleClientMessage(ws: WebSocket, msg: { type: string; payload?: unknown }) {
  // Handle control messages from dashboard
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', payload: null, timestamp: Date.now() }));
      break;
    default:
      break;
  }
}

export function broadcast(message: WsMessage) {
  if (clients.size === 0) return;

  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}

export function broadcastStats(stats: BotStats) {
  broadcast({ type: 'stats', payload: stats, timestamp: Date.now() });
}

export function broadcastLog(level: string, message: string) {
  broadcast({
    type: 'log',
    payload: { level, message },
    timestamp: Date.now(),
  });
}

export function getConnectedClients(): number {
  return clients.size;
}

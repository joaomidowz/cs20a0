import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { PROTOCOL_VERSION, clientCommandSchema, roomConfigSchema, type ClientCommand, type ErrorCode, type ServerMessage } from '../src/lib/game/online/contracts';
import { ONLINE_DATA_HASH } from './data';
import { RoomError, RoomManager } from './room-manager';

const MAX_COMMANDS_PER_10_SECONDS = 40;
const MAX_ROOM_CREATIONS_PER_MINUTE = 10;
const MAX_PAYLOAD_BYTES = 16 * 1024;

interface Session {
  roomCode: string;
  participantId: string | null;
  commandTimes: number[];
  alive: boolean;
}

export interface OnlineServerOptions {
  allowedOrigins?: string[];
  manager?: RoomManager;
  now?: () => number;
}

const json = (response: ServerResponse, status: number, body: unknown, origin?: string) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {})
  });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PAYLOAD_BYTES) throw new Error('Payload too large');
    chunks.push(buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

export function createOnlineServer(options: OnlineServerOptions = {}) {
  const manager = options.manager ?? new RoomManager();
  const now = options.now ?? Date.now;
  const allowedOrigins = new Set(options.allowedOrigins ?? ['http://localhost:5173', 'https://cs13a0.com', 'https://www.cs13a0.com']);
  const roomCreations = new Map<string, number[]>();
  const sessions = new Map<WebSocket, Session>();

  const isAllowedOrigin = (request: IncomingMessage) => {
    const origin = request.headers.origin;
    return !origin || allowedOrigins.has(origin);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) return json(response, 403, { error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': origin ?? '',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        vary: 'origin'
      });
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, rooms: manager.roomCount() }, origin);
    }
    const roomLookup = request.method === 'GET' ? /^\/rooms\/([A-Z2-9]{8})$/i.exec(url.pathname) : null;
    if (roomLookup) {
      // Lets the client tell "room not found" apart from "server unreachable" before opening a socket.
      const exists = manager.hasRoom(roomLookup[1].toUpperCase());
      return json(response, exists ? 200 : 404, exists ? { ok: true, roomCode: roomLookup[1].toUpperCase() } : { error: 'Room not found' }, origin);
    }
    if (request.method === 'POST' && url.pathname === '/rooms') {
      const address = request.socket.remoteAddress ?? 'unknown';
      const current = now();
      const recent = (roomCreations.get(address) ?? []).filter((timestamp) => current - timestamp < 60_000);
      if (recent.length) roomCreations.set(address, recent);
      else roomCreations.delete(address);
      if (recent.length >= MAX_ROOM_CREATIONS_PER_MINUTE) return json(response, 429, { error: 'Rate limited' }, origin);
      try {
        const body = await readJsonBody(request) as Record<string, unknown>;
        if (body.protocolVersion !== PROTOCOL_VERSION) return json(response, 409, { error: 'Protocol mismatch' }, origin);
        if (body.dataHash !== ONLINE_DATA_HASH) return json(response, 409, { error: 'Dataset mismatch' }, origin);
        const config = body.config === undefined ? undefined : roomConfigSchema.parse(body.config);
        const roomCode = manager.createRoom(config, current);
        recent.push(current);
        roomCreations.set(address, recent);
        return json(response, 201, { roomCode, protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH }, origin);
      } catch {
        return json(response, 400, { error: 'Invalid room request' }, origin);
      }
    }
    return json(response, 404, { error: 'Not found' }, origin);
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES, perMessageDeflate: false });

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const broadcastRoom = (roomCode: string) => {
    for (const [socket, session] of sessions) {
      if (session.roomCode !== roomCode || !session.participantId) continue;
      try {
        send(socket, { type: 'snapshot', snapshot: manager.getSnapshot(roomCode, session.participantId, now()) });
      } catch {
        // The room may have expired between the timer tick and this broadcast.
      }
    }
  };

  const asError = (error: unknown): { code: ErrorCode; message: string } => {
    if (error instanceof RoomError) return { code: error.code, message: error.message };
    return { code: 'INVALID_ACTION', message: error instanceof Error ? error.message : 'Invalid action' };
  };

  sockets.on('connection', (socket: WebSocket, request: IncomingMessage, roomCode: string) => {
    sessions.set(socket, { roomCode, participantId: null, commandTimes: [], alive: true });
    socket.on('pong', () => {
      const session = sessions.get(socket);
      if (session) session.alive = true;
    });
    socket.on('message', (raw: RawData) => {
      const session = sessions.get(socket);
      if (!session) return;
      const current = now();
      session.commandTimes = session.commandTimes.filter((timestamp) => current - timestamp < 10_000);
      if (session.commandTimes.length >= MAX_COMMANDS_PER_10_SECONDS) return send(socket, { type: 'error', code: 'RATE_LIMITED', message: 'Too many commands' });
      session.commandTimes.push(current);
      let command: ClientCommand;
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        command = clientCommandSchema.parse(parsed);
      } catch {
        return send(socket, { type: 'error', code: 'BAD_MESSAGE', message: 'Invalid command' });
      }
      try {
        if (command.type === 'join' || command.type === 'resume') {
          if (session.participantId) throw new RoomError('INVALID_ACTION', 'Connection is already joined');
          if (command.protocolVersion !== PROTOCOL_VERSION) throw new RoomError('PROTOCOL_MISMATCH', 'Protocol version mismatch');
          if (command.dataHash !== ONLINE_DATA_HASH) throw new RoomError('DATA_MISMATCH', 'Dataset hash mismatch');
          const joined = command.type === 'join'
            ? manager.join(roomCode, command.playerName, command.organizationName, current)
            : manager.resume(roomCode, command.resumeToken, current);
          session.participantId = joined.participantId;
          // A participant owns a single live socket: an older tab is detached first so its close never marks the participant offline.
          for (const [otherSocket, otherSession] of sessions) {
            if (otherSocket === socket || otherSession.roomCode !== roomCode || otherSession.participantId !== joined.participantId) continue;
            otherSession.participantId = null;
            send(otherSocket, { type: 'error', code: 'INVALID_ACTION', message: 'This session was resumed from another connection' });
            otherSocket.close();
          }
          send(socket, { type: 'ack', requestId: command.requestId, version: manager.getVersion(roomCode), resumeToken: joined.resumeToken });
          broadcastRoom(roomCode);
          return;
        }
        if (!session.participantId) throw new RoomError('NOT_JOINED', 'Join the room first');
        if (command.type === 'resync') {
          // A client that suspects it fell out of sync gets the whole room again, on its own socket only.
          send(socket, { type: 'ack', requestId: command.requestId, version: manager.getVersion(roomCode) });
          send(socket, { type: 'snapshot', snapshot: manager.getSnapshot(roomCode, session.participantId, current) });
          return;
        }
        manager.execute(roomCode, session.participantId, command, current);
        send(socket, { type: 'ack', requestId: command.requestId, version: manager.getVersion(roomCode) });
        broadcastRoom(roomCode);
      } catch (error) {
        const typed = asError(error);
        send(socket, { type: 'error', requestId: command.requestId, ...typed });
      }
    });
    socket.on('close', () => {
      const session = sessions.get(socket);
      sessions.delete(socket);
      if (session?.participantId) {
        manager.disconnect(session.roomCode, session.participantId, now());
        broadcastRoom(session.roomCode);
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = /^\/rooms\/([A-Z2-9]{8})$/i.exec(url.pathname);
    const roomCode = match?.[1].toUpperCase();
    if (!roomCode || !manager.hasRoom(roomCode) || !isAllowedOrigin(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (webSocket) => sockets.emit('connection', webSocket, request, roomCode));
  });

  const tickTimer = setInterval(() => {
    for (const roomCode of manager.tick(now())) broadcastRoom(roomCode);
  }, 100);
  tickTimer.unref();
  const heartbeatTimer = setInterval(() => {
    for (const [socket, session] of sessions) {
      if (!session.alive) {
        socket.terminate();
        continue;
      }
      session.alive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeatTimer.unref();

  const close = async () => {
    clearInterval(tickTimer);
    clearInterval(heartbeatTimer);
    for (const socket of sessions.keys()) socket.terminate();
    sockets.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  };

  return { server, manager, close, broadcastRoom };
}

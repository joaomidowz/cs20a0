import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { PROTOCOL_VERSION, clientCommandSchema, roomConfigSchema, type ClientCommand, type ErrorCode, type ServerMessage } from '../src/lib/game/online/contracts';
import { advanceFeedCursor, initialDelivery, planBroadcast, type DeliveryState } from './broadcast';
import { ONLINE_DATA_HASH } from './data';
import { RoomError, RoomManager } from './room-manager';
import type { Db } from './db/client';
import type { Mailer } from './auth/mailer';
import { createAuthRoutes } from './http/auth-routes';
import { createCollectionRoutes } from './http/collection-routes';
import { createRoomRoutes } from './http/room-routes';
import { recordMajor } from './collection/seasons';
import { createQueue } from './queue';
import { createPaymentRoutes } from './http/payment-routes';
import type { PaymentsConfig } from './payments/mercadopago';
import { createSlidingLimiter } from './http/rate-limit';
import { MAX_PAYLOAD_BYTES, dispatch, readJsonBody, sendJson, type Route } from './http/router';

const MAX_COMMANDS_PER_10_SECONDS = 40;
const MAX_ROOM_CREATIONS_PER_MINUTE = 10;
/** Bytes still queued on a socket above which a live update is skipped: the next tick sends the state of that moment instead. */
const LIVE_BACKPRESSURE_BYTES = 64 * 1024;

interface Session {
  roomCode: string;
  participantId: string | null;
  commandTimes: number[];
  alive: boolean;
  /** What this connection already received; decides between a snapshot, a live update or nothing. */
  delivery: DeliveryState;
}

export interface OnlineServerOptions {
  allowedOrigins?: string[];
  manager?: RoomManager;
  now?: () => number;
  liveBackpressureBytes?: number;
  /** How many bytes a socket still has queued; injectable so tests can simulate a slow connection. */
  bufferedAmountOf?: (socket: WebSocket) => number;
  /** Accounts and collection need a database; without one the server runs rooms only. */
  db?: Db;
  mailer?: Mailer;
  siteUrl?: string;
  /** Mercado Pago; absent keeps the shop off. */
  payments?: Omit<PaymentsConfig, 'db'>;
}

const json = sendJson;

export function createOnlineServer(options: OnlineServerOptions = {}) {
  const now = options.now ?? Date.now;
  const manager = options.manager ?? new RoomManager(options.db ? {
    // Persistence never blocks the room: the promise is detached and only logged on failure.
    onRunCompleted: (event) => { void recordMajor(options.db!, event, now()).catch((error) => console.error('recordMajor failed', error instanceof Error ? error.message : error)); }
  } : {});
  const liveBackpressureBytes = options.liveBackpressureBytes ?? LIVE_BACKPRESSURE_BYTES;
  const bufferedAmountOf = options.bufferedAmountOf ?? ((socket: WebSocket) => socket.bufferedAmount);
  const allowedOrigins = new Set(options.allowedOrigins ?? ['http://localhost:5173', 'https://cs13a0.com', 'https://www.cs13a0.com']);
  const roomCreations = createSlidingLimiter(MAX_ROOM_CREATIONS_PER_MINUTE, 60_000, now);
  const sessions = new Map<WebSocket, Session>();
  const auth = options.db && options.mailer ? createAuthRoutes({ db: options.db, mailer: options.mailer, siteUrl: options.siteUrl ?? 'http://localhost:5173', now }, now) : null;
  const queue = createQueue(manager, now);
  const httpRoutes: Route[] = [...(auth?.routes ?? []), ...(auth && options.db ? [...createCollectionRoutes(options.db, auth.withAuth), ...createRoomRoutes(options.db, manager, auth.withAuth, queue), ...(options.payments ? createPaymentRoutes({ ...options.payments, db: options.db, now }, auth.withAuth) : [])] : [])];

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
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
        vary: 'origin'
      });
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, rooms: manager.roomCount(), accounts: Boolean(auth), queue: queue.size(), payments: Boolean(auth && options.payments) }, origin);
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
      if (!roomCreations.hit(address)) return json(response, 429, { error: 'Rate limited' }, origin);
      try {
        const body = await readJsonBody(request) as Record<string, unknown>;
        if (body.protocolVersion !== PROTOCOL_VERSION) return json(response, 409, { error: 'Protocol mismatch' }, origin);
        if (body.dataHash !== ONLINE_DATA_HASH) return json(response, 409, { error: 'Dataset mismatch' }, origin);
        const config = body.config === undefined ? undefined : roomConfigSchema.parse(body.config);
        const roomCode = manager.createRoom(config, current);
        return json(response, 201, { roomCode, protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH }, origin);
      } catch {
        return json(response, 400, { error: 'Invalid room request' }, origin);
      }
    }
    const handled = await dispatch(httpRoutes, { request, response, url, origin, address: request.socket.remoteAddress ?? 'unknown', now: now() });
    if (handled) return;
    if (!auth && /^\/(auth|me|collection|packs|lineup|seasons)\b/.test(url.pathname)) return json(response, 503, { ok: false, error: 'ACCOUNTS_DISABLED', message: 'Contas desativadas neste servidor' }, origin);
    return json(response, 404, { error: 'Not found' }, origin);
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES, perMessageDeflate: false });

  const send = (socket: WebSocket, message: ServerMessage): boolean => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  /**
   * Sends one connection what it lacks: a full snapshot when the room state moved (never skipped), a live update when
   * only the live cursor moved, nothing when it is up to date. The delivery state only advances on a successful send,
   * so a live update skipped because the socket is backed up is simply replaced by a newer one on a later tick, and
   * the kill-feed cursor guarantees no round is lost in between.
   */
  const deliver = (socket: WebSocket, session: Session) => {
    if (!session.participantId) return;
    try {
      const versions = manager.getVersions(session.roomCode);
      const plan = planBroadcast(session.delivery, versions, bufferedAmountOf(socket), liveBackpressureBytes);
      if (plan === 'none' || plan === 'skip') return;
      if (plan === 'snapshot') {
        const snapshot = manager.getSnapshot(session.roomCode, session.participantId, now());
        if (!send(socket, { type: 'snapshot', snapshot })) return;
        session.delivery = {
          sentVersion: snapshot.version,
          sentStateVersion: versions.stateVersion,
          feedCursor: advanceFeedCursor(session.delivery.feedCursor, snapshot.tournament?.liveCursor?.primarySeries ?? null)
        };
        return;
      }
      const live = manager.getLiveUpdate(session.roomCode, session.participantId, now(), session.delivery.feedCursor);
      if (!send(socket, { type: 'live', live })) return;
      session.delivery = { ...session.delivery, sentVersion: live.version, feedCursor: advanceFeedCursor(session.delivery.feedCursor, live.cursor.primarySeries) };
    } catch {
      // The room may have expired between the timer tick and this delivery.
    }
  };

  const broadcastRoom = (roomCode: string) => {
    for (const [socket, session] of sessions) {
      if (session.roomCode === roomCode) deliver(socket, session);
    }
  };

  const asError = (error: unknown): { code: ErrorCode; message: string } => {
    if (error instanceof RoomError) return { code: error.code, message: error.message };
    return { code: 'INVALID_ACTION', message: error instanceof Error ? error.message : 'Invalid action' };
  };

  sockets.on('connection', (socket: WebSocket, request: IncomingMessage, roomCode: string) => {
    sessions.set(socket, { roomCode, participantId: null, commandTimes: [], alive: true, delivery: initialDelivery() });
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
            ? manager.join(roomCode, command.playerName, command.organizationName, current, command.lineupTicket)
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
          session.delivery = { ...session.delivery, sentStateVersion: -1 };
          deliver(socket, session);
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
    queue.tick();
    manager.tick(now());
    // Every connection, not only the rooms that changed: a live update skipped earlier goes out once the socket drains.
    for (const [socket, session] of sessions) deliver(socket, session);
  }, 100);
  tickTimer.unref();
  const heartbeatTimer = setInterval(() => {
    roomCreations.prune();
    auth?.prune();
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

  return { server, manager, queue, close, broadcastRoom, httpRoutes, withAuth: auth?.withAuth ?? null };
}

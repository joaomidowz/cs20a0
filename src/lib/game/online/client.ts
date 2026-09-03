import { browser } from '$app/environment';
import { PROTOCOL_VERSION, type ClientCommand, type ErrorCode, type RoomConfig, type RoomSnapshot, type ServerMessage } from './contracts';
import { ONLINE_DATA_HASH } from './dataset';

type ClientCommandInput = ClientCommand extends infer Command
  ? Command extends ClientCommand ? Omit<Command, 'requestId'> : never
  : never;

export type OnlineConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'expired';

/** Client-side error codes layered on top of the server ones. */
export type OnlineClientErrorCode = ErrorCode | 'CONNECTION_FAILED' | 'CONNECTION_LOST' | 'RECONNECT_GAVE_UP' | 'NOT_READY' | 'CREATE_FAILED';

export interface OnlineClientHandlers {
  onConnection: (state: OnlineConnectionState) => void;
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onError: (message: string, code: OnlineClientErrorCode) => void;
}

const tokenKey = (roomCode: string) => `cs13a0:online:resume:${roomCode}`;
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
const RECONNECT_MAX_ATTEMPTS = 8;
/** Errors after which reconnecting cannot help. */
const TERMINAL_CODES: ReadonlySet<ErrorCode> = new Set(['ROOM_NOT_FOUND', 'ROOM_STARTED', 'ROOM_FULL', 'NAME_TAKEN', 'PROTOCOL_MISMATCH', 'DATA_MISMATCH']);

export const isValidRoomCode = (code: string) => /^[A-Z2-9]{8}$/.test(code);

export class OnlineRoomClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private stopped = false;
  private joined = false;

  constructor(
    private readonly serverUrl: string,
    private readonly roomCode: string,
    private readonly identity: { playerName: string; organizationName: string },
    private readonly handlers: OnlineClientHandlers
  ) {}

  connect() {
    if (!browser) return;
    this.stopped = false;
    this.handlers.onConnection(this.joined ? 'reconnecting' : 'connecting');
    const websocketUrl = new URL(`/rooms/${this.roomCode}`, this.serverUrl);
    websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(websocketUrl);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.handlers.onConnection('connected');
      const resumeToken = localStorage.getItem(tokenKey(this.roomCode));
      if (resumeToken) {
        this.sendRaw({ type: 'resume', requestId: this.requestId(), protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, resumeToken });
      } else {
        this.joinWithIdentity();
      }
    });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === 'ack') {
        this.joined = true;
        this.reconnectAttempts = 0;
        if (message.resumeToken) localStorage.setItem(tokenKey(this.roomCode), message.resumeToken);
      } else if (message.type === 'snapshot') {
        this.handlers.onSnapshot(message.snapshot);
      } else if (message.code === 'RESUME_EXPIRED') {
        localStorage.removeItem(tokenKey(this.roomCode));
        this.joined = false;
        this.joinWithIdentity();
      } else if (TERMINAL_CODES.has(message.code)) {
        const wasJoined = this.joined;
        this.stop();
        this.handlers.onError(message.message, message.code);
        this.handlers.onConnection(wasJoined ? 'expired' : 'disconnected');
      } else {
        this.handlers.onError(message.message, message.code);
      }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) {
        this.handlers.onConnection('disconnected');
        return;
      }
      if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
        this.stopped = true;
        this.handlers.onError('Could not reconnect', 'RECONNECT_GAVE_UP');
        this.handlers.onConnection('disconnected');
        return;
      }
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 1.6 ** this.reconnectAttempts);
      this.reconnectAttempts += 1;
      this.handlers.onConnection(this.joined ? 'reconnecting' : 'disconnected');
      if (this.joined) this.handlers.onError('Connection lost', 'CONNECTION_LOST');
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.handlers.onError('Could not connect to the online server', 'CONNECTION_FAILED');
    });
  }

  send(command: ClientCommandInput) {
    this.sendRaw({ ...command, requestId: this.requestId() } as ClientCommand);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private joinWithIdentity() {
    const validIdentity = this.identity.playerName.trim().length >= 2 && this.identity.organizationName.trim().length >= 2;
    if (!validIdentity) {
      // A stale resume token with no identity on hand: let the page ask for a name instead of sending a doomed join.
      this.stop();
      this.handlers.onConnection('expired');
      return;
    }
    this.sendRaw({ type: 'join', requestId: this.requestId(), protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, ...this.identity });
  }

  private requestId() {
    return crypto.randomUUID();
  }

  private sendRaw(command: ClientCommand) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.handlers.onError('The connection is not ready yet', 'NOT_READY');
      return;
    }
    this.socket.send(JSON.stringify(command));
  }
}

export class OnlineRoomCreationError extends Error {
  constructor(readonly code: OnlineClientErrorCode, message: string) {
    super(message);
    this.name = 'OnlineRoomCreationError';
  }
}

/** Resolves true when the room exists, false when the server says it does not; throws when the server is unreachable. */
export async function checkOnlineRoom(serverUrl: string, roomCode: string): Promise<boolean> {
  const response = await fetch(new URL(`/rooms/${roomCode}`, serverUrl));
  if (response.status === 404) return false;
  if (!response.ok) throw new OnlineRoomCreationError('CONNECTION_FAILED', 'Could not reach the online server');
  return true;
}

export async function createOnlineRoom(serverUrl: string, config: RoomConfig): Promise<string> {
  const response = await fetch(new URL('/rooms', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, config })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (response.status === 409) throw new OnlineRoomCreationError('PROTOCOL_MISMATCH', body?.error ?? 'Version mismatch');
    if (response.status === 429) throw new OnlineRoomCreationError('RATE_LIMITED', body?.error ?? 'Rate limited');
    throw new OnlineRoomCreationError('CREATE_FAILED', body?.error ?? 'Could not create the room');
  }
  const result = await response.json() as { roomCode: string };
  return result.roomCode;
}

import { browser } from '$app/environment';
import { PROTOCOL_VERSION, roomConfigSchema, type ClientCommand, type ErrorCode, type LiveUpdate, type RoomConfig, type RoomSnapshot, type ServerMessage } from './contracts';
import { ONLINE_DATA_HASH } from './dataset';

type ClientCommandInput = ClientCommand extends infer Command
  ? Command extends ClientCommand ? Omit<Command, 'requestId'> : never
  : never;

export type OnlineConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'expired';

/** Client-side error codes layered on top of the server ones. */
export type OnlineClientErrorCode = ErrorCode | 'CONNECTION_FAILED' | 'CONNECTION_LOST' | 'RECONNECT_GAVE_UP' | 'NOT_READY' | 'CREATE_FAILED';

export interface OnlineClientHandlers {
  onConnection: (state: OnlineConnectionState) => void;
  /** The whole room: sent on join/resume/resync and on every rare event (participants, config, phase, round closed). */
  onSnapshot: (snapshot: RoomSnapshot) => void;
  /** Only what changes round by round while the tournament runs; never carries history. */
  onLive: (update: LiveUpdate) => void;
  onError: (message: string, code: OnlineClientErrorCode) => void;
}

type RunSnapshot = Pick<RoomSnapshot, 'phase' | 'season'>;

/** True only when an authoritative snapshot moves the room into the draft of another run. */
export function isNewOnlineRun(previous: RunSnapshot | null, next: RunSnapshot): boolean {
  if (!previous || next.phase !== 'draft') return false;
  if (previous.phase === 'completed') return true;
  const seasonKey = (snapshot: RunSnapshot) => snapshot.season ? `${snapshot.season.number}:${snapshot.season.run}` : '';
  return previous.phase !== 'lobby' && seasonKey(previous) !== seasonKey(next);
}

const tokenKey = (roomCode: string) => `cs13a0:online:resume:${roomCode}`;
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
const RECONNECT_MAX_ATTEMPTS = 8;
/** Errors after which reconnecting cannot help. */
const TERMINAL_CODES: ReadonlySet<ErrorCode> = new Set(['ROOM_NOT_FOUND', 'ROOM_STARTED', 'ROOM_FULL', 'NAME_TAKEN', 'PROTOCOL_MISMATCH', 'DATA_MISMATCH']);

export const isValidRoomCode = (code: string) => /^[A-Z2-9]{8}$/.test(code);

const IDENTITY_KEY = 'cs13a0:online:identity';
const CONFIG_KEY = 'cs13a0:online:config';

const readStoredValue = (key: string): string | null => {
  if (!browser) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStoredValue = (key: string, value: string): void => {
  if (!browser) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is optional: online play and reconnection still work for the lifetime of this page.
  }
};

const removeStoredValue = (key: string): void => {
  if (!browser) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Best effort only.
  }
};

const loadResumeToken = (roomCode: string): string | null => {
  const token = readStoredValue(tokenKey(roomCode));
  return token && token.length >= 32 && token.length <= 256 ? token : null;
};

export const hasOnlineResumeToken = (roomCode: string): boolean => Boolean(loadResumeToken(roomCode));

export interface OnlineIdentity {
  playerName: string;
  organizationName: string;
}

const normalizeIdentity = (identity: Partial<OnlineIdentity> | null): OnlineIdentity | null => {
  if (typeof identity?.playerName !== 'string' || typeof identity?.organizationName !== 'string') return null;
  const playerName = identity.playerName.trim().slice(0, 24);
  const organizationName = identity.organizationName.trim().slice(0, 24);
  return playerName.length >= 2 && organizationName.length >= 2 ? { playerName, organizationName } : null;
};

/** Last player/organization names used to host or join a room, so the entry screen comes prefilled. */
export function loadOnlineIdentity(): OnlineIdentity | null {
  try {
    const raw = readStoredValue(IDENTITY_KEY);
    if (!raw) return null;
    return normalizeIdentity(JSON.parse(raw) as Partial<OnlineIdentity> | null);
  } catch {
    return null;
  }
}

export function saveOnlineIdentity(identity: OnlineIdentity) {
  try {
    const normalized = normalizeIdentity(identity);
    if (normalized) writeStoredValue(IDENTITY_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be unavailable (private mode, quota); the cache is a convenience only.
  }
}

/** Last room config the host used, validated against the current schema so stale shapes are ignored. */
export function loadOnlineConfig(): RoomConfig | null {
  try {
    const raw = readStoredValue(CONFIG_KEY);
    if (!raw) return null;
    const result = roomConfigSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function saveOnlineConfig(config: RoomConfig) {
  try {
    const result = roomConfigSchema.safeParse(config);
    if (result.success) writeStoredValue(CONFIG_KEY, JSON.stringify(result.data));
  } catch {
    // Same as above: best effort.
  }
}

export class OnlineRoomClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private stopped = false;
  private joined = false;
  /** Version of the last snapshot or live update applied; an older live update that arrives late is dropped. */
  private lastVersion = 0;

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
      const resumeToken = loadResumeToken(this.roomCode);
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
        if (message.resumeToken) writeStoredValue(tokenKey(this.roomCode), message.resumeToken);
      } else if (message.type === 'snapshot') {
        // A snapshot is always authoritative: it resets the version watermark even after a reconnect.
        this.lastVersion = message.snapshot.version;
        this.handlers.onSnapshot(message.snapshot);
      } else if (message.type === 'live') {
        if (message.live.version < this.lastVersion) return;
        this.lastVersion = message.live.version;
        this.handlers.onLive(message.live);
      } else if (message.type === 'error') {
        if (message.code === 'RESUME_EXPIRED') {
          removeStoredValue(tokenKey(this.roomCode));
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
      }
      // Any other message type comes from a newer server this client does not understand: ignored, not an error.
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

  /** Asks the server for a fresh full snapshot (e.g. a live update arrived before any snapshot on this socket). */
  resync() {
    this.send({ type: 'resync' });
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

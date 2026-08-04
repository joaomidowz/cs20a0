import { browser } from '$app/environment';
import { PROTOCOL_VERSION, type ClientCommand, type RoomConfig, type RoomSnapshot, type ServerMessage } from './contracts';
import { ONLINE_DATA_HASH } from './dataset';

type ClientCommandInput = ClientCommand extends infer Command
  ? Command extends ClientCommand ? Omit<Command, 'requestId'> : never
  : never;

export interface OnlineClientHandlers {
  onConnection: (state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => void;
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onError: (message: string) => void;
}

const tokenKey = (roomCode: string) => `cs13a0:online:resume:${roomCode}`;

export class OnlineRoomClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
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
    this.socket = new WebSocket(websocketUrl);
    this.socket.addEventListener('open', () => {
      this.handlers.onConnection('connected');
      const resumeToken = localStorage.getItem(tokenKey(this.roomCode));
      if (resumeToken) {
        this.sendRaw({ type: 'resume', requestId: this.requestId(), protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, resumeToken });
      } else {
        this.sendRaw({ type: 'join', requestId: this.requestId(), protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, ...this.identity });
      }
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'ack') {
        this.joined = true;
        if (message.resumeToken) localStorage.setItem(tokenKey(this.roomCode), message.resumeToken);
      } else if (message.type === 'snapshot') {
        this.handlers.onSnapshot(message.snapshot);
      } else {
        this.handlers.onError(message.message);
        if (message.code === 'RESUME_EXPIRED') {
          localStorage.removeItem(tokenKey(this.roomCode));
          this.sendRaw({ type: 'join', requestId: this.requestId(), protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, ...this.identity });
        }
      }
    });
    this.socket.addEventListener('close', () => {
      this.handlers.onConnection('disconnected');
      if (!this.stopped) this.reconnectTimer = window.setTimeout(() => this.connect(), 1_500);
    });
    this.socket.addEventListener('error', () => this.handlers.onError('Não foi possível conectar ao servidor online.'));
  }

  send(command: ClientCommandInput) {
    this.sendRaw({ ...command, requestId: this.requestId() } as ClientCommand);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private requestId() {
    return crypto.randomUUID();
  }

  private sendRaw(command: ClientCommand) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.handlers.onError('A conexão ainda não está pronta.');
      return;
    }
    this.socket.send(JSON.stringify(command));
  }
}

export async function createOnlineRoom(serverUrl: string, config: RoomConfig): Promise<string> {
  const response = await fetch(new URL('/rooms', serverUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, dataHash: ONLINE_DATA_HASH, config })
  });
  if (!response.ok) throw new Error('Não foi possível criar a sala.');
  const result = await response.json() as { roomCode: string };
  return result.roomCode;
}

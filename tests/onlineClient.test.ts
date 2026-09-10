import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

import { OnlineRoomClient, isNewOnlineRun, loadOnlineConfig, loadOnlineIdentity, saveOnlineConfig, saveOnlineIdentity } from '../src/lib/game/online/client';
import { DEFAULT_ROOM_CONFIG, type RoomConfig, type RoomSnapshot } from '../src/lib/game/online/contracts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class UnavailableStorage implements Storage {
  get length(): number { throw new Error('storage unavailable'); }
  clear(): void { throw new Error('storage unavailable'); }
  getItem(): string | null { throw new Error('storage unavailable'); }
  key(): string | null { throw new Error('storage unavailable'); }
  removeItem(): void { throw new Error('storage unavailable'); }
  setItem(): void { throw new Error('storage unavailable'); }
}

type SocketListener = (event: { data?: string }) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, SocketListener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {}
  send(value: string) { this.sent.push(value); }
  emit(type: string, event: { data?: string } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('online client cache', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('crypto', { randomUUID: () => 'request-00000001' });
    FakeWebSocket.instances = [];
  });

  it('normalizes valid identity and ignores unusable cached names', () => {
    saveOnlineIdentity({ playerName: '  Joao  ', organizationName: '  Furia  ' });
    expect(loadOnlineIdentity()).toEqual({ playerName: 'Joao', organizationName: 'Furia' });

    localStorage.setItem('cs13a0:online:identity', JSON.stringify({ playerName: ' ', organizationName: 'Org' }));
    expect(loadOnlineIdentity()).toBeNull();
  });

  it('joins normally when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', new UnavailableStorage());

    const client = new OnlineRoomClient('https://online.example', 'ABCDEFGH', {
      playerName: 'Joao', organizationName: 'Furia'
    }, {
      onConnection: () => {},
      onSnapshot: () => {},
      onLive: () => {},
      onError: () => {}
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    expect(() => socket.emit('open')).not.toThrow();
    expect(JSON.parse(socket.sent[0])).toMatchObject({ type: 'join', playerName: 'Joao', organizationName: 'Furia' });
  });

  it('validates cached host config and ignores an invalid replacement', () => {
    const expected: RoomConfig = { ...DEFAULT_ROOM_CONFIG, capacity: 8, seasonRuns: 4 };
    saveOnlineConfig(expected);
    saveOnlineConfig({ ...expected, capacity: 1 } as RoomConfig);
    expect(loadOnlineConfig()).toEqual(expected);

    localStorage.setItem('cs13a0:online:config', '{not-json');
    expect(loadOnlineConfig()).toBeNull();
  });

  it('resumes with a valid token and ignores a malformed cached token', () => {
    const createClient = () => new OnlineRoomClient('https://online.example', 'ABCDEFGH', {
      playerName: 'Joao', organizationName: 'Furia'
    }, { onConnection: () => {}, onSnapshot: () => {}, onLive: () => {}, onError: () => {} });

    localStorage.setItem('cs13a0:online:resume:ABCDEFGH', 'r'.repeat(32));
    createClient().connect();
    FakeWebSocket.instances[0].emit('open');
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toMatchObject({ type: 'resume', resumeToken: 'r'.repeat(32) });

    localStorage.setItem('cs13a0:online:resume:ABCDEFGH', 'short');
    createClient().connect();
    FakeWebSocket.instances[1].emit('open');
    expect(JSON.parse(FakeWebSocket.instances[1].sent[0])).toMatchObject({ type: 'join' });
  });
});

describe('online client live updates', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('crypto', { randomUUID: () => 'request-00000001' });
    FakeWebSocket.instances = [];
  });

  it('applies live updates in version order, drops stale ones and ignores unknown message types', () => {
    const snapshots: number[] = [];
    const lives: number[] = [];
    const errors: string[] = [];
    const client = new OnlineRoomClient('https://online.example', 'ABCDEFGH', { playerName: 'Joao', organizationName: 'Furia' }, {
      onConnection: () => {},
      onSnapshot: (snapshot) => snapshots.push(snapshot.version),
      onLive: (live) => lives.push(live.version),
      onError: (_message, code) => errors.push(code)
    });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open');
    const deliver = (message: unknown) => socket.emit('message', { data: JSON.stringify(message) });
    deliver({ type: 'ack', requestId: 'request-00000001', version: 5, resumeToken: 't'.repeat(40) });
    deliver({ type: 'snapshot', snapshot: { version: 5 } });
    deliver({ type: 'live', live: { version: 7 } });
    deliver({ type: 'live', live: { version: 6 } });
    deliver({ type: 'live', live: { version: 8 } });
    deliver({ type: 'unknown-message', payload: 1 });
    // A later snapshot resets the watermark, so a live update after it applies even with a lower version than before.
    deliver({ type: 'snapshot', snapshot: { version: 9 } });
    deliver({ type: 'live', live: { version: 10 } });
    expect(snapshots).toEqual([5, 9]);
    expect(lives).toEqual([7, 8, 10]);
    expect(errors).toEqual([]);

    client.resync();
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({ type: 'resync', requestId: 'request-00000001' });
  });
});

describe('online run lifecycle', () => {
  const snapshot = (phase: RoomSnapshot['phase'], season: { number: number; run: number } | null) =>
    ({ phase, season }) as RoomSnapshot;

  it('distinguishes a new run from an ordinary reconnect snapshot', () => {
    expect(isNewOnlineRun(snapshot('completed', { number: 1, run: 1 }), snapshot('draft', { number: 1, run: 1 }))).toBe(true);
    expect(isNewOnlineRun(snapshot('swiss', null), snapshot('draft', { number: 1, run: 1 }))).toBe(true);
    expect(isNewOnlineRun(snapshot('draft', { number: 1, run: 1 }), snapshot('draft', { number: 1, run: 1 }))).toBe(false);
  });
});

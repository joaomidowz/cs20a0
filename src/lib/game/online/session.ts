import { get, readonly, writable, type Readable } from 'svelte/store';
import { authFetch } from './account';
import {
  OnlineRoomClient,
  type ClientCommandInput,
  type OnlineClientErrorCode,
  type OnlineClientHandlers,
  type OnlineConnectionState
} from './client';
import { getOnlineServerUrl } from './config';
import type { LiveUpdate, RoomSnapshot } from './contracts';

export interface QueueStatusResponse {
  state: 'idle' | 'waiting' | 'matched';
  waiting: number;
  since: number | null;
  match: OnlineMatch | null;
  closesInMs: number | null;
  pair: boolean;
  left: 'stale' | 'hidden' | null;
}

export interface OnlineMatch {
  roomCode: string;
  lineupTicket: string;
}

export interface OnlineIdentityInput {
  playerName: string;
  organizationName: string;
  lineupTicket?: string;
}

export interface OnlineQueueView extends QueueStatusResponse {
  elapsed: number;
  wanted: boolean;
  failures: number;
  error: string | null;
}

export interface OnlineRoomView {
  code: string;
  snapshot: RoomSnapshot | null;
  live: LiveUpdate | null;
  liveHistory: LiveUpdate[];
  connection: OnlineConnectionState;
  error: { message: string; code: OnlineClientErrorCode } | null;
}

export interface RoomClientLike {
  connect(): void;
  stop(): void;
  send(command: ClientCommandInput): void;
  resync(): void;
}

interface OnlineSessionDependencies {
  now: () => number;
  queueJoin: () => Promise<QueueStatusResponse>;
  queueStatus: () => Promise<QueueStatusResponse>;
  queueLeave: (reason?: 'hidden') => Promise<unknown>;
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  clearInterval: (timer: unknown) => void;
  createRoomClient: (
    serverUrl: string,
    roomCode: string,
    identity: OnlineIdentityInput,
    handlers: OnlineClientHandlers
  ) => RoomClientLike;
}

const idleQueue = (): OnlineQueueView => ({
  state: 'idle',
  waiting: 0,
  since: null,
  match: null,
  closesInMs: null,
  pair: false,
  left: null,
  elapsed: 0,
  wanted: false,
  failures: 0,
  error: null
});

const idleRoom = (): OnlineRoomView => ({
  code: '',
  snapshot: null,
  live: null,
  liveHistory: [],
  connection: 'disconnected',
  error: null
});

const productionDependencies = (): OnlineSessionDependencies => {
  const serverUrl = getOnlineServerUrl();
  return {
    now: Date.now,
    queueJoin: () => authFetch<QueueStatusResponse>(serverUrl, '/queue/join', { body: {} }),
    queueStatus: () => authFetch<QueueStatusResponse>(serverUrl, '/queue/status'),
    queueLeave: (reason) => authFetch(serverUrl, '/queue/leave', { body: reason ? { reason } : {} }),
    setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    clearInterval: (timer) => globalThis.clearInterval(timer as ReturnType<typeof globalThis.setInterval>),
    createRoomClient: (url, code, identity, handlers) => new OnlineRoomClient(url, code, identity, handlers)
  };
};

export function createOnlineSession(dependencies: OnlineSessionDependencies = productionDependencies()) {
  const queueState = writable<OnlineQueueView>(idleQueue());
  const roomState = writable<OnlineRoomView>(idleRoom());
  let queueTimer: unknown | null = null;
  let queueIdentity: OnlineIdentityInput | null = null;
  let roomClient: RoomClientLike | null = null;
  let disposed = false;
  let lastAutoRejoin = 0;

  const stopQueuePolling = () => {
    if (queueTimer === null) return;
    dependencies.clearInterval(queueTimer);
    queueTimer = null;
  };

  const applyQueueStatus = (status: QueueStatusResponse) => {
    const previous = get(queueState);
    queueState.set({
      ...status,
      elapsed: status.since ? Math.max(0, Math.round((dependencies.now() - status.since) / 1_000)) : 0,
      wanted: status.state === 'matched' ? false : previous.wanted,
      failures: 0,
      error: null
    });
  };

  const connectRoom = (roomCode: string, identity: OnlineIdentityInput) => {
    disposed = false;
    const normalizedCode = roomCode.trim().toUpperCase();
    const current = get(roomState);
    if (roomClient && current.code === normalizedCode && current.connection !== 'disconnected' && current.connection !== 'expired') return;
    roomClient?.stop();
    roomState.set({ ...idleRoom(), code: normalizedCode, connection: 'connecting' });
    roomClient = dependencies.createRoomClient(getOnlineServerUrl(), normalizedCode, identity, {
      onConnection: (connection) => {
        if (connection === 'expired') roomClient = null;
        roomState.update((room) => ({ ...room, connection }));
      },
      onSnapshot: (snapshot) => roomState.update((room) => ({ ...room, snapshot, live: null, liveHistory: [], error: null })),
      onLive: (live) => roomState.update((room) => ({ ...room, live, liveHistory: [...room.liveHistory, live].slice(-512) })),
      onError: (message, code) => roomState.update((room) => ({ ...room, error: { message, code } }))
    });
    roomClient.connect();
  };

  const pollQueue = async () => {
    try {
      const status = await dependencies.queueStatus();
      applyQueueStatus(status);
      if (status.state === 'matched' && status.match && queueIdentity) {
        stopQueuePolling();
        const identity = { ...queueIdentity, lineupTicket: status.match.lineupTicket };
        connectRoom(status.match.roomCode, identity);
        queueState.update((queue) => ({ ...queue, wanted: false }));
      } else if (status.state === 'idle' && status.left) {
        stopQueuePolling();
        queueState.update((queue) => ({ ...queue, wanted: false }));
      } else if (status.state === 'idle' && get(queueState).wanted && queueIdentity) {
        const current = dependencies.now();
        if (current - lastAutoRejoin >= 30_000) {
          lastAutoRejoin = current;
          const rejoined = await dependencies.queueJoin();
          applyQueueStatus(rejoined);
          queueState.update((queue) => ({ ...queue, wanted: true }));
        }
      } else if (status.state === 'idle') {
        stopQueuePolling();
      }
    } catch (error) {
      queueState.update((queue) => {
        const failures = queue.failures + 1;
        if (failures >= 30) stopQueuePolling();
        return {
          ...queue,
          failures,
          wanted: failures < 30 && queue.wanted,
          state: failures < 30 ? queue.state : 'idle',
          error: failures < 30 ? null : error instanceof Error ? error.message : 'Could not reach the online server'
        };
      });
    }
  };

  const joinQueue = async (identity: OnlineIdentityInput) => {
    disposed = false;
    queueIdentity = identity;
    const status = await dependencies.queueJoin();
    applyQueueStatus(status);
    queueState.update((queue) => ({ ...queue, wanted: true }));
    if (queueTimer === null) {
      queueTimer = dependencies.setInterval(() => { void pollQueue(); }, 2_000);
    }
  };

  const cancelQueue = async (reason?: 'hidden') => {
    stopQueuePolling();
    queueIdentity = null;
    queueState.set({ ...idleQueue(), left: reason ?? null });
    await dependencies.queueLeave(reason);
  };

  const leaveRoom = () => {
    roomClient?.stop();
    roomClient = null;
    roomState.set(idleRoom());
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (get(queueState).wanted) void cancelQueue();
    else stopQueuePolling();
    leaveRoom();
  };

  return {
    queue: readonly(queueState) as Readable<OnlineQueueView>,
    room: readonly(roomState) as Readable<OnlineRoomView>,
    joinQueue,
    pollQueue,
    cancelQueue,
    connectRoom,
    send: (command: ClientCommandInput) => roomClient?.send(command),
    resync: () => roomClient?.resync(),
    leaveRoom,
    dispose,
    attachView: () => () => {}
  };
}

export const onlineSession = createOnlineSession();
export const queueView = onlineSession.queue;
export const roomView = onlineSession.room;

import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import type { OnlineClientHandlers } from '../src/lib/game/online/client';
import type { LiveUpdate } from '../src/lib/game/online/contracts';
import { createOnlineSession, type QueueStatusResponse, type RoomClientLike } from '../src/lib/game/online/session';

const waiting = (since = 1_000): QueueStatusResponse => ({
  state: 'waiting', waiting: 2, since, match: null, closesInMs: 20_000, pair: true, left: null
});

describe('persistent online session', () => {
  it('keeps one queue heartbeat until cancellation', async () => {
    const queueStatus = vi.fn(async () => waiting());
    const queueJoin = vi.fn(async () => waiting());
    const queueLeave = vi.fn(async () => undefined);
    const intervals: Array<() => void> = [];
    const session = createOnlineSession({
      now: () => 2_000,
      queueJoin,
      queueStatus,
      queueLeave,
      setInterval: (callback) => { intervals.push(callback); return intervals.length; },
      clearInterval: vi.fn(),
      createRoomClient: vi.fn()
    });

    await session.joinQueue({ playerName: 'Joao', organizationName: 'Furia' });
    await session.joinQueue({ playerName: 'Joao', organizationName: 'Furia' });

    expect(intervals).toHaveLength(1);
    expect(queueLeave).not.toHaveBeenCalled();
    await intervals[0]();
    expect(queueStatus).toHaveBeenCalledOnce();
    expect(get(session.queue)).toMatchObject({ state: 'waiting', waiting: 2 });

    await session.cancelQueue();
    expect(queueLeave).toHaveBeenCalledOnce();
    expect(get(session.queue).state).toBe('idle');
  });

  it('turns a queue match into one persistent room connection', async () => {
    let deliverStatus: QueueStatusResponse = waiting();
    const handlers: OnlineClientHandlers[] = [];
    const roomClient: RoomClientLike = { connect: vi.fn(), stop: vi.fn(), send: vi.fn(), resync: vi.fn() };
    const intervals: Array<() => void> = [];
    const session = createOnlineSession({
      now: () => 2_000,
      queueJoin: vi.fn(async () => waiting()),
      queueStatus: vi.fn(async () => deliverStatus),
      queueLeave: vi.fn(async () => undefined),
      setInterval: (callback) => { intervals.push(callback); return intervals.length; },
      clearInterval: vi.fn(),
      createRoomClient: (_serverUrl, _roomCode, _identity, roomHandlers) => { handlers.push(roomHandlers); return roomClient; }
    });

    await session.joinQueue({ playerName: 'Joao', organizationName: 'Furia' });
    deliverStatus = { state: 'matched', waiting: 0, since: null, match: { roomCode: 'ABCDEFGH', lineupTicket: 'ticket' }, closesInMs: null, pair: false, left: null };
    await intervals[0]();

    expect(roomClient.connect).toHaveBeenCalledOnce();
    expect(get(session.room).code).toBe('ABCDEFGH');
    session.connectRoom('ABCDEFGH', { playerName: 'Joao', organizationName: 'Furia' });
    expect(roomClient.connect).toHaveBeenCalledOnce();

    session.dispose();
    expect(roomClient.stop).toHaveBeenCalledOnce();
    expect(handlers).toHaveLength(1);
  });

  it('keeps the room alive when views attach and detach', () => {
    const roomClient: RoomClientLike = { connect: vi.fn(), stop: vi.fn(), send: vi.fn(), resync: vi.fn() };
    const session = createOnlineSession({
      now: Date.now,
      queueJoin: vi.fn(), queueStatus: vi.fn(), queueLeave: vi.fn(),
      setInterval: vi.fn(), clearInterval: vi.fn(),
      createRoomClient: () => roomClient
    });

    session.connectRoom('ABCDEFGH', { playerName: 'Joao', organizationName: 'Furia' });
    const detach = session.attachView();
    detach();

    expect(roomClient.stop).not.toHaveBeenCalled();
    session.leaveRoom();
    expect(roomClient.stop).toHaveBeenCalledOnce();
  });

  it('buffers live updates while the play view is detached', () => {
    let handlers: OnlineClientHandlers | null = null;
    const session = createOnlineSession({
      now: Date.now,
      queueJoin: vi.fn(), queueStatus: vi.fn(), queueLeave: vi.fn(),
      setInterval: vi.fn(), clearInterval: vi.fn(),
      createRoomClient: (_url, _code, _identity, nextHandlers) => {
        handlers = nextHandlers;
        return { connect: vi.fn(), stop: vi.fn(), send: vi.fn(), resync: vi.fn() };
      }
    });

    session.connectRoom('ABCDEFGH', { playerName: 'Joao', organizationName: 'Furia' });
    handlers!.onLive({ version: 4 } as LiveUpdate);
    handlers!.onLive({ version: 5 } as LiveUpdate);

    expect(get(session.room).liveHistory.map((update) => update.version)).toEqual([4, 5]);
  });
});

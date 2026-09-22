// tests/presence.test.ts
// Indicador "online": a janela de last_seen_at contra o Postgres local (pula sem TEST_DATABASE_URL), os baldes
// playing/lobby/final do RoomManager e o poller lento do chip no cliente.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { DEFAULT_ROOM_CONFIG } from '../src/lib/game/online/contracts';
import { clearPresence, presenceView, startPresencePolling, stopPresencePolling } from '../src/lib/game/online/presence';
import type { authFetch } from '../src/lib/game/online/account';
import { onlineUserCount, PRESENCE_WINDOW_SECONDS } from '../server/auth/service';
import { RoomManager } from '../server/room-manager';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('onlineUserCount (Postgres)', () => {
  let db: Db;
  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_presence');
    await runMigrations(db);
    const [now] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('agora@example.com', now()) RETURNING id`);
    const [old] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('antigo@example.com', now()) RETURNING id`);
    await db.query(`INSERT INTO users (email) VALUES ('nunca@example.com')`);
    await db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [now.id]);
    await db.query(`UPDATE users SET last_seen_at = now() - interval '10 minutes' WHERE id = $1`, [old.id]);
  });
  afterAll(async () => { await db?.close(); });

  it('conta só quem fez request autenticado dentro da janela', async () => {
    expect(await onlineUserCount(db, PRESENCE_WINDOW_SECONDS)).toBe(1);
    expect(await onlineUserCount(db, 3600)).toBe(2);
    expect(await onlineUserCount(db, 60)).toBe(1);
  });
});

describe('presenceBreakdown (RoomManager)', () => {
  it('conta só conectados: lobby com quem espera, jogo e final separados, sala completa fora', () => {
    const manager = new RoomManager();
    const startedAt = Date.UTC(2026, 8, 22, 12);
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, simulationSpeed: 'ultra' }, startedAt);
    const host = manager.join(code, 'Host player', 'Host org', startedAt);
    manager.join(code, 'Guest player', 'Guest org', startedAt + 1);
    expect(manager.presenceBreakdown()).toEqual({ playing: 0, lobby: 2, final: 0 });

    manager.disconnect(code, host.participantId, startedAt + 2);
    expect(manager.presenceBreakdown()).toEqual({ playing: 0, lobby: 1, final: 0 });

    // Salas em jogo: a rodada corrente decide entre playing e final; completas não contam.
    const rooms = (manager as unknown as { rooms: Map<string, { phase: string; engine: unknown }> }).rooms;
    const room = rooms.get(code)!;
    room.phase = 'swiss';
    room.engine = { rounds: [{ phase: 'swiss', complete: false }] };
    expect(manager.presenceBreakdown()).toEqual({ playing: 1, lobby: 0, final: 0 });
    room.engine = { rounds: [{ phase: 'final', complete: false }] };
    expect(manager.presenceBreakdown()).toEqual({ playing: 0, lobby: 0, final: 1 });
    room.phase = 'completed';
    expect(manager.presenceBreakdown()).toEqual({ playing: 0, lobby: 0, final: 0 });
  });
});

describe('poller do chip (cliente)', () => {
  it('busca na hora zero, refresca a cada tick e para no stop', async () => {
    vi.useFakeTimers();
    clearPresence();
    const fetcher = vi.fn(async () => ({ online: 3, playing: 1, lobby: 2, final: 0 }));
    startPresencePolling('http://x', 30_000, fetcher as unknown as typeof authFetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(get(presenceView)).toEqual({ online: 3, playing: 1, lobby: 2, final: 0 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    stopPresencePolling();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('falha mantêm o último retrato; quem assiste o chip continua "online" porque o poll é autenticado', async () => {
    vi.useFakeTimers();
    clearPresence();
    const failing = vi.fn(async () => { throw new Error('down'); });
    startPresencePolling('http://x', 30_000, failing as unknown as typeof authFetch);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(presenceView)).toBeNull();
    stopPresencePolling();
    vi.useRealTimers();
  });
});

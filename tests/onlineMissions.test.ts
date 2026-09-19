// tests/onlineMissions.test.ts
// Missões contra o Postgres local: progresso por run, run duplicado, claim duplo e sequência solo. Pulado sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db/client';
import type { RunCompletedEvent } from '../server/room-manager';
import { createTestDb } from './helpers/testDb';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('missões (Postgres)', () => {
  let db: Db;
  let userId = '';
  const now = Date.UTC(2026, 8, 19, 15);
  const lineup = ['device-2016', 'dupreeh-2016', 'xyp9x-2016', 'karrigan-2016', 'kjaerbye-2016'].map((playerId) => ({ playerId, selectedSlotRole: 'rifler' as const }));
  const event = (seed: string, patch: Partial<RunCompletedEvent> = {}, entry: Partial<RunCompletedEvent['entries'][number]> = {}): RunCompletedEvent => ({
    roomCode: 'MISSIONS', seed, runNumber: 1, lobbySize: 3, competitive: true, field: 'random', awards: null,
    entries: [{ userId, participantId: 'p1', organizationName: 'Org', placement: 'placement5to8', champion: false, lineup, starPlayerId: null, matches: [], stats: [], opponents: [], ownPower: 80, seriesLost: 1, lineupIds: lineup.map((pick) => pick.playerId), ...entry }],
    ...patch
  });
  const progress = async (missionId: string) => (await db.query<{ progress: number }>('SELECT progress FROM mission_progress WHERE user_id = $1 AND mission_id = $2', [userId, missionId]))[0]?.progress ?? 0;

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_missions');
    await runMigrations(db);
    [{ id: userId }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('missions@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id) VALUES ($1)', [userId]);
  });
  afterAll(async () => { await db?.close(); });

  it('run competitivo avança as online uma vez só, mesmo repetido', async () => {
    const { recordMajor } = await import('../server/collection/seasons');
    await recordMajor(db, event('c1'), now);
    await recordMajor(db, event('c1'), now);
    expect(await progress('daily_play_1')).toBe(1);
    expect(await progress('daily_play_3')).toBe(1);
    expect(await progress('solo_streak_2')).toBe(0);
    await recordMajor(db, event('c2', {}, { champion: true, placement: 'placementChampion' }), now + 1_000);
    expect(await progress('daily_play_3')).toBe(2);
    expect(await progress('daily_play_1')).toBe(1);
    expect(await progress('weekly_win_1')).toBe(1);
  });

  it('resgata uma vez: coins pelo ledger e claim duplo recusado', async () => {
    const { claimMission, listMissions } = await import('../server/collection/missions');
    const [before] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    const result = await claimMission(db, userId, 'daily_play_1', now + 2_000);
    expect(result.wallet).toBe(before.coins + 150);
    await expect(claimMission(db, userId, 'daily_play_1', now + 3_000)).rejects.toMatchObject({ code: 'MISSION_CLAIMED' });
    await expect(claimMission(db, userId, 'daily_play_3', now + 3_000)).rejects.toMatchObject({ code: 'MISSION_INCOMPLETE' });
    await expect(claimMission(db, userId, 'nope', now)).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    const ledger = await db.query<{ delta: number }>(`SELECT delta FROM ledger WHERE user_id = $1 AND reason = 'mission_reward'`, [userId]);
    expect(ledger).toEqual([{ delta: 150 }]);
    const view = await listMissions(db, userId, now + 3_000);
    expect(view.missions.find((mission) => mission.id === 'daily_play_1')).toMatchObject({ claimed: true, progress: 1 });
    // No dia seguinte a diária volta a zero.
    const tomorrow = await listMissions(db, userId, now + 86_400_000);
    expect(tomorrow.missions.find((mission) => mission.id === 'daily_play_1')).toMatchObject({ claimed: false, progress: 0 });
  });

  it('solo: Major dos Campeões, 13 a 0 e sequência que zera ao perder', async () => {
    const { recordMajor } = await import('../server/collection/seasons');
    const solo = { competitive: false, lobbySize: 1 } as const;
    const title = { champion: true, placement: 'placementChampion', seriesLost: 0 };
    await recordMajor(db, event('s1', { ...solo, field: 'champions' }, title), now + 10_000);
    expect(await progress('solo_champions')).toBe(1);
    expect(await progress('solo_flawless')).toBe(1);
    expect(await progress('solo_streak_2')).toBe(1);
    expect(await progress('daily_play_3')).toBe(2);
    await recordMajor(db, event('s2', solo, { ...title, seriesLost: 1 }), now + 11_000);
    expect(await progress('solo_streak_2')).toBe(2);
    await recordMajor(db, event('s3', solo), now + 12_000);
    await recordMajor(db, event('s4', solo, title), now + 13_000);
    expect(await progress('solo_streak_3')).toBe(2);
    const [streak] = await db.query<{ current: number; best: number }>('SELECT current, best FROM solo_streaks WHERE user_id = $1', [userId]);
    expect(streak).toEqual({ current: 1, best: 2 });
  });

  it('missão com sobre grátis soma aos sobres do dia', async () => {
    const { claimMission } = await import('../server/collection/missions');
    const { ensureActiveSeason } = await import('../server/collection/seasons');
    const seasonId = await db.tx((tx) => ensureActiveSeason(tx, now));
    await db.query(`INSERT INTO mission_progress (user_id, mission_id, period_key, progress) VALUES ($1, 'season_win_5', $2, 5) ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = 5`, [userId, `s:${seasonId}`]);
    const result = await claimMission(db, userId, 'season_win_5', now + 20_000);
    expect(result).toMatchObject({ coins: 3000, packs: 2 });
    const [grant] = await db.query<{ granted: number }>(`SELECT granted FROM pack_grants WHERE user_id = $1`, [userId]);
    expect(grant.granted).toBe(4);
  });
});

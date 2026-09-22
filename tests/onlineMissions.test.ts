// tests/onlineMissions.test.ts
// Missões contra o Postgres local: progresso por run, run duplicado, claim duplo, sequência solo diária,
// lineups distintas, baús abertos e o fechamento da season com prêmios do 1º ao 16º. Pulado sem TEST_DATABASE_URL.
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
    expect(result.wallet).toBe(before.coins + 100);
    await expect(claimMission(db, userId, 'daily_play_1', now + 3_000)).rejects.toMatchObject({ code: 'MISSION_CLAIMED' });
    await expect(claimMission(db, userId, 'daily_play_3', now + 3_000)).rejects.toMatchObject({ code: 'MISSION_INCOMPLETE' });
    await expect(claimMission(db, userId, 'nope', now)).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    const ledger = await db.query<{ delta: number }>(`SELECT delta FROM ledger WHERE user_id = $1 AND reason = 'mission_reward'`, [userId]);
    expect(ledger).toEqual([{ delta: 100 }]);
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
    expect(result).toMatchObject({ coins: 2100, packs: 2 });
    const [grant] = await db.query<{ granted: number }>(`SELECT granted FROM pack_grants WHERE user_id = $1`, [userId]);
    expect(grant.granted).toBe(5);
  });

  it('solo agora é diário: paga o triplo e nasce de novo no dia seguinte', async () => {
    const { claimMission, listMissions } = await import('../server/collection/missions');
    const [before] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect((await listMissions(db, userId, now + 14_000)).missions.find((mission) => mission.id === 'solo_champions')).toMatchObject({ progress: 1, coins: 1680 });
    const claimed = await claimMission(db, userId, 'solo_champions', now + 14_000);
    expect(claimed.wallet).toBe(before.coins + 1680);
    const tomorrow = now + 86_400_000;
    expect((await listMissions(db, userId, tomorrow + 14_000)).missions.find((mission) => mission.id === 'solo_champions')).toMatchObject({ claimed: false, progress: 0 });
    await expect(claimMission(db, userId, 'solo_champions', tomorrow + 14_000)).rejects.toMatchObject({ code: 'MISSION_INCOMPLETE' });
  });

  it('diária de lineups: só lineups distintas do dia somam, solo e competitivo juntos', async () => {
    const { recordMajor } = await import('../server/collection/seasons');
    const { claimMission } = await import('../server/collection/missions');
    const swap = (from: string, to: string) => lineup.map((pick) => (pick.playerId === from ? to : pick.playerId));
    // Todos os runs anteriores usaram a lineup base: a primeira variante leva o distinct a 2.
    await recordMajor(db, event('c3', {}, { lineupIds: swap('kjaerbye-2016', 'coldzera-2017') }), now + 21_000);
    expect(await progress('daily_lineups_3')).toBe(2);
    await recordMajor(db, event('c4', {}, { lineupIds: swap('kjaerbye-2016', 'coldzera-2017') }), now + 22_000);
    expect(await progress('daily_lineups_3')).toBe(2);
    await recordMajor(db, event('c5', {}, { lineupIds: swap('device-2016', 'fallen-2016') }), now + 23_000);
    expect(await progress('daily_lineups_3')).toBe(3);
    expect(await claimMission(db, userId, 'daily_lineups_3', now + 24_000)).toMatchObject({ coins: 300 });
  });

  it('diária de baús: grátis, diário e comprado somam no mesmo contador, com teto no alvo', async () => {
    const { buyPack, openDailyPack, openFreePack } = await import('../server/collection/service');
    const { claimMission } = await import('../server/collection/missions');
    for (let i = 0; i < 3; i += 1) await openDailyPack(db, userId, now + 30_000);
    expect(await progress('daily_packs_5')).toBe(3);
    await openFreePack(db, userId, 'prata', now + 31_000);
    expect(await progress('daily_packs_5')).toBe(4);
    await openFreePack(db, userId, 'ouro', now + 32_000);
    expect(await progress('daily_packs_5')).toBe(5);
    expect(await claimMission(db, userId, 'daily_packs_5', now + 33_000)).toMatchObject({ coins: 150 });
    // Comprado também conta, mas o progresso fica travado no alvo depois de completo.
    await buyPack(db, userId, 'prata', now + 34_000);
    expect(await progress('daily_packs_5')).toBe(5);
  });

  it('fechamento da season: prêmios do 1º ao 16º, medalhas por faixa e nada pago duas vezes', async () => {
    const { closeFinishedSeasons } = await import('../server/collection/seasons');
    const [season] = await db.query<{ id: number }>(`INSERT INTO seasons (month, starts_at, ends_at) VALUES ('2026-08-01', '2026-08-01', '2026-08-31T23:59:59Z') RETURNING id`);
    for (let rank = 1; rank <= 16; rank += 1) {
      const [user] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ($1, now()) RETURNING id`, [`close${rank}@example.com`]);
      await db.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);
      await db.query('INSERT INTO season_standings (season_id, user_id, points, majors_played) VALUES ($1, $2, $3, 5)', [season.id, user.id, 200 - rank]);
    }
    const closed = await closeFinishedSeasons(db, Date.UTC(2026, 8, 1, 12));
    expect(closed).toEqual([expect.objectContaining({ seasonId: season.id, awarded: 16 })]);
    const prizes = await db.query<{ delta: number }>(`SELECT delta FROM ledger WHERE reason = 'season_prize' ORDER BY delta DESC, ref_id`);
    expect(prizes.map((row) => row.delta)).toEqual([150_000, 100_000, 75_000, 60_000, 45_000, 45_000, 45_000, 45_000, 30_000, 30_000, 30_000, 30_000, 20_000, 20_000, 20_000, 20_000]);
    const medals = await db.query<{ kind: string; count: string }>(`SELECT kind, count(*)::text AS count FROM awards WHERE season_id = $1 GROUP BY kind ORDER BY kind`, [season.id]);
    expect(medals).toEqual([
      { kind: 'season_champion', count: '1' },
      { kind: 'season_third', count: '1' },
      { kind: 'season_top12', count: '4' },
      { kind: 'season_top16', count: '4' },
      { kind: 'season_top8', count: '5' },
      { kind: 'season_vice', count: '1' }
    ]);
    await expect(closeFinishedSeasons(db, Date.UTC(2026, 8, 1, 12))).resolves.toEqual([]);
    const [total] = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM ledger WHERE reason = 'season_prize'`);
    expect(total.count).toBe('16');
  });
});

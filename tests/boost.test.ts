// tests/boost.test.ts
// Boost de farm: o simulador puro (determinístico por seed, coins de solo pela metade) e, contra o Postgres local
// (pula sem TEST_DATABASE_URL), o gate diário, o extra pago e a garantia de ZERO pontos na temporada.
import { beforeAll, describe, expect, it } from 'vitest';
import { matchReward } from '../src/lib/game/online/collection-rules';
import { collectionTeams, collectionPlayerById } from '../src/lib/game/online/collection-pool';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import type { Db } from '../server/db/client';
import { simulateBoostRun, type BoostRunOutcome } from '../server/collection/boost';
import type { PreparedLineup } from '../server/room-manager';
import { createTestDb } from './helpers/testDb';

const lineupIds = ['device-2016', 'dupreeh-2016', 'xyp9x-2016', 'karrigan-2016', 'kjaerbye-2016'];
const prepared: PreparedLineup = {
  userId: 'user-1',
  lineup: lineupIds.map((playerId) => ({ playerId, selectedSlotRole: 'rifler' as const })),
  style: 'balanced',
  starPlayerId: null,
  coachId: null,
  mapPreferences: [...getDefaultMapSelection(lineupIds.map((id) => collectionPlayerById.get(id)!).filter(Boolean), collectionTeams)]
};

const PLACEMENTS = ['placementChampion', 'placementRunnerUp', 'placement3to4', 'placement5to8', 'placementStage3'];

describe('simulateBoostRun (puro)', () => {
  it('resolve uma major solo completa, determinística por seed e com coins de solo (metade)', () => {
    const a: BoostRunOutcome = simulateBoostRun(prepared, 'random', 'boost-seed-1');
    const b: BoostRunOutcome = simulateBoostRun(prepared, 'random', 'boost-seed-1');
    expect(b.entry.placement).toBe(a.entry.placement);
    expect(b.entry.champion).toBe(a.entry.champion);
    expect(PLACEMENTS).toContain(a.entry.placement);
    expect(a.entry.userId).toBe('user-1');
    expect(a.entry.seriesLost + a.entry.matches.filter((series) => series.winnerId === a.entry.participantId).length).toBe(a.entry.matches.length);
    expect(a.entry.stats.length).toBeGreaterThan(0);
    // Coins de solo = metade do ranqueado, sempre.
    expect(matchReward(a.entry.placement, false)).toBe(Math.floor(matchReward(a.entry.placement, true) / 2));
  }, 30_000);

  it('campo "champions" também resolve de ponta a ponta', () => {
    const outcome = simulateBoostRun(prepared, 'champions', 'boost-seed-2');
    expect(PLACEMENTS).toContain(outcome.placement);
    expect(outcome.entry.lineupIds).toEqual(lineupIds);
  }, 30_000);
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('runBoost (Postgres)', () => {
  let db: Db;
  let walletOf: (userId: string) => Promise<number>;
  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_boost');
    await runMigrations(db);
    await db.query(`INSERT INTO users (email, verified_at) VALUES ('boost@example.com', now()), ('boost2@example.com', now())`);
    await db.query(`INSERT INTO wallets (user_id) SELECT id FROM users`);
    walletOf = async (userId: string) => (await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0].coins;
  });

  it('ativa uma vez por dia: 10 runs sem ponto nenhum, recusa a segunda e cobra o extra uma vez', async () => {
    const { runBoost, boostState } = await import('../server/collection/boost');
    const now = Date.UTC(2026, 8, 22, 18);
    const [user] = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'boost@example.com'`);
    const before = await walletOf(user.id);
    const summary = await runBoost(db, user.id, { ...prepared, userId: user.id }, 'random', false, now);
    expect(summary.runs).toBe(10);
    expect(summary.coins).toBeGreaterThan(0);
    expect((await walletOf(user.id)) - before).toBeGreaterThanOrEqual(summary.coins);
    const majors = await db.query<{ ranked: boolean; points: number; counted: boolean }>('SELECT ranked, points, counted FROM majors WHERE user_id = $1', [user.id]);
    expect(majors).toHaveLength(10);
    expect(majors.every((row) => !row.ranked && row.points === 0)).toBe(true);
    // Zero pontos: a standings existe (o recordMajor grava) mas zerada — o ladder não vê o boost.
    const [standings] = await db.query<{ points: number }>('SELECT points FROM season_standings WHERE user_id = $1', [user.id]);
    expect(standings?.points ?? 0).toBe(0);
    // Segunda ativação no mesmo dia: recusada sem cobrar nem rodar de novo.
    await expect(runBoost(db, user.id, { ...prepared, userId: user.id }, 'random', false, now)).rejects.toMatchObject({ code: 'BOOST_ALREADY_USED' });
    expect((await db.query<{ id: string }>('SELECT id FROM majors WHERE user_id = $1', [user.id])).length).toBe(10);

    // O extra é por dia: +10 runs, 3.000 coins de purchase no ledger.
    const [user2] = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'boost2@example.com'`);
    const before2 = await walletOf(user2.id);
    const summary2 = await runBoost(db, user2.id, { ...prepared, userId: user2.id }, 'champions', true, now);
    expect(summary2.runs).toBe(20);
    const [extra] = await db.query<{ delta: number; ref_id: string }>(`SELECT delta, ref_id FROM ledger WHERE user_id = $1 AND reason = 'purchase'`, [user2.id]);
    expect(extra).toMatchObject({ delta: -3000 });
    expect((await walletOf(user2.id)) - before2).toBe(summary2.coins - 3000);
    const state = await boostState(db, user2.id, now);
    expect(state).toMatchObject({ activated: true, runs: 20, extraPrice: 3000 });
  }, 120_000);
});

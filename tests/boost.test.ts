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
    await db.query(`INSERT INTO users (email, verified_at) VALUES ('boost@example.com', now())`);
    await db.query(`INSERT INTO wallets (user_id) SELECT id FROM users`);
    walletOf = async (userId: string) => (await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0].coins;
  });

  it('item consumível: sem estoque recusa, compra cobra 4.5k, run consome 1 item por 10 majors sem ponto e o teto diário segura', async () => {
    const { runBoost, boostState, buyBoost } = await import('../server/collection/boost');
    const now = Date.UTC(2026, 8, 22, 18);
    const [user] = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'boost@example.com'`);
    const lineup = { ...prepared, userId: user.id };
    // Sem estoque: recusa antes de simular qualquer coisa.
    await expect(runBoost(db, user.id, lineup, 'random', now)).rejects.toMatchObject({ code: 'NO_BOOST_STOCK' });
    // Compra 1 item: -4.500 no ledger, estoque 1.
    const before = await walletOf(user.id);
    const bought = await buyBoost(db, user.id, 1, now);
    expect(bought.stock).toBe(1);
    expect(await walletOf(user.id)).toBe(before - 4500);
    await expect(buyBoost(db, user.id, 0, now)).rejects.toMatchObject({ code: 'BAD_QUANTITY' });
    // Consome o item: 10 majors solo, coins pela metade, ZERO pontos, estoque volta a 0.
    const summary = await runBoost(db, user.id, lineup, 'random', now);
    expect(summary.runs).toBe(10);
    expect(summary.coins).toBeGreaterThan(0);
    expect(summary.stock).toBe(0);
    expect(await walletOf(user.id)).toBe(before - 4500 + summary.coins);
    const majors = await db.query<{ ranked: boolean; points: number }>('SELECT ranked, points FROM majors WHERE user_id = $1', [user.id]);
    expect(majors).toHaveLength(10);
    expect(majors.every((row) => !row.ranked && row.points === 0)).toBe(true);
    const [standings] = await db.query<{ points: number }>('SELECT points FROM season_standings WHERE user_id = $1', [user.id]);
    expect(standings?.points ?? 0).toBe(0);
    // Teto diário de USO (30 runs): compra mais 2 itens (20 runs), os dois passam; o 4º item esbarra no teto.
    for (let item = 0; item < 2; item += 1) {
      await buyBoost(db, user.id, 1, now);
      await runBoost(db, user.id, lineup, 'random', now);
    }
    await buyBoost(db, user.id, 1, now);
    await expect(runBoost(db, user.id, lineup, 'random', now)).rejects.toMatchObject({ code: 'BOOST_DAILY_CAP' });
    const state = await boostState(db, user.id, now);
    expect(state).toMatchObject({ stock: 1, runsToday: 30, dailyCap: 30, price: 4500, runsPerItem: 10 });
    // Em outro dia o teto zera.
    const tomorrow = now + 24 * 60 * 60_000;
    const nextDay = await runBoost(db, user.id, lineup, 'random', tomorrow);
    expect(nextDay.runs).toBe(10);
  }, 180_000);
});

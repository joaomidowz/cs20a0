// tests/onlineCollection.test.ts
// Pacotes diários, compra, venda e lineup pela API, contra o Postgres local. Pulado sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOnlineServer } from '../server/app';
import { createDevMailer } from '../server/auth/mailer';
import { playerById } from '../server/data';
import { collectionCoachById, collectionPlayerById } from '../src/lib/game/online/collection-pool';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';
import { runMigrations } from '../server/db/migrations';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
import { coachSellValue, coinValue, sellValue } from '../src/lib/game/online/collection-rules';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('coleção pela API (Postgres)', () => {
  let db: Db;
  let baseUrl = '';
  let close: () => Promise<void> = async () => {};
  let clock = Date.UTC(2026, 8, 18, 15);
  let token = '';

  const call = async (path: string, body?: unknown, method?: string) => {
    const response = await fetch(`${baseUrl}${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };

  beforeAll(async () => {
    db = await createTestDb(url!, 'test_collection');
    await runMigrations(db);
    const app = createOnlineServer({ allowedOrigins: ['http://localhost:5173'], now: () => clock, db, mailer: createDevMailer(), siteUrl: 'http://localhost:5173' });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    close = app.close;
    const requested = await (await fetch(`${baseUrl}/auth/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'collector@example.com' }) })).json();
    const magic = new URL(requested.devLink).searchParams.get('token')!;
    const verified = await (await fetch(`${baseUrl}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: magic }) })).json();
    token = verified.sessionToken;
  });

  afterAll(async () => { await close(); await db?.close(); });

  it('dá dois pacotes por dia, recusa o terceiro e libera no dia seguinte', async () => {
    const first = await call('/packs/open', {});
    expect(first.status).toBe(200);
    expect(first.body.players).toHaveLength(3);
    const second = await call('/packs/open', {});
    expect(second.status).toBe(200);
    expect(second.body.seed).not.toBe(first.body.seed);
    const third = await call('/packs/open', {});
    expect(third.status).toBe(409);
    expect(third.body.error).toBe('NO_PACKS_LEFT');
    const collection = await call('/collection');
    expect(collection.body.count).toBe(6 - collection.body.players.filter(() => false).length - (first.body.duplicates.length + second.body.duplicates.length));
    expect(collection.body.packsToday).toEqual({ granted: 2, opened: 2 });
    clock += 24 * 60 * 60_000;
    expect((await call('/packs/open', {})).status).toBe(200);
  });

  it('venda paga SELL_RATIO e some da coleção; comprar sem coins dá 402; comprar com coins funciona', async () => {
    const before = await call('/collection');
    const playerId = before.body.players[0].playerId as string;
    const sold = await call('/collection/sell', { playerId });
    expect(sold.status).toBe(200);
    const soldCoach = collectionCoachById.get(playerId);
    expect(sold.body.coins).toBe(soldCoach ? coachSellValue(soldCoach) : sellValue(collectionPlayerById.get(playerId)!));
    expect((await call('/collection/sell', { playerId })).status).toBe(404);
    // Welcome coins pay for one gold pack and a bit; the fourth purchase in a row runs out.
    const [start] = await db.query<{ coins: number }>('SELECT coins FROM wallets');
    expect(start.coins).toBeGreaterThanOrEqual(10_000);
    await db.query('UPDATE wallets SET coins = 3000');
    expect((await call('/packs/buy', { tier: 'ouro' })).status).toBe(402);
    await db.query('UPDATE wallets SET coins = coins + 5000');
    const bought = await call('/packs/buy', { tier: 'era', year: 2014 });
    expect(bought.status).toBe(200);
    const yearOf = (id: string) => collectionPlayerById.get(id)?.year ?? collectionCoachById.get(id)?.year;
    expect(bought.body.players.every((id: string) => yearOf(id) === 2014)).toBe(true);
    const ledger = await db.query<{ reason: string; delta: number }>('SELECT reason, delta FROM ledger ORDER BY id');
    expect(ledger.some((row) => row.reason === 'buy_pack' && row.delta === -2000)).toBe(true);
    expect(ledger.some((row) => row.reason === 'sell')).toBe(true);
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets');
    expect(wallet.coins).toBeGreaterThanOrEqual(0);
  });

  it('lineup exige cinco cartas próprias e devolve se o star vale', async () => {
    await db.query(`INSERT INTO ledger (user_id, delta, reason) SELECT id, 20000, 'award' FROM users`);
    await db.query('UPDATE wallets SET coins = coins + 20000');
    for (let index = 0; index < 6; index += 1) await call('/packs/buy', { tier: 'ouro' });
    const collection = await call('/collection');
    const owned = (collection.body.players as Array<{ playerId: string }>).map((item) => collectionPlayerById.get(item.playerId)).filter((player): player is NonNullable<typeof player> => Boolean(player));
    const seen = new Set<string>();
    const five = owned.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; }).slice(0, 5);
    expect(five).toHaveLength(5);
    const roles = five.map((player) => primaryRoleOf(player));
    const star = [...five].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
    const ownedCoach = (collection.body.players as Array<{ playerId: string }>).map((item) => collectionCoachById.get(item.playerId)).find(Boolean) ?? null;
    const saved = await call('/lineup', { playerIds: five.map((player) => player.id), roles, starPlayerId: star.id, coachId: ownedCoach?.id ?? null, style: 'balanced' }, 'PUT');
    expect(saved.status).toBe(200);
    expect(saved.body.lineup.starEffective).toBe(true);
    expect(saved.body.lineup.coachId).toBe(ownedCoach?.id ?? null);
    const notMine = [...collectionCoachById.values()].find((coach) => !(collection.body.players as Array<{ playerId: string }>).some((item) => item.playerId === coach.id))!;
    expect((await call('/lineup', { playerIds: five.map((player) => player.id), roles, starPlayerId: star.id, coachId: notMine.id, style: 'balanced' }, 'PUT')).status).toBe(403);
    expect((await call('/collection/sell', { playerId: five[0].id })).status).toBe(409);
    const stolen = await call('/lineup', { playerIds: ['device-2016', 'device-2017', 'device-2018', 'device-2019', 'device-2020'], roles: ['awper', 'awper', 'awper', 'awper', 'awper'], starPlayerId: null, style: 'balanced' }, 'PUT');
    expect([400, 403]).toContain(stolen.status);
    // Team maps: three maps the five cards know are saved; anything else is refused; null goes back to automatic.
    const { getDefaultMapSelection } = await import('../src/lib/game/maps');
    const { collectionTeams } = await import('../src/lib/game/online/collection-pool');
    const maps = [...getDefaultMapSelection(five, collectionTeams)];
    const base = { playerIds: five.map((player) => player.id), roles, starPlayerId: star.id, coachId: ownedCoach?.id ?? null, style: 'balanced' };
    const withMaps = await call('/lineup', { ...base, mapPreferences: maps }, 'PUT');
    expect(withMaps.body.lineup.mapPreferences).toEqual(maps);
    expect((await call('/lineup', { ...base, mapPreferences: ['nope', maps[0], maps[1]] }, 'PUT')).status).toBe(400);
    expect((await call('/lineup')).body.lineup.mapPreferences).toEqual(maps);
    const me = await call('/lineup');
    expect(me.body.lineup.playerIds).toEqual(five.map((player) => player.id));
    expect(coinValue(five[0])).toBeGreaterThan(0);
  });
});

describe.skipIf(!url)('registro de Major da coleção (Postgres)', () => {
  it('grava pontos, prêmio, awards e tabela uma vez só por (sala, seed, usuário)', async () => {
    const { runMigrations } = await import('../server/db/migrations');
    const { recordMajor, currentStandings, majorResult } = await import('../server/collection/seasons');
    const db = await createTestDb(url!, 'test_majors');
    await runMigrations(db);
    const rules = new Map((await db.query<{ kind: string; coins: number; points: number }>('SELECT kind, coins, points FROM award_rules')).map((row) => [row.kind, row]));
    expect(rules.get('major_mvp')).toMatchObject({ coins: 195, points: 2 });
    expect(rules.get('streak_3')).toMatchObject({ points: 3 });
    expect(rules.get('major_title')).toMatchObject({ coins: 260, points: 0 });
    expect(rules.get('season_top1')).toMatchObject({ coins: 2000 });
    const [user] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('major@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);
    const now = Date.UTC(2026, 8, 18, 15);
    const lineup = ['device-2016', 'dupreeh-2016', 'xyp9x-2016', 'karrigan-2016', 'kjaerbye-2016'].map((playerId) => ({ playerId, selectedSlotRole: 'rifler' as const }));
    const event = {
      roomCode: 'ABCDEFGH', seed: 'seed-1', runNumber: 1, lobbySize: 4, competitive: true, field: 'random' as const, awards: null,
      entries: [{ userId: user.id, participantId: 'p1', organizationName: 'Org', placement: 'placementChampion', champion: true, lineup, starPlayerId: null, matches: [], stats: [], opponents: [], ownPower: 80, seriesLost: 0, lineupIds: lineup.map((pick) => pick.playerId) }]
    };
    await recordMajor(db, event, now);
    await recordMajor(db, event, now);
    const majors = await db.query<{ points: number; ranked: boolean; counted: boolean }>('SELECT points, ranked, counted FROM majors');
    expect(majors).toHaveLength(1);
    expect(majors[0]).toMatchObject({ ranked: true, counted: true, points: 10 });
    const awards = await db.query<{ kind: string }>('SELECT kind FROM awards ORDER BY kind');
    expect(awards.map((row) => row.kind)).toEqual(['major_title']);
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [user.id]);
    // 1.200 for the title placement + 260 for the major_title award (200 + 30%).
    expect(wallet.coins).toBe(1200 + 260);
    // Three runs a day score: a 3-player runner-up gets half of 7 (rounded up), a 2-player 5th–8th a third of 3.
    await recordMajor(db, { ...event, seed: 'seed-2', lobbySize: 3, entries: [{ ...event.entries[0], placement: 'placementRunnerUp', champion: false }] }, now + 60_000);
    await recordMajor(db, { ...event, seed: 'seed-3', lobbySize: 2, entries: [{ ...event.entries[0], placement: 'placement5to8', champion: false }] }, now + 90_000);
    const scored = await db.query<{ seed: string; points: number; counted: boolean }>(`SELECT seed, points, counted FROM majors WHERE seed IN ('seed-2', 'seed-3') ORDER BY seed`);
    expect(scored).toEqual([{ seed: 'seed-2', points: 4, counted: true }, { seed: 'seed-3', points: 1, counted: true }]);
    // Up to ten runs a day count, the best ones first: here all four score.
    await recordMajor(db, { ...event, seed: 'seed-4' }, now + 100_000);
    const day = await db.query<{ seed: string; points: number; counted: boolean }>(`SELECT seed, points, counted FROM majors WHERE seed IN ('seed-1', 'seed-2', 'seed-3', 'seed-4') ORDER BY seed`);
    expect(day).toEqual([
      { seed: 'seed-1', points: 10, counted: true },
      { seed: 'seed-2', points: 4, counted: true },
      { seed: 'seed-3', points: 1, counted: true },
      { seed: 'seed-4', points: 10, counted: true }
    ]);
    // The eleventh run of the day only counts if it beats one of the ten: a weak one scores nothing, a title takes a place.
    for (let index = 0; index < 6; index += 1) await recordMajor(db, { ...event, seed: `fill-${index}` }, now + 101_000 + index);
    await recordMajor(db, { ...event, seed: 'weak-11', lobbySize: 2, entries: [{ ...event.entries[0], placement: 'placementStage3', champion: false }] }, now + 110_000);
    const [weak] = await db.query<{ points: number; counted: boolean }>(`SELECT points, counted FROM majors WHERE seed = 'weak-11'`);
    expect(weak).toEqual({ points: 0, counted: false });
    await recordMajor(db, { ...event, seed: 'title-12' }, now + 111_000);
    const pushed = await db.query<{ seed: string; counted: boolean }>(`SELECT seed, counted FROM majors WHERE seed IN ('seed-3', 'title-12') ORDER BY seed`);
    expect(pushed).toEqual([{ seed: 'seed-3', counted: false }, { seed: 'title-12', counted: true }]);
    // Not competitive (private room with drafters, or alone): no points, half reward, no title award.
    await recordMajor(db, { ...event, seed: 'seed-5', lobbySize: 1, competitive: false }, now + 120_000);
    const solo = await db.query<{ points: number; ranked: boolean; awards: string[] }>(`SELECT points, ranked, awards FROM majors WHERE seed = 'seed-5'`);
    expect(solo[0]).toMatchObject({ ranked: false, points: 0 });
    expect(solo[0].awards).toEqual([]);
    const standings = await currentStandings(db, now, user.id);
    expect(standings.month).toBe('2026-09-01');
    expect(standings.me).toMatchObject({ rank: 1, majorsWon: 9, majorsPlayed: 13, points: 9 * 10 + 4 });
    // End-of-run summary is the latest run of the room.
    expect(await majorResult(db, user.id, 'ABCDEFGH')).toMatchObject({ ranked: false, points: 0, rewardCoins: 600, awardCoins: 0, lobbySize: 1 });

    // Month over: the podium is paid once, the season closes and shows up as the last champion.
    const { closeFinishedSeasons, lastSeasonPodium } = await import('../server/collection/seasons');
    expect(await closeFinishedSeasons(db, now)).toEqual([]);
    const nextMonth = Date.UTC(2026, 9, 1, 4);
    const [before] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [user.id]);
    expect(await closeFinishedSeasons(db, nextMonth)).toEqual([{ seasonId: expect.any(Number), month: '2026-09-01', awarded: 1 }]);
    expect(await closeFinishedSeasons(db, nextMonth)).toEqual([]);
    const [after] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [user.id]);
    expect(after.coins - before.coins).toBe(2000);
    const top = await db.query<{ kind: string }>(`SELECT kind FROM awards WHERE kind LIKE 'season_%'`);
    expect(top.map((row) => row.kind)).toEqual(['season_top1']);
    const podium = await lastSeasonPodium(db);
    expect(podium).toMatchObject({ month: '2026-09-01', podium: [{ rank: 1, points: 94 }] });
    await db.close();
  });
});

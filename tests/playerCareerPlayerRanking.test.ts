// tests/playerCareerPlayerRanking.test.ts
// Ranking de jogadores (D7b): começa no ranking real da HLTV, só com quem está na ativa, cada ponto com motivo, a
// base real some da segunda temporada em diante e o mesmo estado sempre dá o mesmo ranking.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, finishSeason, orgOf, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberNick, rosterBySlot, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { SLOTS } from '../src/lib/game/playerCareer/live';
import { matesOf } from '../src/lib/game/playerCareer/squad';
import { orgIn, worldRosters } from '../src/lib/game/playerCareer/world';
import { MIN_EVENTS_RANKED } from '../src/lib/game/playerCareer/awards';
import { formBlockOf } from '../src/lib/game/playerCareer/form';
import { BASE_STEP, REAL_PLAYER_RANKING, basePointsOf, playerRanking, playerRankingView, pointsOf, rankingSnapshot, reasonsLabel, BEST_EVENTS, RATING_FLOOR, RATING_SCALE, TIER_RATING_EDGE } from '../src/lib/game/playerCareer/playerRanking';
import { careerClock, type WorldSource } from '../src/lib/game/playerCareer/worldView';
import type { WorldEvent, WorldEventResult } from '../src/lib/game/playerCareer/circuit';

const SEED = 'ranking-1';
const TIER_C = sceneOrgs.find((org) => org.level === 3)!.id;

function seasonAt(orgId: string, seatsTaken: PlayerCareerState['seatsTaken'] = []): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: SEED });
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken });
}

/** Quem está num elenco do mundo na temporada, pela chave do catálogo (ou o nick). */
const activeKeys = (state: PlayerCareerState) =>
  new Set([...worldRosters(state.seed, state.seasonNumber).values()].flat().map((member) => (member.catalogBaseId ?? memberNick(member)).toLowerCase()));

describe('ranking real no começo da carreira', () => {
  it('o top é o Top 20 HLTV do catálogo, na ordem, só com quem está na ativa', () => {
    const state = seasonAt(TIER_C);
    expect(REAL_PLAYER_RANKING).toHaveLength(20);
    expect(REAL_PLAYER_RANKING[0]).toMatchObject({ key: 'zywoo', rank: 1, year: 2025 });
    const active = REAL_PLAYER_RANKING.filter((real) => activeKeys(state).has(real.key));
    const rows = playerRanking(state);
    expect(rows.slice(0, active.length).map((row) => row.nick.toLowerCase())).toEqual(active.map((real) => real.nick.toLowerCase()));
    expect(rows.some((row) => row.you)).toBe(false);
  });

  it('quem cedeu a vaga para você e ficou no banco não entra', () => {
    const state = seasonAt('vitality-2026', [{ orgId: 'vitality-2026', orgName: 'Vitality', nick: 'ZywOo', viaRole: true, season: 1 }]);
    const rows = playerRanking(state);
    expect(rows.some((row) => row.nick === 'ZywOo')).toBe(false);
    expect(rows[0].nick).toBe('donk');
  });

  it('cada linha diz o motivo: no começo, só a base real (ninguém jogou ainda)', () => {
    const rows = playerRanking(seasonAt(TIER_C));
    const first = rows[0];
    expect(first.reasons).toMatchObject({ titles: 0, mvps: 0, evps: 0, placements: 0, mvpPoints: 0, evpPoints: 0, strength: 0, base: basePointsOf(1) });
    expect(first.points).toBe(pointsOf(first.reasons!));
    expect(first.points).toBe(basePointsOf(1));
    expect(first.score).toBe(first.points);
    expect(reasonsLabel(first.reasons!)).toBe('ranking real 6.300');
    // Sem campeonato jogado, só quem tem base real aparece.
    expect(rows.every((row) => row.reasons!.base > 0)).toBe(true);
    expect(BASE_STEP).toBe(300);
  });

  it('rótulo do motivo com títulos, MVPs e EVPs', () => {
    expect(reasonsLabel({ titles: 2, mvps: 1, evps: 3, placements: 840, mvpPoints: 200, evpPoints: 240, strength: 0, base: 4200, rating: 1.18, events: 12, ratingPoints: 3300 }))
      .toBe('rating 1,18 em 12 campeonatos 3.300 · colocações 840 (2 títulos) · 1 MVP · 3 EVPs · ranking real 4.200');
    expect(reasonsLabel({ titles: 0, mvps: 0, evps: 1, placements: 140, mvpPoints: 0, evpPoints: 80, strength: 0, base: 0 })).toBe('colocações 140 · 1 EVP');
    // Ranking salvo antes do rating da temporada ainda mostra a força.
    expect(reasonsLabel({ titles: 0, mvps: 0, evps: 0, placements: 0, mvpPoints: 0, evpPoints: 0, strength: 230, base: 0 })).toBe('força 230');
  });
});

describe('ranking real só na primeira temporada', () => {
  it('da temporada 2 em diante a base vale 0 para todo mundo', () => {
    const state: PlayerCareerState = { ...seasonAt(TIER_C), seasonNumber: 2, year: 2027, calendar: null };
    expect(playerRanking(state).every((row) => row.reasons!.base === 0)).toBe(true);
    expect(playerRankingView(state).baseWeight).toBe(0);
  });
});

describe('determinismo e visão da tela', () => {
  it('o mesmo estado dá o mesmo ranking, inclusive numa carreira nova com a mesma seed', () => {
    expect(playerRanking(seasonAt(TIER_C))).toEqual(playerRanking(seasonAt(TIER_C)));
  });

  it('a aba mostra o top 20 e a sua posição', () => {
    const view = playerRankingView(seasonAt(TIER_C));
    expect(view).toMatchObject({ year: 2026, myRank: null, baseWeight: 1 });
    // No começo só o ranking real (quem está na ativa dele): o top tem no máximo 20.
    expect(view.rows.length).toBe(view.total);
    expect(view.total).toBeGreaterThan(10);
    expect(view.total).toBeLessThanOrEqual(20);
  });
});

const lineup = (season: number, orgId: string) => rosterBySlot(orgIn(SEED, season, orgId)!, SLOTS).flatMap((member) => (member ? [memberNick(member)] : []));
const activeNicks = (state: PlayerCareerState) => new Set([...worldRosters(state.seed, state.seasonNumber).values()].flat().map((member) => memberNick(member).toLowerCase()));

const event = (season: number, index: number, month: number, tier: WorldEvent['tier'] = 'S'): WorldEvent =>
  ({ key: `${season}:${index}`, season, index, name: `Mundo Teste ${season}-${index}`, tier, format: 'bracket8', month, invites: 8, qualifierSlots: 0 });

const result = (base: WorldEvent, champion: string, runnerUp: string, mvp: string | null = null): WorldEventResult => ({
  key: base.key,
  season: base.season,
  name: base.name,
  tier: base.tier,
  month: base.month,
  field: [{ orgId: champion, via: 'invite' }, { orgId: runnerUp, via: 'invite' }],
  placements: [{ orgId: champion, place: 1 }, { orgId: runnerUp, place: 2 }],
  champion,
  runnerUp,
  mvp: mvp ? { nick: mvp, orgId: champion, rating: 1.31 } : null,
  topPlayers: mvp ? [{ nick: mvp, orgId: champion, rating: 1.31 }] : [],
  userPlayed: false
});

/** Cache falso do circuito, como nos testes da tela Mundo. */
function sourceOf(pairs: Array<[WorldEvent, WorldEventResult | null]>): WorldSource {
  return {
    events: (season) => pairs.filter(([item]) => item.season === season).map(([item]) => item),
    result: (item) => pairs.find(([candidate]) => candidate.key === item.key)?.[1] ?? null
  };
}

/** Os campeonatos de um bloco da temporada (form.ts, plano 07). */
const blockOf = (state: PlayerCareerState, block: number) => state.calendar!.filter((entry) => formBlockOf(state, entry.index) === block).map((entry) => entry.index);

/** Joga os campeonatos pedidos com a mesma colocação (o título leva o nome do seu time). */
const play = (state: PlayerCareerState, indexes: number[], placement = 'Quartas') =>
  indexes.reduce((next, index) => recordEventResult(next, index, {
    name: next.calendar![index].name, placement, rating: 1.05, seriesWins: 1, seriesLosses: 1, tier: next.calendar![index].tier,
    ...(placement === 'Campeão' ? { champion: orgOf(next.orgId).name } : {}),
    lines: [next.nick, ...matesOf(next).map((mate) => mate.player.nickname!)].map((nick) => ({ nick, orgId: next.orgId, rating: 1.05, rounds: 60 }))
  }), state);

describe('o ranking anda no fechamento do bloco', () => {
  it('dentro do bloco nada muda; fechou o bloco, o ranking real perde peso', () => {
    const start = seasonAt(TIER_C);
    const first = blockOf(start, 0);
    const before = playerRanking(start);
    const partial = play(start, first.slice(0, -1));
    expect(playerRanking(partial)).toEqual(before);
    const closed = play(partial, first.slice(-1));
    const snapshot = rankingSnapshot(closed);
    expect(snapshot).toMatchObject({ blocksClosed: 1, lastIndex: first.at(-1) });
    expect(snapshot.carry).toBeGreaterThan(0);
    expect(snapshot.carry).toBeLessThan(1);
    const after = playerRanking(closed);
    expect(after).not.toEqual(before);
    expect(after.find((row) => row.nick === 'ZywOo')!.reasons!.base).toBe(Math.round(basePointsOf(1) * snapshot.carry));
    expect(playerRanking(closed, { season: 1, eventIndex: first.at(-1)! - 1 })).toEqual(before);
  });

  it('com todos os blocos da temporada 1 fechados o ranking real vale 0, e continua 0 na temporada 2', () => {
    const start = seasonAt(TIER_C);
    const done = play(start, start.calendar!.map((entry) => entry.index));
    expect(rankingSnapshot(done).carry).toBe(0);
    expect(playerRankingView(done).baseWeight).toBe(0);
    expect(playerRanking(done).every((row) => row.reasons!.base === 0)).toBe(true);
    const next = startSeason({ ...finishSeason(done), pendingOffers: null });
    expect(next.seasonNumber).toBe(2);
    expect(playerRanking(next).every((row) => row.reasons!.base === 0)).toBe(true);
  });
});

describe('pontos dos últimos 12 meses', () => {
  /** As linhas dos dois finalistas (todos com o mesmo rating): sem elas, só os melhores do campeonato contam. */
  const withLines = (base: WorldEventResult, season: number, rating = 1.1): WorldEventResult => ({
    ...base,
    lines: [base.champion, base.runnerUp].flatMap((orgId) => lineup(season, orgId).map((nick) => ({ nick, orgId, rating, rounds: 60 })))
  });

  it('título, MVP e EVP do mundo com o motivo, e a soma bate', () => {
    const start = seasonAt(TIER_C);
    const first = blockOf(start, 0);
    const closed = play(start, first);
    // O mundo que já aconteceu quando o bloco fechou: até o relógio do circuito (o mês anterior ao seu próximo).
    const mouz = lineup(1, 'mouz-2026');
    const spirit = lineup(1, 'spirit-2026');
    // Quatro campeonatos iguais: o mínimo para entrar no ranking.
    const pairs = [0, 1, 2, 3].map((index): [WorldEvent, WorldEventResult] => {
      const world = event(1, index, careerClock(closed).month);
      return [world, {
        ...result(world, 'mouz-2026', 'spirit-2026', mouz[1]),
        topPlayers: [{ nick: mouz[1], orgId: 'mouz-2026', rating: 1.4 }, { nick: spirit[0], orgId: 'spirit-2026', rating: 1.2 }, { nick: spirit[1], orgId: 'spirit-2026', rating: 1.1 }]
      }];
    });
    const rows = playerRanking(closed, undefined, sourceOf(pairs));
    const mvp = rows.find((row) => row.nick === mouz[1])!;
    // Sem as linhas de todos (resultado antigo), o rating vem dos melhores do campeonato.
    expect(mvp.reasons).toMatchObject({ titles: 4, mvps: 4, evps: 0, placements: 4 * 280, mvpPoints: 4 * 200, evpPoints: 0, rating: 1.4, events: 4 });
    const edged = 1.4 + TIER_RATING_EDGE.S;
    expect(mvp.reasons!.ratingPoints).toBe(Math.round((edged - RATING_FLOOR) * RATING_SCALE * (4 / 6)));
    expect(mvp.points).toBe(pointsOf(mvp.reasons!));
    expect(mvp.rating).toBe(1.4);
    expect(reasonsLabel(mvp.reasons!)).toContain('colocações 1.120 (4 títulos) · 4 MVPs');
    expect(rows.find((row) => row.nick === spirit[0])!.reasons).toMatchObject({ titles: 0, evps: 4, placements: 4 * 170, evpPoints: 4 * 80 });
    // Quem não está entre os melhores (sem linha) não tem campeonato no ranking: só aparece se ainda tem base real.
    const outside = rows.find((row) => row.nick === spirit[2]);
    expect(outside?.reasons?.events ?? 0).toBe(0);
    expect(outside ? outside.reasons!.base > 0 : true).toBe(true);
  });

  it('colocação, MVP e EVP contam só nos melhores campeonatos de cada um', () => {
    const start = seasonAt(TIER_C);
    const closed = play(start, blockOf(start, 0));
    const pairs = Array.from({ length: BEST_EVENTS + 3 }, (_, index): [WorldEvent, WorldEventResult] => {
      const world = event(1, index, careerClock(closed).month);
      return [world, withLines(result(world, 'mouz-2026', 'spirit-2026'), 1)];
    });
    const champion = playerRanking(closed, undefined, sourceOf(pairs)).find((row) => row.nick === lineup(1, 'mouz-2026')[0])!;
    expect(champion.reasons).toMatchObject({ titles: BEST_EVENTS + 3, placements: BEST_EVENTS * 280, events: BEST_EVENTS + 3 });
  });

  it('a temporada passada pesa menos a cada bloco e o mundo que ainda calcula fica pendente', () => {
    const s2: PlayerCareerState = { ...seasonAt(TIER_C), seasonNumber: 2, year: 2027 };
    const lastPairs = [0, 1, 2, 3].map((index): [WorldEvent, WorldEventResult] => {
      const last = event(1, index, 5);
      return [last, withLines(result(last, 'mouz-2026', 'spirit-2026'), 1)];
    });
    const star = lineup(1, 'mouz-2026').find((nick) => activeNicks(s2).has(nick.toLowerCase()))!;
    const before = playerRanking(s2, undefined, sourceOf(lastPairs));
    expect(before.find((row) => row.nick === star)!.reasons!.placements).toBe(4 * 280);
    const first = blockOf(s2, 0);
    const closed = play(s2, first);
    const snapshot = rankingSnapshot(closed);
    const now = event(2, 0, careerClock(closed).month, 'A');
    // O mês do seu próximo campeonato ainda não chegou para o mundo: não conta nem fica pendente.
    const ahead = event(2, 1, careerClock(closed).month + 1, 'A');
    const source = sourceOf([...lastPairs, [now, null], [ahead, null]]);
    expect(playerRanking(closed, undefined, source).find((row) => row.nick === star)!.reasons!.placements).toBe(Math.round(4 * 280 * snapshot.carry));
    expect(playerRankingView(closed, source)).toMatchObject({ pending: 1, blocksClosed: 1, blocksTotal: snapshot.blocksTotal, baseWeight: 0 });
  });

  it('o rating pesa mais que o título: rating alto em time sem título passa o campeão de rating baixo', () => {
    const start = seasonAt(TIER_C);
    const closed = play(start, blockOf(start, 0));
    const mouz = lineup(1, 'mouz-2026');
    const spirit = lineup(1, 'spirit-2026');
    const pairs = Array.from({ length: 6 }, (_, index): [WorldEvent, WorldEventResult] => {
      const world = event(1, index, careerClock(closed).month);
      const base = result(world, 'mouz-2026', 'spirit-2026');
      return [world, { ...base, lines: [...mouz.map((nick) => ({ nick, orgId: 'mouz-2026', rating: 1.0, rounds: 60 })), ...spirit.map((nick) => ({ nick, orgId: 'spirit-2026', rating: 1.3, rounds: 60 }))] }];
    });
    const rows = playerRanking(closed, undefined, sourceOf(pairs));
    const at = (nick: string) => rows.findIndex((row) => row.nick === nick);
    expect(at(spirit[0])).toBeLessThan(at(mouz[0]));
  });

  it('o seu título vale para você e para os parceiros, e você entra com 4 campeonatos contados', () => {
    const start = seasonAt('vitality-2026');
    const first = blockOf(start, 0);
    const none = sourceOf([]);
    expect(playerRankingView(play(start, first, 'Campeão'), none).myRank !== null).toBe(first.length >= MIN_EVENTS_RANKED);
    const all = play(start, start.calendar!.map((entry) => entry.index), 'Campeão');
    const rows = playerRanking(all, undefined, none);
    const me = rows.find((row) => row.you)!;
    const mate = rows.find((row) => row.nick === matesOf(all)[0].player.nickname)!;
    expect(me.reasons!.titles).toBe(all.calendar!.length);
    expect(mate.reasons!.titles).toBe(all.calendar!.length);
    expect(mate.reasons!.placements).toBe(me.reasons!.placements);
    expect(playerRankingView(all, none).myRank).toBe(rows.indexOf(me) + 1);
  });

  it('EVP do seu campeonato conta para você e para quem jogou nele, como no mundo', () => {
    const start = seasonAt('vitality-2026');
    const indexes = start.calendar!.map((entry) => entry.index);
    const mate = matesOf(start)[0].player.nickname!;
    const all = indexes.reduce((next, index) => recordEventResult(next, index, {
      name: next.calendar![index].name, placement: 'Vice', rating: 1.2, seriesWins: 2, seriesLosses: 1, tier: next.calendar![index].tier,
      mvp: { nick: 'rival', team: 'Rival', rating: 1.4 },
      topPlayers: [{ nick: 'rival', orgId: 'x', rating: 1.4 }, { nick: 'tester', orgId: 'vitality-2026', rating: 1.3 }, { nick: mate, orgId: 'vitality-2026', rating: 1.25 }]
    }), start);
    const rows = playerRanking(all, undefined, sourceOf([]));
    const me = rows.find((row) => row.you)!;
    expect(me.reasons!.evps).toBe(indexes.length);
    expect(me.reasons!.evpPoints).toBeGreaterThan(0);
    expect(rows.find((row) => row.nick === mate)!.reasons!.evps).toBe(indexes.length);
  });

  it('o Top 20 HLTV do fim do ano é o mesmo ranking da tela Mundo, com o ano inteiro do mundo', () => {
    const start = seasonAt('vitality-2026');
    const done = play(start, start.calendar!.map((entry) => entry.index), 'Semis');
    expect(rankingSnapshot(done).month).toBe(12);
    const top = playerRanking(done, undefined, sourceOf([]));
    const mine = top.findIndex((row) => row.you) + 1;
    const log = finishSeason(done, null, top).history.at(-1)!;
    expect(log.hltvTop).toEqual(top.slice(0, 20));
    expect(log.hltvRank).toBe(mine > 0 ? mine : null);
  });

  it('as linhas de todos ficam só na última temporada do histórico (o save não cresce)', () => {
    const one = finishSeason(play(seasonAt(TIER_C), seasonAt(TIER_C).calendar!.map((entry) => entry.index)));
    expect(one.history.at(-1)!.tournaments.some((result) => result.lines?.length)).toBe(true);
    const next = startSeason({ ...one, pendingOffers: null });
    const two = finishSeason(play(next, next.calendar!.map((entry) => entry.index)));
    expect(two.history).toHaveLength(2);
    expect(two.history[0].tournaments.some((result) => result.lines)).toBe(false);
    expect(two.history[1].tournaments.some((result) => result.lines?.length)).toBe(true);
  });

  it('determinístico: os mesmos resultados dão o mesmo ranking', () => {
    const build = () => {
      const start = seasonAt(TIER_C);
      const closed = play(start, blockOf(start, 0));
      const world = event(1, 0, careerClock(closed).month);
      return { closed, source: sourceOf([[world, result(world, 'spirit-2026', 'mouz-2026', lineup(1, 'spirit-2026')[0])]]) };
    };
    const one = build();
    const two = build();
    expect(playerRanking(one.closed, undefined, one.source)).toEqual(playerRanking(two.closed, undefined, two.source));
    expect(playerRanking(one.closed, undefined, one.source)).toEqual(playerRanking(one.closed, undefined, one.source));
  });
});

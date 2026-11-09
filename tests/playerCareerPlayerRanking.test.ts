// tests/playerCareerPlayerRanking.test.ts
// Ranking de jogadores (D7b): começa no ranking real da HLTV, só com quem está na ativa, cada ponto com motivo, a
// base real some da segunda temporada em diante e o mesmo estado sempre dá o mesmo ranking.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberNick, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { worldRosters } from '../src/lib/game/playerCareer/world';
import { BASE_STEP, REAL_PLAYER_RANKING, basePointsOf, playerRanking, playerRankingView, pointsOf, reasonsLabel, strengthPointsOf } from '../src/lib/game/playerCareer/playerRanking';

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

  it('cada linha diz o motivo: força pelo overall e a base real com o peso dela', () => {
    const rows = playerRanking(seasonAt(TIER_C));
    const first = rows[0];
    expect(first.reasons).toMatchObject({ titles: 0, mvps: 0, evps: 0, placements: 0, mvpPoints: 0, evpPoints: 0, base: basePointsOf(1) });
    expect(first.points).toBe(pointsOf(first.reasons!));
    expect(first.points).toBe(basePointsOf(1) + first.reasons!.strength);
    expect(first.score).toBe(first.points);
    expect(reasonsLabel(first.reasons!)).toBe(`força ${first.reasons!.strength} · ranking real 6.300`);
    const outside = rows.find((row) => row.reasons!.base === 0)!;
    expect(outside.points).toBe(outside.reasons!.strength);
    expect(BASE_STEP).toBeGreaterThan(strengthPointsOf(99) - strengthPointsOf(70));
  });

  it('rótulo do motivo com títulos, MVPs e EVPs', () => {
    expect(reasonsLabel({ titles: 2, mvps: 1, evps: 3, placements: 1840, mvpPoints: 200, evpPoints: 240, strength: 230, base: 4200 }))
      .toBe('campeonatos 1.840 (2 títulos) · 1 MVP · 3 EVPs · força 230 · ranking real 4.200');
    expect(reasonsLabel({ titles: 0, mvps: 0, evps: 1, placements: 140, mvpPoints: 0, evpPoints: 80, strength: 0, base: 0 })).toBe('campeonatos 140 · 1 EVP');
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
    expect(view.rows).toHaveLength(20);
    expect(view.total).toBeGreaterThan(1000);
  });
});

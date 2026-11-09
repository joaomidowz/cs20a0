// tests/playerCareerRanking.test.ts
// O ranking dinâmico (plano 03): 12 meses de resultado ponderados por tier e colocação, base pequena pela força do
// elenco e uma base de partida pelo ranking real que some no primeiro ano. Congelado durante o seu campeonato.
import { afterEach, describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, recordEventResult, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { clearWorldCache, storeWorldResult, worldEventsOf, type WorldEvent, type WorldEventResult } from '../src/lib/game/playerCareer/circuit';
import { freezeRanking, placeShare, rankOrderAt, resultWeight, teamRankOf, teamRanking } from '../src/lib/game/playerCareer/ranking';
import { TEAM_TIER_BY_LEVEL, isEliteLevel, levelFromRank } from '../src/lib/game/playerCareer/tiers';

const idOf = (name: string) => sceneOrgs.find((org) => org.name === name)!.id;

function career(seed: string, level = 4): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return { ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] };
}

function atMonth(state: PlayerCareerState, month: number): PlayerCareerState {
  return {
    ...state,
    calendar: month >= 12
      ? [{ index: 0, name: 'Folga do teste', status: 'PLAYED' }]
      : [{ index: 0, name: 'Copa do teste', status: 'UPCOMING', month: month + 1 }]
  };
}

function fakeResult(event: WorldEvent, placements: Array<{ orgId: string; place: number }>): WorldEventResult {
  return {
    key: event.key, season: event.season, name: event.name, tier: event.tier, month: event.month,
    field: placements.map((entry) => ({ orgId: entry.orgId, via: 'invite' as const })), placements,
    champion: placements.find((entry) => entry.place === 1)?.orgId ?? '', runnerUp: placements.find((entry) => entry.place === 2)?.orgId ?? '',
    mvp: null, topPlayers: [], userPlayed: false
  };
}

/** Vitality perde tudo de janeiro a setembro: sempre a última da chave, e os 8 seguintes do ranking real revezam o pódio. */
function vitalityLosesEverything(state: PlayerCareerState) {
  const rivals = ['FURIA', 'Natus Vincere', 'Falcons', 'Spirit', 'MOUZ', 'The MongolZ', 'G2', 'Aurora'].map(idOf);
  const podium = [1, 2, 3, 3, 5, 5, 5, 5];
  const last = { bracket8: 5, swiss16: 9, major: 25 } as const;
  for (const [index, event] of worldEventsOf(state, 1).filter((candidate) => candidate.month <= 9).entries()) {
    const placements = rivals.map((orgId, position) => ({ orgId, place: podium[(position + index) % rivals.length] }));
    storeWorldResult(state.seed, fakeResult(event, [...placements, { orgId: idOf('Vitality'), place: last[event.format] }]));
  }
}

afterEach(() => clearWorldCache());

describe('ranking no começo da carreira', () => {
  it('é o ranking real: Vitality em 1º, top 16 Tier S (top 8 com o selo Elite), o resto pelo nível de casa', () => {
    const state = career('ranking-start');
    const ranking = teamRanking(state);
    expect(ranking).toHaveLength(sceneOrgs.length);
    expect(ranking[0].name).toBe('Vitality');
    expect(ranking.map((team) => team.rank)).toEqual(ranking.map((_, index) => index + 1));
    expect(ranking.slice(0, 16).every((team) => team.tier === 'S')).toBe(true);
    expect(ranking.slice(16).every((team) => ['A', 'B', 'C'].includes(team.tier))).toBe(true);
    expect(ranking.every((team, index) => index === 0 || ranking[index - 1].points >= team.points)).toBe(true);
    expect(ranking.every((team) => team.delta === 0)).toBe(true);
  });

  it('pontos por colocação e peso por idade', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 16, 17, 25].map(placeShare)).toEqual([1, 0.6, 0.4, 0.4, 0.2, 0.2, 0.1, 0.1, 0.05, 0.03]);
    expect([0, 6, 11, 12, -1].map(resultWeight)).toEqual([1, 0.5, 1 / 12, 0, 0]);
  });
});

describe('o ranking anda com os resultados', () => {
  it('a Vitality que perde tudo sai do 1º na mesma temporada e do top 8 (selo Elite) no fim do ano', () => {
    const base = career('ranking-vitality');
    vitalityLosesEverything(base);
    expect(teamRankOf(atMonth(base, 0), idOf('Vitality'))).toBe(1);
    expect(teamRankOf(atMonth(base, 6), idOf('Vitality'))).toBeGreaterThan(1);
    const end = atMonth(base, 12);
    expect(teamRankOf(end, idOf('Vitality'))).toBeGreaterThan(8);
    expect(isEliteLevel(levelFromRank(teamRankOf(end, idOf('Vitality')), 0))).toBe(false);
  });

  it('delta: a posição de antes do último mês com resultado menos a de agora', () => {
    const base = career('ranking-delta');
    vitalityLosesEverything(base);
    const now = atMonth(base, 10);
    const lastMonth = Math.max(...worldEventsOf(base, 1).filter((event) => event.month <= 9).map((event) => event.month));
    const before = teamRanking(now, { season: 1, month: lastMonth - 1 });
    for (const team of teamRanking(now).slice(0, 20)) {
      expect(team.delta).toBe(before.find((other) => other.orgId === team.orgId)!.rank - team.rank);
    }
  });

  it('nunca olha o futuro: o ranking de um mês depois do relógio é o de hoje', () => {
    const base = career('ranking-future');
    vitalityLosesEverything(base);
    const early = atMonth(base, 2);
    expect(teamRanking(early, { season: 1, month: 12 })).toEqual(teamRanking(early));
  });
});

describe('tier pelo ranking', () => {
  it('1 a 16 Tier S (1 a 8 Elite), abaixo o nível de casa (nunca acima do Tier A)', () => {
    expect(levelFromRank(1, 3)).toBe(0);
    expect(levelFromRank(8, 4)).toBe(0);
    expect(levelFromRank(9, 0)).toBe(1);
    expect(levelFromRank(16, 3)).toBe(1);
    expect(levelFromRank(17, 0)).toBe(2);
    expect(levelFromRank(40, 3)).toBe(3);
    expect(levelFromRank(null, 4)).toBe(4);
    expect([1, 8, 9, 16].map((rank) => TEAM_TIER_BY_LEVEL[levelFromRank(rank, 3)])).toEqual(['S', 'S', 'S', 'S']);
    expect(TEAM_TIER_BY_LEVEL[levelFromRank(17, 0)]).toBe('A');
  });
});

describe('congelado durante o seu campeonato', () => {
  it('a ordem não muda com resultado novo do circuito até o resultado ser gravado', () => {
    const base = career('ranking-frozen');
    const state: PlayerCareerState = { ...base, calendar: [{ index: 0, name: 'Copa do teste', status: 'UPCOMING', month: 4 }] };
    const frozen = freezeRanking(state, 0);
    expect(frozen.liveEvent?.eventIndex).toBe(0);
    expect(frozen.liveEvent?.ranking).toEqual(rankOrderAt(state, { season: 1, month: 3 }));
    const outsider = sceneOrgs.find((org) => org.level === 3)!.id;
    const before = teamRankOf(frozen, outsider);
    for (const event of worldEventsOf(state, 1).filter((candidate) => candidate.month <= 3)) storeWorldResult(state.seed, fakeResult(event, [{ orgId: outsider, place: 1 }]));
    expect(teamRankOf(state, outsider)).toBeLessThan(before!);
    expect(teamRankOf(frozen, outsider)).toBe(before);
    expect(freezeRanking(frozen, 0)).toBe(frozen);
    const done = recordEventResult(frozen, 0, { name: 'Copa do teste', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
    expect(done.liveEvent).toBeNull();
    expect(teamRankOf(done, outsider)).toBe(teamRankOf({ ...state, calendar: done.calendar }, outsider));
  });
});

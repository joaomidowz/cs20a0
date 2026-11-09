// tests/playerCareerRankingLevels.test.ts
// O nível pelo ranking (plano 03): times da cena seguem o ranking, o seu time segue a temporada, o ranking nunca pergunta
// o nível de ninguém, a promoção do fim do ano e o nível com que você assina.
import { afterEach, describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { acceptOffer, createPlayerCareer, finishSeason, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { clearWorldCache, storeWorldResult, worldEventsOf, worldFieldOf, type WorldEvent, type WorldEventResult } from '../src/lib/game/playerCareer/circuit';
import { teamRankOf, teamRanking } from '../src/lib/game/playerCareer/ranking';
import { baseLevelOf, currentLevelOf, levelFromRank } from '../src/lib/game/playerCareer/tiers';

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

describe('nível pelo ranking', () => {
  it('a Vitality que perde tudo perde o selo Elite (top 8) no fim do ano', () => {
    const end = atMonth(career('levels-vitality'), 12);
    vitalityLosesEverything(end);
    expect(currentLevelOf(end, idOf('Vitality'))).toBeGreaterThanOrEqual(1);
    expect(currentLevelOf(end, idOf('Vitality'))).toBe(levelFromRank(teamRankOf(end, idOf('Vitality')), 0));
  });

  it('times da cena seguem o ranking; o seu time segue o nível de temporada; lan house é 5', () => {
    const base = career('ranking-levels', 2);
    vitalityLosesEverything(base);
    const end = atMonth(base, 12);
    for (const team of teamRanking(end).slice(0, 24)) {
      if (team.orgId === end.orgId) continue;
      expect(currentLevelOf(end, team.orgId)).toBe(levelFromRank(team.rank, baseLevelOf(team.orgId)));
    }
    const mine = { ...end, orgId: idOf('FURIA') };
    expect(currentLevelOf(mine, idOf('FURIA'))).toBe(0);
    expect(currentLevelOf({ ...mine, orgLevels: { [idOf('FURIA')]: 1 } }, idOf('FURIA'))).toBe(1);
    expect(currentLevelOf(end, 'lan-house')).toBe(5);
  });

  it('o ranking nunca pergunta o nível de ninguém (sem recursão)', () => {
    const state = startSeason(career('ranking-recursion', 0));
    expect(() => sceneOrgs.map((org) => currentLevelOf(state, org.id))).not.toThrow();
    expect(() => teamRanking(state)).not.toThrow();
    for (const event of worldEventsOf(state, 1)) expect(() => worldFieldOf(state, event)).not.toThrow();
  });
});

describe('o seu time: acesso da temporada e promoção pelo ranking do fim do ano', () => {
  function seasonAt(level: number, seed: string, placement: string): PlayerCareerState {
    let state = startSeason(career(seed, level));
    for (const entry of state.calendar!) state = recordEventResult(state, entry.index, { name: entry.name, placement, rating: 1.05, seriesWins: 2, seriesLosses: 1, tier: entry.tier });
    return state;
  }

  it('top 8 no fim do ano vira Elite (nível 0); top 16 pelo menos Tier S (nível 1); sem ranking, a regra de sempre', () => {
    const tierA = seasonAt(1, 'ranking-promo-a', 'Semis');
    expect(finishSeason(tierA).history.at(-1)!.orgChange).toBeUndefined();
    expect(finishSeason(tierA, 5).history.at(-1)!.orgChange).toEqual({ from: 1, to: 0 });
    expect(finishSeason(tierA, 12).history.at(-1)!.orgChange).toBeUndefined();
    const tierB = seasonAt(2, 'ranking-promo-b', 'Semis');
    expect(finishSeason(tierB, 14).history.at(-1)!.orgChange).toEqual({ from: 2, to: 1 });
    expect(finishSeason(tierB, 30).history.at(-1)!.orgChange).toBeUndefined();
  });

  it('assinar com um time leva o nível de hoje dele (o da proposta)', () => {
    const state = { ...career('ranking-join', 2), pendingOffers: [{ orgId: idOf('Vitality'), orgName: 'Vitality', orgLevel: 1, salaryUsd: 1000 }] };
    const joined = acceptOffer(state, idOf('Vitality'));
    expect(currentLevelOf(joined, idOf('Vitality'))).toBe(1);
    const same = acceptOffer({ ...state, pendingOffers: [{ orgId: idOf('Vitality'), orgName: 'Vitality', orgLevel: 0, salaryUsd: 1000 }] }, idOf('Vitality'));
    expect(same.orgLevels?.[idOf('Vitality')]).toBeUndefined();
  });
});

// tests/playerCareerRetrospective.test.ts
// A retrospectiva ao pendurar o mouse: eras por time, totais, Majors, a melhor temporada, jogadas e a curva.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, type PlayerCareerState, type SeasonLog, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { buildRetrospective } from '../src/lib/game/playerCareer/retrospective';

const result = (name: string, placement: string, tier: TournamentResult['tier'], extra: Partial<TournamentResult> = {}): TournamentResult =>
  ({ name, placement, tier, rating: 1.1, seriesWins: 3, seriesLosses: 1, ...extra }) as TournamentResult;

const log = (year: number, orgId: string, orgName: string, orgLevel: number, tournaments: TournamentResult[], extra: Partial<SeasonLog> = {}): SeasonLog =>
  ({ seasonNumber: year - 2025, year, orgId, orgName, orgLevel, tournaments, seasonRating: 1.1, overallBefore: 80, overallAfter: 84, titles: tournaments.filter((t) => t.placement === 'Campeão').length, injury: null, agingNote: '', ...extra }) as SeasonLog;

describe('retrospectiva', () => {
  it('junta eras por time, conta Majors, MVPs, finais e acha a melhor temporada', () => {
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: 'retro-1' });
    const state: PlayerCareerState = {
      ...base,
      status: 'RETIRED',
      age: 30,
      history: [
        log(2026, 'oddik', 'ODDIK', 4, [result('Liga A 2026', 'Campeão', 'C'), result('Liga B 2026', 'Quartas', 'C')]),
        log(2027, 'furia', 'FURIA', 0, [result('PGL Major 2027', 'Campeão', 'Major', { mvp: { nick: 'tester', team: 'FURIA', rating: 1.4, you: true }, plays: { aces: 1, quads: 0, clutches: 2 }, highlights: [{ kind: 'ace', kills: 5, map: 'Mirage', round: 7, opponent: 'Vitality' }] }), result('IEM 2027', 'Vice', 'S')], { seasonRating: 1.3, overallAfter: 92, hltvRank: 1 }),
        log(2028, 'furia', 'FURIA', 0, [result('IEM 2028', 'Campeão', 'S'), result('BLAST 2028', 'Campeão', 'S'), result('ESL 2028', 'Semis', 'S')], { seasonRating: 1.2, overallAfter: 90, hltvRank: 3 })
      ],
      verdict: { seasons: 3, titles: 4, bestOverall: 92, topOrgName: 'FURIA', topOrgLevel: 0, bestSeasonRating: 1.3, line: 'Carreira de filme.' }
    };
    const retro = buildRetrospective(state);
    expect(retro.eras.map((era) => [era.orgName, era.from, era.to, era.titles])).toEqual([['ODDIK', 2026, 2026, 1], ['FURIA', 2027, 2028, 3]]);
    expect(retro.totals).toMatchObject({ titles: 4, majors: 1, sTier: 2, mvps: 1, majorMvps: 1, finals: 5, finalsWon: 4, hltvTop1: 1, aces: 1, bestOverall: 92, peakYear: 2027 });
    expect(retro.majorTitles).toEqual([{ name: 'PGL Major 2027', year: 2027, mvp: true }]);
    expect(retro.bestSeason?.year).toBe(2028);
    expect(retro.topPlays[0]).toMatchObject({ kind: 'ace', year: 2027 });
    expect(retro.titlesByYear.map((year) => [year.year, year.titles.length])).toEqual([[2026, 1], [2027, 1], [2028, 2]]);
    expect(retro.curve).toHaveLength(4);
  });
});

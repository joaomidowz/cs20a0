// tests/playerCareerRetrospective.test.ts
// A retrospectiva ao pendurar o mouse: eras por time, totais, Majors, a melhor temporada, jogadas e a curva.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, type PlayerCareerState, type SeasonLog, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { buildRetrospective, eraLevel } from '../src/lib/game/playerCareer/retrospective';

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

describe('nível da era', () => {
  const retiredWith = (history: SeasonLog[]): PlayerCareerState => ({
    ...createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: 'retro-era' }),
    status: 'RETIRED', age: 34, history,
    verdict: { seasons: history.length, titles: 0, bestOverall: 90, topOrgName: null, topOrgLevel: 0, bestSeasonRating: 1.1, line: 'Fim.' }
  });

  it('eraLevel: o nível da maioria das temporadas; empate fica com o mais recente', () => {
    expect(eraLevel([2, 2, 2, 1])).toBe(2);
    expect(eraLevel([1, 1, 1, 0])).toBe(1);
    expect(eraLevel([2, 2, 1, 1])).toBe(1);
    expect(eraLevel([0, 1])).toBe(1);
    expect(eraLevel([4])).toBe(4);
  });

  it('uma temporada na Elite não pinta a era inteira de Elite', () => {
    const history = [1, 1, 1, 0].map((level, index) => log(2027 + index, 'furia-2026', 'FURIA', level, [result(`IEM ${2027 + index}`, 'Semis', 'A')]));
    const retro = buildRetrospective(retiredWith(history));
    expect(retro.eras).toHaveLength(1);
    expect(retro.eras[0].level).toBe(1);
  });

  it('save de antes do Tier S: nível 1 sem tier salvo, num time que hoje é Elite (nível 0), aparece no nível 0', () => {
    const legacy = log(2026, 'vitality-2026', 'Vitality', 1, [result('Tier 1 Invitational · Etapa 1', 'Campeão', undefined)]);
    const retro = buildRetrospective(retiredWith([legacy]));
    expect(retro.first?.level).toBe(0);
    expect(retro.eras[0].level).toBe(0);
    expect(retro.seasonsList[0].level).toBe(0);
    // Time que hoje é nível 1 continua no 1; temporada nova (com tier) não é traduzida.
    expect(buildRetrospective(retiredWith([log(2026, 'g2-2026', 'G2', 1, [result('Etapa 1', 'Vice', undefined)])])).eras[0].level).toBe(1);
    expect(buildRetrospective(retiredWith([log(2027, 'vitality-2026', 'Vitality', 1, [result('IEM 2027', 'Vice', 'A')])])).eras[0].level).toBe(1);
  });
});

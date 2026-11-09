// tests/playerCareerPromotion.test.ts
// Acesso e rebaixamento: carregar o time para o tier de cima (ou cair por uma temporada sem semifinal).
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, finishSeason, orgLevelChange, orgOf, recordEventResult, startSeason, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { EVENT_RANGE } from '../src/lib/game/playerCareer/calendar';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { worldEventByKey } from '../src/lib/game/playerCareer/circuit';
import { EXTRA_QUALIFIERS, entryKind } from '../src/lib/game/playerCareer/qualifiers';

const result = (placement: string, tier: TournamentResult['tier'] = 'C'): TournamentResult => ({ name: 'x', placement, rating: 1.1, seriesWins: 2, seriesLosses: 1, tier });
const many = (placements: string[], tier?: TournamentResult['tier']) => placements.map((placement) => result(placement, tier));

function seasonAtOrg(level: number, seed: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, overall: 80, seatsTaken: [] });
}

describe('regra de acesso e rebaixamento', () => {
  it('CCT/GC sobe com 3 títulos (ou 2 e finais); Challenger precisa de 3 títulos e finais', () => {
    expect(orgLevelChange(4, many(['Campeão', 'Campeão', 'Campeão', 'Quartas', 'Semis', 'Quartas', 'Quartas', 'Quartas', 'Quartas']))).toBe(3);
    expect(orgLevelChange(4, many(['Campeão', 'Campeão', 'Vice', 'Vice', 'Vice', 'Quartas', 'Quartas', 'Quartas', 'Quartas']))).toBe(3);
    expect(orgLevelChange(4, many(['Campeão', 'Campeão', 'Quartas', 'Quartas', 'Semis', 'Quartas', 'Quartas', 'Quartas', 'Quartas']))).toBe(4);
    expect(orgLevelChange(3, many(['Campeão', 'Campeão', 'Campeão', 'Vice', 'Quartas', 'Quartas', 'Quartas', 'Semis']))).toBe(2);
    expect(orgLevelChange(3, many(['Vice', 'Vice', 'Vice', 'Vice', 'Quartas', 'Quartas', 'Quartas', 'Semis']))).toBe(3);
  });

  it('Tier 2 precisa de 4 títulos; Tier 1 vira Tier S com 4 títulos ou final de Major; Tier S não sobe', () => {
    expect(orgLevelChange(2, many(['Campeão', 'Campeão', 'Campeão', 'Quartas', 'Semis', 'Quartas', 'Quartas', 'Quartas']))).toBe(2);
    expect(orgLevelChange(2, many(['Campeão', 'Campeão', 'Campeão', 'Campeão', 'Semis', 'Quartas', 'Quartas', 'Quartas']))).toBe(1);
    expect(orgLevelChange(1, [...many(['Quartas', 'Semis', 'Quartas', 'Quartas', 'Quartas', 'Quartas', 'Quartas'], 'A'), result('Vice', 'Major')])).toBe(0);
    expect(orgLevelChange(0, many(['Campeão', 'Campeão', 'Campeão', 'Campeão'], 'S'))).toBe(0);
  });

  it('temporada inteira sem semifinal derruba um degrau (CCT/GC não cai para a lan house)', () => {
    expect(orgLevelChange(1, many(Array(9).fill('Quartas'), 'A'))).toBe(2);
    expect(orgLevelChange(4, many(Array(9).fill('Quartas')))).toBe(4);
  });
});

describe('o time promovido joga o circuito novo', () => {
  it('Challenger campeão vira Tier 2: nível novo no log, calendário do Tier 2 e força maior', () => {
    let state = seasonAtOrg(3, 'promo-1');
    const orgId = state.orgId;
    for (const entry of state.calendar!) state = recordEventResult(state, entry.index, { name: entry.name, placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0, tier: entry.tier });
    const done = finishSeason(state);
    expect(done.history.at(-1)!.orgChange).toEqual({ from: 3, to: 2 });
    expect(orgOf(orgId, done).level).toBe(2);
    expect(orgOf(orgId).level).toBe(3); // o catálogo não muda: só esta carreira
    const next = startSeason({ ...done, pendingOffers: null });
    const [min, max] = EVENT_RANGE[2];
    expect(next.calendar!.length).toBeGreaterThanOrEqual(min);
    expect(next.calendar!.length).toBeLessThanOrEqual(max + EXTRA_QUALIFIERS[2]);
    // O nível 2 (Tier A) joga o topo regional do guia (CBCS Masters e cia são campeonato Tier B); o Major e os campeonatos
    // do mundo vêm pela qualificatória da região (plano 04).
    expect(next.calendar!.filter((entry) => entryKind(entry) === 'event').every((entry) => entry.tier === 'B')).toBe(true);
    expect(next.calendar!.some((entry) => entryKind(entry) === 'qualifier' && worldEventByKey(next, entry.qualifiesFor!)?.tier === 'Major')).toBe(true);
  });
});

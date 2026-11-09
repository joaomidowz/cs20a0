// tests/playerCareerTierSource.test.ts
// O motor da Carreira lê o nível de um time só por currentLevelOf (tiers.ts): orgOf, levelIn e a sala de troféus.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, levelIn, orgOf, recordEventResult, startSeason, trophyCase, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { currentLevelOf, eventTierLabel, legacyEventTier } from '../src/lib/game/playerCareer/tiers';

/** Você carregou um time do Tier B (nível 3) para o Tier A (nível 2) nesta carreira. */
function carriedUp(seed: string): PlayerCareerState {
  const org = sceneOrgs.find((candidate) => candidate.level === 3)!;
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, overall: 80, seatsTaken: [], orgLevels: { [org.id]: 2 } });
}

describe('fonte única de nível no motor', () => {
  it('orgOf e levelIn devolvem o mesmo nível que currentLevelOf; sem estado, o catálogo', () => {
    const state = carriedUp('src-1');
    const org = sceneOrgs.find((candidate) => candidate.id === state.orgId)!;
    expect(currentLevelOf(state, org.id)).toBe(2);
    expect(orgOf(org.id, state).level).toBe(2);
    expect(levelIn(state, org)).toBe(2);
    expect(orgOf(org.id).level).toBe(3);
    const vitality = sceneOrgs.find((candidate) => candidate.name === 'Vitality')!;
    expect(levelIn(state, vitality)).toBe(currentLevelOf(state, vitality.id));
  });

  it('título da temporada em curso sem tier salvo conta pelo nível de hoje do time, não pelo do catálogo', () => {
    const state = carriedUp('src-2');
    const entry = state.calendar![0];
    const played = recordEventResult(state, entry.index, { name: entry.name, placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0 });
    expect(trophyCase(played).byTier.B).toBe(1);
    expect(trophyCase(played).byTier.C).toBe(0);
  });

  it('campeonato sem tier salvo mostra o tier de campeonato que o nível joga', () => {
    expect([0, 1, 2, 3, 4, 5].map(legacyEventTier)).toEqual(['A', 'A', 'B', 'C', 'C', 'C']);
    expect(eventTierLabel(undefined, 1)).toBe('Tier A');
    expect(eventTierLabel(undefined, 3)).toBe('Tier C');
    expect(eventTierLabel('S', 4)).toBe('Tier S');
    expect(eventTierLabel('Major', 2)).toBe('Major');
  });
});

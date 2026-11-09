// tests/playerCareerTierSeam.test.ts
// A costura do plano 3: orgOf e levelIn leem currentLevelOf. Aqui ela devolve 1 para todo time; se o motor ainda
// lesse orgLevels ou o catálogo direto, o teste pega.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/game/playerCareer/tiers', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/game/playerCareer/tiers')>();
  return { ...original, currentLevelOf: vi.fn(() => 1) };
});

import { createPlayerCareer, levelIn, orgOf, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';

describe('costura de currentLevelOf', () => {
  it('trocar o miolo de currentLevelOf muda orgOf e levelIn', () => {
    const state: PlayerCareerState = { ...createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: 'seam-1' }), pendingDraw: null, drawDone: true };
    const challenger = sceneOrgs.find((org) => org.level === 3)!;
    expect(orgOf(challenger.id, state).level).toBe(1);
    expect(levelIn(state, challenger)).toBe(1);
    // Sem estado não há carreira: o catálogo.
    expect(orgOf(challenger.id).level).toBe(3);
  });
});

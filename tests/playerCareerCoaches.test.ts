// tests/playerCareerCoaches.test.ts
// Coaches no mundo da carreira: o real do catálogo em cada time grande, idade, aposentadoria bem mais tarde que a
// de jogador e ex-jogador virando coach.
import { describe, expect, it } from 'vitest';
import { coachOfOrg, coachRetireChance, coachWorld } from '../src/lib/game/playerCareer/coaches';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, startSeason } from '../src/lib/game/playerCareer/engine';
import { careerCoachOf, coachOf } from '../src/lib/game/playerCareer/squad';
import { scoutPlayers } from '../src/lib/game/playerCareer/scout';
import { npcRetireChance, yearOfSeason } from '../src/lib/game/playerCareer/world';

describe('coaches da carreira', () => {
  it('todo time de Tier S e Tier 1 começa com o coach real do catálogo, com idade', () => {
    for (const org of sceneOrgs.filter((candidate) => candidate.level <= 1)) {
      const coach = coachOfOrg('coach-1', 1, org.id)!;
      expect(coach.real, org.name).toBe(true);
      const age = yearOfSeason(1) - coach.born;
      expect(age).toBeGreaterThanOrEqual(31);
      expect(age).toBeLessThan(50);
    }
  });

  it('coach para bem mais tarde que jogador: nada antes dos 50, certo aos 66', () => {
    expect(coachRetireChance(45)).toBe(0);
    expect(coachRetireChance(55)).toBeGreaterThan(0);
    expect(coachRetireChance(66)).toBe(1);
    expect(npcRetireChance(38)).toBe(1); // jogador para aos 38 no máximo
  });

  it('com os anos, coaches param e entram outros (às vezes ex-jogadores); a busca acha coach', () => {
    const changes = Array.from({ length: 11 }, (_, index) => coachWorld('coach-2', index + 2).changes).flat();
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change.outAge >= 50)).toBe(true);
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: 'coach-3' });
    const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!;
    const state = startSeason({ ...base, orgId: vitality.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
    const mine = careerCoachOf(state)!;
    expect(coachOf(state).name).toBe(mine.name);
    const [hit] = scoutPlayers(state, mine.name);
    expect(hit).toMatchObject({ status: 'coach', orgId: vitality.id });
  }, 120000);

  it('lan house segue com o coach genérico', () => {
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed: 'coach-4' });
    const state = startSeason({ ...base, orgId: 'lan-house', pendingDraw: null, drawDone: true, seatsTaken: [] });
    expect(careerCoachOf(state)).toBeNull();
    expect(coachOf(state).overall).toBeGreaterThan(0);
  });
});

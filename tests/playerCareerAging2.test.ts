// tests/playerCareerAging2.test.ts
// Idade na Carreira de Jogador: sobe até os 34, depois a temporada decide; lesão cresce com a idade, aviso de
// aposentadoria não encerra sozinho e aos 40 o jogador pendura o mouse e vira coach.
import { describe, expect, it } from 'vitest';
import {
  ageDecline, agePhase, trainingCeiling, chooseStartingOrg, createPlayerCareer, finishSeason, injuryChance, MAX_CAREER_AGE,
  recordEventResult, startSeason, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { CEILING_BONUS_CAP, CEILING_SEASON_ROOM } from '../src/lib/game/playerCareer/growth';

function seasonAt(seed: string, age: number, overall = 80): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'veterano', country: 'Brazil', role: 'rifler', seed });
  const signed = chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId);
  return startSeason({ ...signed, age, overall, truePotential: Math.max(overall, 70) });
}

const playSeason = (state: PlayerCareerState, rating: number) => {
  let next = state;
  for (const entry of next.calendar!) next = recordEventResult(next, entry.index, { name: entry.name, placement: 'Quartas', rating, seriesWins: 0, seriesLosses: 1 });
  return finishSeason(next);
};

describe('idade', () => {
  it('a idade só tira depois dos 34 e lesão fica mais provável com a idade', () => {
    expect([24, 29, 31, 34, 35, 37, 39].map(ageDecline)).toEqual([0, 0, 0, 0, 1, 2, 3]);
    expect(injuryChance(22)).toBeLessThan(injuryChance(30));
    expect(injuryChance(30)).toBeLessThan(injuryChance(36));
    expect(injuryChance(60)).toBeLessThanOrEqual(0.45);
    expect(agePhase(24).label).toBe('Auge');
    expect(agePhase(32).label).toBe('Veterano');
    expect(agePhase(32).detail).toContain('até os 34');
    expect(agePhase(36).label).toBe('Fim de carreira');
    expect(agePhase(36).detail).toContain('Temporada boa segura');
    for (const age of [18, 24, 29, 32, 36]) expect(agePhase(age).detail).not.toMatch(/—|--/);
  });

  it('aos 32, no teto e com rating 1.00, segura o overall (só a lesão tira); aos 36 a idade pesa e a temporada boa segura', () => {
    for (let index = 0; index < 8; index += 1) {
      const before = seasonAt(`old-${index}`, 32, 82);
      const after = playSeason(before, 1.0);
      const log = after.history.at(-1)!;
      expect(log.age).toBe(33);
      if (log.injury) expect(before.overall - after.overall).toBeLessThanOrEqual(2);
      else expect(after.overall).toBe(before.overall);
    }
    for (let index = 0; index < 4; index += 1) {
      const before = seasonAt(`older-${index}`, 36, 82);
      const after = playSeason(before, 1.0);
      expect(after.history.at(-1)!.ageDecline).toBeGreaterThanOrEqual(1);
      expect(after.overall).toBeLessThan(before.overall);
      const good = playSeason(seasonAt(`older-good-${index}`, 36, 82), 1.2);
      if (!good.history.at(-1)!.injury) expect(good.overall).toBe(82);
    }
  });

  it('o treino passa do teto 1 por temporada (até +4 na carreira); depois dos 34 só até o teto', () => {
    const base = seasonAt('vet-train', 30, 84);
    const state = { ...base, truePotential: 84, ceilingBonus: 0 };
    expect(trainingCeiling(state)).toBe(84 + CEILING_SEASON_ROOM);
    expect(trainingCeiling({ ...state, age: 24 })).toBe(84 + CEILING_SEASON_ROOM);
    expect(trainingCeiling({ ...state, ceilingBonus: CEILING_BONUS_CAP })).toBe(84 + CEILING_BONUS_CAP);
    expect(trainingCeiling({ ...state, age: 35, ceilingBonus: 2 })).toBe(86);
  });

  it('aviso de aposentadoria pela idade não encerra a carreira antes dos 40', () => {
    for (let index = 0; index < 12; index += 1) {
      const after = playSeason(seasonAt(`hint-${index}`, 35, 70), 0.9);
      expect(after.status).toBe('ACTIVE');
      expect(after.history.at(-1)!.agingNote).not.toContain('Pendurou');
    }
  });

  it(`aos ${MAX_CAREER_AGE}, pendura o mouse e vira coach`, () => {
    const after = playSeason(seasonAt('coach', MAX_CAREER_AGE - 1, 70), 1.0);
    expect(after.age).toBe(MAX_CAREER_AGE);
    expect(after.status).toBe('RETIRED');
    expect(after.verdict?.becameCoach).toBe(true);
    expect(after.verdict?.line).toContain('coach');
  });
});

// tests/playerCareerAging2.test.ts
// Idade na Carreira de Jogador: veterano perde overall, lesão cresce com a idade, aviso de aposentadoria não
// encerra sozinho e aos 40 o jogador pendura o mouse e vira coach.
import { describe, expect, it } from 'vitest';
import {
  ageDecline, agePhase, chooseStartingOrg, createPlayerCareer, finishSeason, injuryChance, MAX_CAREER_AGE,
  recordEventResult, startSeason, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';

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
  it('declínio de veterano cresce com a idade e lesão fica mais provável', () => {
    expect([24, 29, 31, 34].map(ageDecline)).toEqual([0, 1, 2, 3]);
    expect(injuryChance(22)).toBeLessThan(injuryChance(30));
    expect(injuryChance(30)).toBeLessThan(injuryChance(36));
    expect(injuryChance(60)).toBeLessThanOrEqual(0.45);
    expect(agePhase(24).label).toBe('Auge');
    expect(agePhase(32).label).toBe('Veterano');
    expect(agePhase(32).detail).toContain('Perde');
  });

  it('aos 32, a temporada registra quanto a idade tirou e o overall cai', () => {
    let drops = 0;
    for (let index = 0; index < 6; index += 1) {
      const before = seasonAt(`old-${index}`, 32, 82);
      const after = playSeason(before, 1.0);
      const log = after.history.at(-1)!;
      expect(log.ageDecline).toBeGreaterThanOrEqual(2);
      expect(log.age).toBe(33);
      if (after.overall < before.overall) drops += 1;
    }
    expect(drops).toBeGreaterThanOrEqual(5);
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

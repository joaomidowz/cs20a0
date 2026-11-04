// tests/playerCareerAdversity.test.ts
// A carreira cobra: cansaço de treino, treino cansado rende metade, moral e relação voltam ao normal, conversa com
// quem já é parceiro rende pouco, e fãs vêm de resultado (mais no tier alto).
import { describe, expect, it } from 'vitest';
import { chooseStartingOrg, createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { applyAgenda, applyCustomTraining, TIRED_AT } from '../src/lib/game/playerCareer/agenda';
import { celebrateResult, fatiguePenalty, matesOf, myPlayerOf, relationshipOf, talkTo } from '../src/lib/game/playerCareer/squad';

function seasonAt(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'lurker', seed });
  return startSeason(chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId));
}

const nextWindow = (state: PlayerCareerState, index: number) =>
  recordEventResult(state, index, { name: 'x', placement: 'Semis', rating: 1, seriesWins: 1, seriesLosses: 1 });

describe('cansaço', () => {
  it('treino cansa e descanso recupera', () => {
    const career = seasonAt('fat-1');
    const trained = applyCustomTraining(career, ['firepower', 'clutch']).state;
    expect(trained.fatigue).toBeGreaterThan(10);
    const rested = applyAgenda(nextWindow(trained, 0), 'folga').state;
    expect(rested.fatigue).toBeLessThan(trained.fatigue!);
  });

  it(`cansado (${TIRED_AT}+) o treino rende metade e não conta para o overall`, () => {
    const career = { ...seasonAt('fat-2'), fatigue: 80 };
    const result = applyCustomTraining(career, ['clutch']);
    expect(result.state.trained.clutch).toBe(1); // 3 virou 1
    expect(result.state.trainCount).toBe(career.trainCount);
    expect(result.line).toContain('Cansado');
  });

  it('cansaço tira overall em quadra', () => {
    const career = seasonAt('fat-3');
    expect(fatiguePenalty(50)).toBe(0);
    expect(fatiguePenalty(65)).toBe(1);
    expect(fatiguePenalty(90)).toBe(2);
    expect(myPlayerOf({ ...career, fatigue: 90 }).overall).toBe(Math.max(40, career.overall - 2));
  });

  it('com 85+ às vezes vem uma pancada leve que derruba a forma', () => {
    let knocks = 0;
    for (let index = 0; index < 20; index += 1) {
      const state = celebrateResult({ ...seasonAt(`knock-${index}`), fatigue: 90 }, 'Quartas');
      if (state.knock) { knocks += 1; expect(state.form).toBeLessThan(0); }
    }
    expect(knocks).toBeGreaterThan(3);
    expect(knocks).toBeLessThan(18);
  });
});

describe('moral, relação e fãs', () => {
  it('relação alta volta um pouco para o normal e cair nas quartas pesa', () => {
    const career = seasonAt('rel-1');
    const mate = matesOf(career)[0];
    const high = { ...career, relationships: { [mate.player.id]: 95 } };
    expect(relationshipOf(celebrateResult(high, 'Quartas'), mate.player.id)).toBeLessThan(95);
    expect(celebrateResult({ ...career, morale: 60 }, 'Quartas').morale).toBeLessThan(60);
    expect(celebrateResult({ ...career, morale: 100 }, 'Campeão').morale).toBeLessThan(100);
  });

  it('conversa com quem já é parceiro (85+) rende no máximo +1', () => {
    for (let index = 0; index < 10; index += 1) {
      const career = seasonAt(`talk-${index}`);
      const mate = matesOf(career)[0];
      const result = talkTo({ ...career, relationships: { [mate.player.id]: 90 } }, mate.player.id);
      expect(result.delta).toBeLessThanOrEqual(1);
    }
  });

  it('título dá fãs, e muito mais no tier alto', () => {
    const career = { ...seasonAt('fame-1'), fame: 0 };
    const cct = celebrateResult(career, 'Campeão', 4).fame!;
    const major = celebrateResult(career, 'Campeão', 1).fame!;
    expect(cct).toBeGreaterThan(0);
    expect(major).toBeGreaterThan(cct * 5);
    expect(celebrateResult(career, 'Quartas', 1).fame).toBe(0);
  });
});

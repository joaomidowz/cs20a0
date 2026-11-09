// tests/playerCareerGrowth.test.ts
// Progressão do seu jogador (D2 da spec 2026-11-09): sobe até os 34, mais rápido quando novo; o rating empurra nos
// dois sentidos; depois dos 34 a temporada boa segura; o treino sem lesão fura o teto em até +4, um ponto por
// temporada, e nada do que o treino somou é cortado no fechamento.
import { describe, expect, it } from 'vitest';
import {
  CEILING_BONUS_CAP, CEILING_SEASON_ROOM, GROWTH_LAST_AGE, ageDecline, careerCeiling, careerGrowth, ceilingBonusOf, countTrainingSession,
  growthDefaults, seasonSwing, seasonTrainOf, sessionsPerOverall, trainingCeiling, trainingOutlook, type CareerGrowthInput
} from '../src/lib/game/playerCareer/growth';
import { createPlayerCareer, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';

const grow = (patch: Partial<CareerGrowthInput>) => careerGrowth({
  seed: 'growth', seasonNumber: 1, age: 24, overall: 80, truePotential: 80, ceilingBonus: 0, developmentRate: 1, seasonRating: 1, injured: false, ...patch
});

const player = (patch: Partial<PlayerCareerState>): PlayerCareerState => ({ ...createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: 'growth-p' }), ...patch });

describe('crescimento no fechamento da temporada', () => {
  it('jovem longe do teto sobe muito; o mesmo gap aos 30 sobe bem menos', () => {
    const young = grow({ age: 17, overall: 66, truePotential: 90, seasonRating: 1.05 });
    const old = grow({ age: 30, overall: 66, truePotential: 90, seasonRating: 1.05 });
    expect(young.overall - 66).toBeGreaterThanOrEqual(6);
    expect(old.overall - 66).toBeLessThanOrEqual(3);
    expect(young.overall - 66).toBeGreaterThan(old.overall - 66);
  });

  it('até os 34 a idade não tira: no teto, rating 1.00 segura; rating ruim tira em qualquer idade', () => {
    for (const age of [22, 27, 31, GROWTH_LAST_AGE - 1]) {
      expect(grow({ age, overall: 85, truePotential: 85 }).overall).toBe(85);
      expect(grow({ age, overall: 85, truePotential: 85, seasonRating: 0.85 }).overall).toBe(84);
    }
  });

  it('rating bom sobe até o teto, nunca acima dele sem treino', () => {
    expect(grow({ age: 26, overall: 84, truePotential: 85, seasonRating: 1.3 }).overall).toBe(85);
    expect(grow({ age: 26, overall: 85, truePotential: 85, seasonRating: 1.3 }).overall).toBe(85);
  });

  it('depois dos 34: temporada boa segura, a normal perde pela idade, a ruim perde mais', () => {
    expect(ageDecline(GROWTH_LAST_AGE)).toBe(0);
    expect([35, 36, 37, 38, 39, 40].map(ageDecline)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(grow({ age: 36, overall: 85, truePotential: 85, seasonRating: 1.15 }).overall).toBe(85);
    const normal = grow({ age: 36, overall: 85, truePotential: 85, seasonRating: 1.0 });
    expect(normal.overall).toBe(83);
    expect(normal.ageDecline).toBe(2);
    expect(grow({ age: 36, overall: 85, truePotential: 85, seasonRating: 0.8 }).overall).toBe(82);
  });

  it('a lesão depois dos 30 tira 1', () => {
    const hurt = grow({ age: 31, overall: 85, truePotential: 85, injured: true });
    expect(hurt.overall).toBe(84);
    expect(hurt.ageDecline).toBe(1);
  });
});

describe('teto conquistado', () => {
  it('o treino acima do teto vira teto novo no fim da temporada sem lesão, e o overall fica', () => {
    const out = grow({ age: 25, overall: 86, truePotential: 85 });
    expect(out).toMatchObject({ ceilingGain: 1, ceilingBonus: 1, ceilingBlocked: false, overall: 86 });
  });

  it('com lesão o teto não sobe naquele ano, mas o overall do treino não é cortado', () => {
    const out = grow({ age: 25, overall: 86, truePotential: 85, injured: true });
    expect(out).toMatchObject({ ceilingGain: 0, ceilingBonus: 0, ceilingBlocked: true, overall: 86 });
  });

  it('no máximo +4 na carreira e 1 por temporada; depois dos 34 não conquista mais', () => {
    expect(grow({ age: 25, overall: 90, truePotential: 85, ceilingBonus: 3 }).ceilingBonus).toBe(CEILING_BONUS_CAP);
    expect(grow({ age: 25, overall: 89, truePotential: 85, ceilingBonus: CEILING_BONUS_CAP }).ceilingGain).toBe(0);
    expect(grow({ age: 25, overall: 88, truePotential: 85 }).ceilingGain).toBe(CEILING_SEASON_ROOM);
    expect(grow({ age: GROWTH_LAST_AGE + 1, overall: 86, truePotential: 85, seasonRating: 1.2 }).ceilingGain).toBe(0);
  });

  it('save acima do teto (treino antigo de veterano) não é cortado no fechamento', () => {
    expect(grow({ age: 29, overall: 88, truePotential: 84, ceilingBonus: 4 }).overall).toBe(88);
    expect(grow({ age: 29, overall: 88, truePotential: 84, ceilingBonus: 0 }).overall).toBe(88);
  });
});

describe('treino da semana', () => {
  it('quanto mais novo, menos semanas por +1; acima do teto, o dobro', () => {
    expect([16, 21, 22, 30, 31, 34, 35, 39].map((age) => sessionsPerOverall(age, false))).toEqual([2, 2, 3, 3, 4, 4, 6, 6]);
    expect(sessionsPerOverall(25, true)).toBe(6);
  });

  it('jovem: +1 a cada 2 sessões até o teto; no teto fura +1 na temporada (4 sessões) e para', () => {
    let state = player({ age: 19, overall: 88, truePotential: 90, ceilingBonus: 0, trainProgress: 0, seasonNumber: 3 });
    const ups: number[] = [];
    for (let session = 1; session <= 10; session += 1) {
      const result = countTrainingSession(state);
      if (result.overallUp) ups.push(session);
      state = result.state;
    }
    expect(ups).toEqual([2, 4, 8]);
    expect(state.overall).toBe(91);
    expect(trainingCeiling(state)).toBe(91);
    expect(seasonTrainOf(state)).toEqual({ season: 3, sessions: 10, gained: 3 });
    expect(state.trainCount).toBe(10);
  });

  it('depois dos 34 o treino só devolve até o teto', () => {
    const back = countTrainingSession(player({ age: 36, overall: 84, truePotential: 85, ceilingBonus: 0, trainProgress: 5 }));
    expect(back.overallUp).toBe(true);
    expect(back.state.overall).toBe(85);
    expect(trainingCeiling(back.state)).toBe(85);
  });

  it('save antigo: o teto conquistado sai do que o overall já passou do teto; o progresso, do contador de 3', () => {
    const legacy = player({ overall: 88, truePotential: 84, trainCount: 7 });
    delete legacy.ceilingBonus;
    delete legacy.trainProgress;
    expect(ceilingBonusOf(legacy)).toBe(4);
    expect(careerCeiling(legacy)).toBe(88);
    expect(growthDefaults(legacy)).toEqual({ ceilingBonus: 4, trainProgress: 1 });
    const way = player({ overall: 95, truePotential: 84 });
    delete way.ceilingBonus;
    expect(ceilingBonusOf(way)).toBe(CEILING_BONUS_CAP);
  });
});

describe('tela', () => {
  it('a temporada mostra o começo antes do treino, o treino e o fechamento', () => {
    expect(seasonSwing({ overallBefore: 84, overallAfter: 85, trainingGain: 3 })).toEqual({ start: 81, end: 85, training: 3, close: 1 });
    expect(seasonSwing({ overallBefore: 84, overallAfter: 83 })).toEqual({ start: 84, end: 83, training: 0, close: -1 });
  });

  it('a Evolução diz se o treino sobe, fura, espera, está no máximo ou só segura', () => {
    expect(trainingOutlook(player({ age: 20, overall: 80, truePotential: 90, ceilingBonus: 0, trainProgress: 1 }))).toEqual({ stage: 'sobe', need: 2, left: 1, bonus: 0 });
    expect(trainingOutlook(player({ age: 25, overall: 90, truePotential: 90, ceilingBonus: 0, trainProgress: 0 })).stage).toBe('fura');
    expect(trainingOutlook(player({ age: 25, overall: 91, truePotential: 90, ceilingBonus: 0 })).stage).toBe('espera');
    expect(trainingOutlook(player({ age: 25, overall: 94, truePotential: 90, ceilingBonus: 4 })).stage).toBe('maximo');
    expect(trainingOutlook(player({ age: 36, overall: 90, truePotential: 90, ceilingBonus: 0 })).stage).toBe('segura');
  });
});

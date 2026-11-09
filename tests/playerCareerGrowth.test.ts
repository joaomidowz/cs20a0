// tests/playerCareerGrowth.test.ts
// Progressão do seu jogador (D2 da spec 2026-11-09, regra nova do dono): a temporada só sobe pelo que você fez, o
// treino durante ela e o rating no fechamento (faixas de −2 a +3, +1 para quem tem até 21 e rating acima de 1,10). Não
// existe crescimento automático rumo ao teto. O teto freia o desempenho bom; depois dos 34 a temporada boa segura; o
// treino sem lesão fura o teto em até +4, um ponto por temporada, e nada do que o treino somou é cortado no fechamento.
import { describe, expect, it } from 'vitest';
import {
  CEILING_BONUS_CAP, CEILING_SEASON_ROOM, GROWTH_LAST_AGE, VETERAN_HOLD_RATING, YOUTH_BONUS_MAX_AGE, ageDecline, careerCeiling, careerGrowth,
  ceilingBonusOf, countTrainingSession, growthDefaults, seasonPerformance, seasonSwing, seasonTrainOf, sessionsPerOverall, trainingCeiling,
  trainingOutlook, youthBonus, type CareerGrowthInput
} from '../src/lib/game/playerCareer/growth';
import { chooseStartingOrg, createPlayerCareer, finishSeason, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';

const grow = (patch: Partial<CareerGrowthInput>) => careerGrowth({
  seed: 'growth', seasonNumber: 1, age: 24, overall: 80, truePotential: 80, ceilingBonus: 0, seasonRating: 1, injured: false, ...patch
});

const player = (patch: Partial<PlayerCareerState>): PlayerCareerState => ({ ...createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: 'growth-p' }), ...patch });

describe('desempenho da temporada', () => {
  it('faixas do rating: abaixo de 0,75 −2; até 0,90 −1; até 1,00 zero; até 1,10 +1; até 1,20 +2; acima +3', () => {
    const ratings = [0.5, 0.74, 0.75, 0.89, 0.9, 0.95, 1.0, 1.01, 1.1, 1.11, 1.2, 1.21, 1.6];
    expect(ratings.map(seasonPerformance)).toEqual([-2, -2, -1, -1, 0, 0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it(`jovem: até os ${YOUTH_BONUS_MAX_AGE} (idade nova) e rating acima de 1,10 ganha +1 a mais`, () => {
    expect(youthBonus(18, 1.11)).toBe(1);
    expect(youthBonus(YOUTH_BONUS_MAX_AGE, 1.3)).toBe(1);
    expect(youthBonus(YOUTH_BONUS_MAX_AGE + 1, 1.3)).toBe(0);
    expect(youthBonus(18, 1.1)).toBe(0);
    // Fecha aos 20 (vira 21): +2 da faixa e +1 de jovem. Fecha aos 21 (vira 22): só a faixa.
    expect(grow({ age: 20, overall: 70, truePotential: 90, seasonRating: 1.15 }).overall).toBe(73);
    expect(grow({ age: 21, overall: 70, truePotential: 90, seasonRating: 1.15 }).overall).toBe(72);
  });

  it('sem crescimento de graça: aos 17, longe do teto, rating 1,00 e sem treino não sobe nada', () => {
    expect(grow({ age: 17, overall: 66, truePotential: 90, seasonRating: 1.0 }).overall).toBe(66);
    expect(grow({ age: 17, overall: 66, truePotential: 97, seasonRating: 0.95 }).overall).toBe(66);
    // Rating bom vale o mesmo em qualquer idade até os 34 (fora o bônus de jovem): o gap até o teto não acelera.
    expect(grow({ age: 17, overall: 66, truePotential: 90, seasonRating: 1.05 }).overall).toBe(67);
    expect(grow({ age: 30, overall: 66, truePotential: 90, seasonRating: 1.05 }).overall).toBe(67);
  });

  it('o teto freia o desempenho bom: nunca passa do teto do arquétipo mais o conquistado, e nada é cortado', () => {
    expect(grow({ age: 17, overall: 89, truePotential: 90, seasonRating: 1.3 }).overall).toBe(90);
    expect(grow({ age: 17, overall: 90, truePotential: 90, seasonRating: 1.3 }).overall).toBe(90);
    // O teto conquistado pelo treino é folga para o rating.
    expect(grow({ age: 24, overall: 90, truePotential: 90, ceilingBonus: 2, seasonRating: 1.15 }).overall).toBe(92);
    // Acima do teto (save antigo ou treino) não volta, e o rating bom dá zero.
    expect(grow({ age: 24, overall: 95, truePotential: 90, ceilingBonus: 2, seasonRating: 1.3 }).overall).toBe(95);
    // O rating ruim tira mesmo acima do teto.
    expect(grow({ age: 24, overall: 95, truePotential: 90, ceilingBonus: 2, seasonRating: 0.8 }).overall).toBe(94);
  });

  it('antes dos 35 a idade não tira nada: só o rating ruim derruba', () => {
    expect(grow({ age: GROWTH_LAST_AGE - 1, overall: 80, truePotential: 85, seasonRating: 0.95 })).toMatchObject({ overall: 80, ageDecline: 0 });
    expect(grow({ age: GROWTH_LAST_AGE - 1, overall: 80, truePotential: 85, seasonRating: 0.85 }).overall).toBe(79);
    expect(grow({ age: GROWTH_LAST_AGE - 1, overall: 80, truePotential: 85, seasonRating: 0.7 }).overall).toBe(78);
  });
});

describe('crescimento no fechamento da temporada', () => {
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
    // Depois dos 34 o rating bom só segura, não sobe; a régua de segurar é 1,09.
    expect(grow({ age: 36, overall: 80, truePotential: 85, seasonRating: 1.3 }).overall).toBe(80);
    expect(grow({ age: 36, overall: 80, truePotential: 85, seasonRating: VETERAN_HOLD_RATING }).overall).toBe(80);
    expect(grow({ age: 36, overall: 80, truePotential: 85, seasonRating: 1.08 }).overall).toBe(78);
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

describe('fechamento no motor', () => {
  it('aos 17: treino +3 na temporada e rating 1,15 fecham com +3 (faixa +2 e jovem +1), +6 no ano', () => {
    for (let index = 0; index < 6; index += 1) {
      const career = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: `kid-${index}` });
      const signed = chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId);
      let state = startSeason({ ...signed, age: 17, overall: 66, truePotential: 92, ceilingBonus: 0, trainProgress: 0 });
      for (let session = 0; session < 6; session += 1) state = countTrainingSession(state).state; // 2 semanas por +1 aos 17
      expect(state.overall).toBe(69);
      for (const entry of state.calendar!) state = recordEventResult(state, entry.index, { name: entry.name, placement: 'Quartas', rating: 1.15, seriesWins: 0, seriesLosses: 1 });
      const after = finishSeason(state);
      // A lesão antes dos 30 só pesa 0,03 no rating (1,12): continua +2 e +1 de jovem.
      expect(seasonSwing(after.history.at(-1)!)).toEqual({ start: 66, end: 72, training: 3, close: 3 });
    }
  });

  it('o que o treino passou do teto não é cortado; sem lesão vira teto novo e o SeasonLog mostra o treino', () => {
    for (let index = 0; index < 6; index += 1) {
      const career = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed: `snap-${index}` });
      const signed = chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId);
      let state = startSeason({ ...signed, age: 25, overall: 85, truePotential: 85, ceilingBonus: 0, trainProgress: 5 });
      state = countTrainingSession(state).state; // 6ª sessão no teto: fura para 86
      expect(state.overall).toBe(86);
      for (const entry of state.calendar!) state = recordEventResult(state, entry.index, { name: entry.name, placement: 'Quartas', rating: 1.0, seriesWins: 0, seriesLosses: 1 });
      const after = finishSeason(state);
      const log = after.history.at(-1)!;
      expect(after.overall).toBe(86);
      expect(log.trainingGain).toBe(1);
      expect(seasonSwing(log)).toEqual({ start: 85, end: 86, training: 1, close: 0 });
      expect(after.ceilingBonus).toBe(log.injury ? 0 : 1);
      expect(Boolean(log.ceilingBlocked)).toBe(Boolean(log.injury));
      expect(after.seasonTrain).toBeNull();
    }
  });
});

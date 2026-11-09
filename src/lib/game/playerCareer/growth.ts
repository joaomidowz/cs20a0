// src/lib/game/playerCareer/growth.ts
// Progressão do SEU jogador na Carreira (decisão D2 de docs/superpowers/specs/2026-11-09-carreira-mundo-vivo-design.md).
// Sobe até os 34, mais rápido quando novo; o rating da temporada empurra para cima ou para baixo em qualquer idade;
// depois dos 34, temporada boa segura e ruim tira. O teto do arquétipo (truePotential) continua sorteado na criação;
// o treino sem lesão fura esse teto em até +4 (ceilingBonus), um ponto por temporada, e nada do que o treino
// conquistou é apagado no fim da temporada. Só vale para você: o mundo (world.ts) e os parceiros
// (advanceRosterLight em engine.ts) seguem no applyAging de career/aging.ts, sem mudança.
import { createSeededRng } from '../simulation';
import { retirementHazard } from '../career/aging';
import { calibration } from './data';
import type { PlayerCareerState, SeasonLog } from './engine';

/** Última idade em que o overall ainda sobe no fechamento e em que o treino ainda fura o teto. */
export const GROWTH_LAST_AGE = 34;
/** Quanto o treino pode furar o teto do arquétipo na carreira inteira. */
export const CEILING_BONUS_CAP = 4;
/** Quanto o treino passa do teto numa temporada (vira teto novo no fim dela, se não houve lesão). */
export const CEILING_SEASON_ROOM = 1;

/** Quanto da distância até o teto fecha por temporada, pela idade nova: rápido até os 21, devagar até os 34. */
export const GROWTH_BY_AGE: Record<number, number> = {
  16: 0.3, 17: 0.3, 18: 0.28, 19: 0.28, 20: 0.24, 21: 0.22, 22: 0.18, 23: 0.15, 24: 0.13, 25: 0.11, 26: 0.1,
  27: 0.09, 28: 0.08, 29: 0.07, 30: 0.06, 31: 0.05, 32: 0.05, 33: 0.04, 34: 0.04
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** O que a idade tira por temporada depois dos 34 (pela idade nova), se a temporada não foi boa: 35-36 1, 37-38 2, 39+ 3. */
export const ageDecline = (age: number): number => (age <= GROWTH_LAST_AGE ? 0 : age <= 36 ? 1 : age <= 38 ? 2 : 3);

type CeilingFields = Pick<PlayerCareerState, 'truePotential' | 'overall' | 'ceilingBonus'>;

/** Teto conquistado pelo treino. Save antigo (sem o campo): o que o overall já passou do teto do arquétipo, até o máximo. */
export const ceilingBonusOf = (state: CeilingFields): number =>
  clamp(state.ceilingBonus ?? state.overall - state.truePotential, 0, CEILING_BONUS_CAP);

/** O teto de hoje: o do arquétipo mais o que o treino conquistou. */
export const careerCeiling = (state: CeilingFields): number => Math.min(99, state.truePotential + ceilingBonusOf(state));

/** Quanto o treino ainda pode passar do teto nesta temporada: 1 até os 34, zero depois ou com o teto conquistado no máximo. */
export const ceilingRoom = (state: CeilingFields & Pick<PlayerCareerState, 'age'>): number =>
  state.age > GROWTH_LAST_AGE ? 0 : Math.min(CEILING_SEASON_ROOM, CEILING_BONUS_CAP - ceilingBonusOf(state));

/** Até onde o treino leva o overall agora: o teto de hoje mais a folga da temporada. */
export const trainingCeiling = (state: CeilingFields & Pick<PlayerCareerState, 'age'>): number =>
  Math.min(99, careerCeiling(state) + ceilingRoom(state));

/** Semanas de treino para +1 de overall: 2 até os 21, 3 dos 22 aos 30, 4 até os 34, 6 depois. Acima do teto, o dobro. */
export const sessionsPerOverall = (age: number, aboveCeiling: boolean): number =>
  (age <= 21 ? 2 : age <= 30 ? 3 : age <= GROWTH_LAST_AGE ? 4 : 6) * (aboveCeiling ? 2 : 1);

/** Sessões desde o último +1. Save antigo: o resto do contador antigo, que dava +1 a cada 3. */
export const trainProgressOf = (state: Pick<PlayerCareerState, 'trainProgress' | 'trainCount'>): number =>
  state.trainProgress ?? (state.trainCount ?? 0) % 3;

/** O treino da temporada em curso: sessões que contaram e o overall que elas somaram. */
export function seasonTrainOf(state: Pick<PlayerCareerState, 'seasonTrain' | 'seasonNumber'>): { season: number; sessions: number; gained: number } {
  return state.seasonTrain?.season === state.seasonNumber ? state.seasonTrain : { season: state.seasonNumber, sessions: 0, gained: 0 };
}

export interface TrainingSession {
  state: PlayerCareerState;
  overallUp: boolean;
  /** O +1 passou do teto de hoje: vira teto novo no fim da temporada, se não houver lesão. */
  aboveCeiling: boolean;
}

/**
 * Uma sessão de treino que conta (uma por semana, sem estar cansado): soma o progresso e, completo, dá +1 de overall
 * até o limite do treino. Parado no limite, o progresso fica cheio esperando a folga (teto novo ou o que a idade tirar).
 */
export function countTrainingSession(state: PlayerCareerState): TrainingSession {
  const ceilingBonus = ceilingBonusOf(state);
  const fixed = { ...state, ceilingBonus };
  const above = state.overall >= careerCeiling(fixed);
  const need = sessionsPerOverall(state.age, above);
  const progress = trainProgressOf(state) + 1;
  const overallUp = progress >= need && state.overall < trainingCeiling(fixed);
  const season = seasonTrainOf(state);
  return {
    state: {
      ...fixed,
      trainCount: (state.trainCount ?? 0) + 1,
      trainProgress: overallUp ? 0 : Math.min(progress, need),
      seasonTrain: { season: state.seasonNumber, sessions: season.sessions + 1, gained: season.gained + (overallUp ? 1 : 0) },
      ...(overallUp ? { overall: state.overall + 1 } : {})
    },
    overallUp,
    aboveCeiling: overallUp && above
  };
}

export interface CareerGrowthInput {
  seed: string;
  seasonNumber: number;
  /** Idade na temporada que fecha. */
  age: number;
  overall: number;
  truePotential: number;
  ceilingBonus: number;
  developmentRate: number;
  /** Média de rating da temporada (base 1.00). */
  seasonRating: number;
  injured: boolean;
}

export interface CareerGrowthOutcome {
  age: number;
  overall: number;
  ceilingBonus: number;
  /** Teto que o treino conquistou nesta temporada. */
  ceilingGain: number;
  /** O treino passou do teto, mas a lesão segurou: não virou teto novo nesta temporada (o overall fica). */
  ceilingBlocked: boolean;
  /** O que a idade (e a lesão depois dos 30) tirou de fato. */
  ageDecline: number;
  /** Risco real de aposentadoria pela idade, a partir dos 30: só aviso, a decisão é sua. */
  retireHint: boolean;
}

/** Fecha a temporada do seu jogador: teto conquistado, crescimento até os 34, desempenho e idade. Determinístico pela seed. */
export function careerGrowth(input: CareerGrowthInput): CareerGrowthOutcome {
  const rng = createSeededRng(`${input.seed}:season:${input.seasonNumber}:growth`);
  const age = input.age + 1;
  const retireHint = age >= 30 && rng() < retirementHazard(age, input.overall, calibration);

  // 1. Teto conquistado: o que o treino passou do teto vira teto novo, se a temporada foi sem lesão.
  const bonusBefore = clamp(input.ceilingBonus, 0, CEILING_BONUS_CAP);
  const overshoot = Math.max(0, input.overall - Math.min(99, input.truePotential + bonusBefore));
  const room = input.age > GROWTH_LAST_AGE ? 0 : Math.min(CEILING_SEASON_ROOM, CEILING_BONUS_CAP - bonusBefore);
  const earned = Math.min(overshoot, room);
  const ceilingGain = input.injured ? 0 : earned;
  const ceilingBonus = bonusBefore + ceilingGain;
  const ceiling = Math.min(99, input.truePotential + ceilingBonus);

  // 2. Desempenho: o rating da temporada (a lesão pesa nele) contra 1.00, de −2 a +2.
  const rating = input.seasonRating - (input.injured ? 0.03 + 0.012 * Math.max(0, input.age - 27) : 0);
  const performance = clamp(Math.round((rating - 1) * 6), -2, 2);
  const jitter = Math.round((rng() - 0.5) * 2);

  let delta: number;
  let decline = 0;
  if (age <= GROWTH_LAST_AGE) {
    // 3a. Até os 34: anda pela distância até o teto (mais rápido quando novo; quase nada com temporada fraca). O
    // desempenho bom sobe até o teto; o ruim tira de qualquer jeito. Nada é cortado de quem já está acima do teto.
    const gap = ceiling - input.overall;
    const form = rating >= 1 ? 1 : 0.2;
    const natural = gap > 0 ? Math.max(0, Math.round(gap * (GROWTH_BY_AGE[age] ?? 0) * clamp(input.developmentRate, 0.8, 1.25) * form) + jitter) : 0;
    delta = Math.min(natural + Math.max(0, performance), Math.max(0, gap)) + Math.min(0, performance);
  } else {
    // 3b. Depois dos 34: temporada boa (rating de 1,09 para cima) segura; senão a idade tira, e a ruim tira mais.
    decline = performance >= 1 ? 0 : ageDecline(age);
    delta = -decline + Math.min(0, performance);
  }
  const injuryLoss = input.injured && input.age >= 30 ? 1 : 0;
  return {
    age,
    overall: clamp(input.overall + delta - injuryLoss, 40, 99),
    ceilingBonus,
    ceilingGain,
    ceilingBlocked: input.injured && earned > 0,
    ageDecline: decline + injuryLoss,
    retireHint
  };
}

/** Saves antigos ganham o teto conquistado (o que já passaram do teto) e o progresso do treino. Nunca mexe no overall. */
export function growthDefaults(state: PlayerCareerState): Pick<PlayerCareerState, 'ceilingBonus' | 'trainProgress'> {
  return { ceilingBonus: ceilingBonusOf(state), trainProgress: trainProgressOf(state) };
}

export interface SeasonSwing {
  /** Overall no começo da temporada, antes do treino dela. */
  start: number;
  end: number;
  /** O que o treino somou durante a temporada. */
  training: number;
  /** O que o fechamento mexeu (crescimento, desempenho, idade, lesão). */
  close: number;
}

/** A temporada em números para a tela. Save antigo sem trainingGain: o começo é o overallBefore. */
export function seasonSwing(log: Pick<SeasonLog, 'overallBefore' | 'overallAfter' | 'trainingGain'>): SeasonSwing {
  const training = log.trainingGain ?? 0;
  return { start: log.overallBefore - training, end: log.overallAfter, training, close: log.overallAfter - log.overallBefore };
}

export type TrainingStage = 'sobe' | 'fura' | 'espera' | 'maximo' | 'segura';
export interface TrainingOutlook {
  stage: TrainingStage;
  /** Semanas de treino para o próximo +1, na situação de hoje. */
  need: number;
  /** Quantas faltam. */
  left: number;
  bonus: number;
}

/** O que o treino faz pelo seu overall agora (tela de Evolução e semana). */
export function trainingOutlook(state: PlayerCareerState): TrainingOutlook {
  const bonus = ceilingBonusOf(state);
  const ceiling = careerCeiling(state);
  const need = sessionsPerOverall(state.age, state.overall >= ceiling);
  const left = Math.max(1, need - trainProgressOf(state));
  const stage: TrainingStage = state.overall < ceiling ? 'sobe'
    : state.overall < trainingCeiling(state) ? 'fura'
    : state.age > GROWTH_LAST_AGE ? 'segura'
    : bonus >= CEILING_BONUS_CAP ? 'maximo'
    : 'espera';
  return { stage, need, left, bonus };
}

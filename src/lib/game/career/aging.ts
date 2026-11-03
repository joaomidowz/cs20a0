// src/lib/game/career/aging.ts
// Motor de envelhecimento da Carreira: um ano por temporada, crescimento rumo ao potencial, declínio e
// aposentadoria — tudo dirigido pela CALIBRAÇÃO REAL (career-calibration.game.json, exportada pelo Studio a
// partir das trajetórias 2013–2026 do catálogo). Puro e agnóstico à fonte: serve para o mundo gerado (wt-*) e
// para a cena real do modo Jogador. Nenhuma curva inventada: sem entrada de calibração, usa o fallback
// conservador documentado e marca o uso para o relatório de gap.
import { createSeededRng } from '../simulation';

/** Estatísticas de uma amostra real, no formato do career-calibration do Studio. */
export interface CalibrationStats {
  n: number;
  mean: number;
  p10: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}

/** Contrato do career-calibration.game.json (Fase 0.5 do Studio). Campos faltantes degradam para fallback. */
export interface AgingCalibration {
  distributions?: {
    entryAge?: CalibrationStats | null;
    peakAge?: CalibrationStats | null;
    /** Saída do TOPO (último card do catálogo): curva da mecânica de queda de tier do mercado, NÃO de aposentadoria. */
    exitAgeObserved?: CalibrationStats | null;
    /** Fim de carreira de fato (years_active encerrado + birthDate): é esta que dirige o hazard de aposentadoria. */
    retirementAge?: CalibrationStats | null;
  };
  /** Delta médio de overall ano a ano por idade (a curva real de crescimento/declínio). */
  yearOverYearDeltaByAge?: Record<string, CalibrationStats>;
  /** Overall médio observado por idade (usado só como referência de sanidade, não dirige o motor). */
  overallByAge?: Record<string, CalibrationStats>;
}

/** Entidade que envelhece. O mundo gerado preenche tudo; a cena real envia id/age/overall e o que tiver. */
export interface AgingEntity {
  id: string;
  age: number;
  overall: number;
  /** Teto oculto da carreira (world/potential.ts); nulo deixa a curva calibrada mandar sozinha. */
  truePotential?: number | null;
  /** Multiplicador de crescimento (0.8–1.25); padrão 1. */
  developmentRate?: number | null;
  archetype?: string | null;
  /** Rating da temporada anterior (base 1.00); desempenho empurra o delta. */
  runRating?: number | null;
}

export type AgingEvent =
  | { type: 'GROWTH'; playerId: string; from: number; to: number; via: 'calibration' | 'fallback' }
  | { type: 'DECLINE'; playerId: string; from: number; to: number; via: 'calibration' | 'fallback' }
  | { type: 'PLATEAU'; playerId: string; overall: number }
  | { type: 'RETIRE'; playerId: string; age: number; overall: number };

export interface AgingOutcome {
  entity: AgingEntity;
  events: AgingEvent[];
  retired: boolean;
}

/** Rampa de hazard ancorada nos quartis OBSERVADOS de fim de carreira: 0 antes do p10, ~12% na mediana, ~35% no p90. */
const HAZARD_AT_MEDIAN = 0.12;
const HAZARD_AT_P90 = 0.35;
const HAZARD_BEYOND_MAX = 0.6;
/** Ajuste por nível: quem está abaixo disso sai antes (+40% do hazard), estrelas seguram (−40%). */
const OVERALL_GRADE_FLOOR = 72;
const OVERALL_GRADE_STAR = 88;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Probabilidade de aposentadoria na próxima temporada, derivada da distribuição REAL de fim de carreira. */
export function retirementHazard(age: number, overall: number, calibration: AgingCalibration): number {
  const exits = calibration.distributions?.retirementAge ?? calibration.distributions?.exitAgeObserved;
  if (!exits || exits.n === 0) {
    // Sem calibração: rampa conservadora a partir dos 30, majoritariamente aposentando depois dos 36.
    if (age < 30) return 0;
    return clamp(0.08 * (age - 29), 0, 0.6);
  }
  let hazard: number;
  if (age < exits.p10) hazard = 0;
  else if (age < exits.median) hazard = HAZARD_AT_MEDIAN * ((age - exits.p10) / Math.max(1, exits.median - exits.p10));
  else if (age < exits.p90) hazard = HAZARD_AT_MEDIAN + (HAZARD_AT_P90 - HAZARD_AT_MEDIAN) * ((age - exits.median) / Math.max(1, exits.p90 - exits.median));
  else hazard = HAZARD_AT_P90 + (HAZARD_BEYOND_MAX - HAZARD_AT_P90) * clamp((age - exits.p90) / Math.max(1, exits.max - exits.p90), 0, 1);
  if (overall < OVERALL_GRADE_FLOOR) hazard *= 1.4;
  else if (overall >= OVERALL_GRADE_STAR) hazard *= 0.6;
  return clamp(hazard, 0, 0.85);
}

/** Delta de overall pela curva real; sem amostra na idade, fallback conservador documentado. */
function curveDelta(age: number, calibration: AgingCalibration): { delta: number; via: 'calibration' | 'fallback' } {
  const stats = calibration.yearOverYearDeltaByAge?.[String(age)];
  if (stats && stats.n >= 5) return { delta: Math.round(stats.mean), via: 'calibration' };
  // Fallback: cresce até ~22, patina até 27, cai a partir de 28 (conservador; a calibração real substitui).
  if (age <= 21) return { delta: 1, via: 'fallback' };
  if (age <= 27) return { delta: 0, via: 'fallback' };
  return { delta: -1, via: 'fallback' };
}

/**
 * Crescimento rumo ao potencial verdadeiro: um jovem SOE em direção ao teto dele (a curva média do catálogo
 * mede quem já chegou ao topo; o prospecto em desenvolvimento anda pela DISTÂNCIA até o seu teto).
 * Fator por idade: fecha 30% do gap por temporada aos 16-19, desacelerando até a janela fechar aos 28.
 */
const GROWTH_FACTOR_BY_AGE: Record<number, number> = { 16: 0.3, 17: 0.3, 18: 0.28, 19: 0.28, 20: 0.24, 21: 0.22, 22: 0.18, 23: 0.15, 24: 0.12, 25: 0.1, 26: 0.07, 27: 0.05, 28: 0.03 };

export interface ApplyAgingInput {
  entity: AgingEntity;
  calibration: AgingCalibration;
  /** Chave determinística da temporada (ex. `${worldSeed}:season:${seasonNumber}`). */
  seasonKey: string;
  /** Desenvolvimento do técnico da carreira; ≥85 soma 1, ≤60 subtrai 1 (mesma convenção do drift da Dinastia). */
  coachDevelopment?: number | null;
}

/** Aplica um ano de envelhecimento a uma entidade. Determinístico por (seasonKey, playerId). */
export function applyAging(input: ApplyAgingInput): AgingOutcome {
  const { entity, calibration, seasonKey } = input;
  const rng = createSeededRng(`${seasonKey}:aging:${entity.id}`);
  const events: AgingEvent[] = [];
  const age = entity.age + 1;

  const hazard = retirementHazard(age, entity.overall, calibration);
  const retired = hazard > 0 && rng() < hazard;
  if (retired) {
    events.push({ type: 'RETIRE', playerId: entity.id, age, overall: entity.overall });
    return { entity: { ...entity, age }, events, retired: true };
  }

  const { delta: curve, via } = curveDelta(age, calibration);
  let delta = curve;
  const rate = entity.developmentRate ?? 1;
  if (delta > 0) delta = Math.round(delta * clamp(rate, 0.8, 1.25));

  // Prospecto em desenvolvimento: crescimento pela distância até o teto, CONDICIONADO à forma da temporada —
  // quem rende como titular (rating ≥ 1.00) develops em pleno; abaixo disso, quase nada (×0.2). É daqui que
  // vem o prodígio que não deu certo. Fator por idade fecha 30% do gap aos 16-19 e desacelera até os 28.
  const ceiling = entity.truePotential ?? null;
  if (ceiling != null && age <= 28 && entity.overall < ceiling) {
    const factor = GROWTH_FACTOR_BY_AGE[age] ?? 0;
    const form = entity.runRating == null || entity.runRating >= 1.0 ? 1 : 0.2;
    const jitter = Math.round((rng() - 0.5) * 2); // textura determinística: ±1
    const gapGrowth = Math.max(0, Math.round((ceiling - entity.overall) * factor * clamp(rate, 0.8, 1.25) * form) + jitter);
    if (gapGrowth > delta) delta = gapGrowth;
  }
  if (entity.runRating != null) delta += clamp(Math.round((entity.runRating - 1) * 6), -2, 2);
  if (input.coachDevelopment != null) {
    if (input.coachDevelopment >= 85) delta += 1;
    else if (input.coachDevelopment <= 60) delta -= 1;
  }
  // Teto da carreira: crescimento nunca ultrapassa o potencial verdadeiro conhecido.
  if (ceiling != null && entity.overall >= ceiling) delta = Math.min(delta, 0);
  if (ceiling != null && entity.overall + delta > ceiling) delta = ceiling - entity.overall;

  const to = clamp(entity.overall + delta, 40, 99);
  if (to > entity.overall) events.push({ type: 'GROWTH', playerId: entity.id, from: entity.overall, to, via });
  else if (to < entity.overall) events.push({ type: 'DECLINE', playerId: entity.id, from: entity.overall, to, via });
  else events.push({ type: 'PLATEAU', playerId: entity.id, overall: to });

  return { entity: { ...entity, age, overall: to }, events, retired: false };
}

export interface AdvanceRosterInput {
  entities: AgingEntity[];
  calibration: AgingCalibration;
  seasonKey: string;
  coachDevelopment?: number | null;
}

export interface AdvanceRosterResult {
  survivors: AgingEntity[];
  retirees: Array<{ id: string; age: number; overall: number }>;
  events: AgingEvent[];
  /** Quantas entidades usaram a curva fallback (amostra real insuficiente na idade) — gap honesto da calibração. */
  fallbackUses: number;
}

/** Uma temporada para todo o elenco/cena: envelhece, aposenta e devolve os eventos na ordem dos ids. */
export function advanceRoster(input: AdvanceRosterInput): AdvanceRosterResult {
  const survivors: AgingEntity[] = [];
  const retirees: AdvanceRosterResult['retirees'] = [];
  const events: AgingEvent[] = [];
  let fallbackUses = 0;
  for (const entity of [...input.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    const outcome = applyAging({ entity, calibration: input.calibration, seasonKey: input.seasonKey, coachDevelopment: input.coachDevelopment });
    events.push(...outcome.events);
    if (outcome.retired) retirees.push({ id: entity.id, age: outcome.entity.age, overall: entity.overall });
    else survivors.push(outcome.entity);
    if (outcome.events.some((event) => 'via' in event && event.via === 'fallback')) fallbackUses += 1;
  }
  return { survivors, retirees, events, fallbackUses };
}

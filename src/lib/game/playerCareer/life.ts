// src/lib/game/playerCareer/life.ts
// A vida fora do servidor. Mental (resistência à pressão, 0-100) é diferente de Moral (motivação) e de Cansaço
// (desgaste). Morar fora do país não é castigo automático: a saudade sobe com o tempo longe e o isolamento, e cai com
// visita, companheiros próximos e idioma; a adaptação cresce sozinha com as semanas. Pressão vem do tier, da fama e
// dos resultados. A confiança do coach e a condição física completam o quadro. Tudo com limites e retorno ao normal.
import { regionOf } from './calendar';
import type { PlayerCareerState, TournamentResult } from './engine';

export interface CareerLife {
  /** Mental: aguentar pressão, crítica e derrota (0-100). */
  mind: number;
  /** Saudade de casa (0-100): só sobe morando fora. */
  homesick: number;
  /** Adaptação ao país/time (0-100): em casa é 100. */
  adaptation: number;
  /** Pressão de fora (0-100): tier, fama, resultados. */
  pressure: number;
  /** Confiança do coach em você (0-100). */
  coachTrust: number;
  /** Condição física (0-100). */
  condition: number;
  /** Semanas seguidas morando fora. */
  abroadWeeks: number;
  /** Semanas desde a última visita a casa (morando fora). */
  weeksSinceVisit: number;
  /** Marcas de decisões que voltam depois (ex.: "visita_familia_planejada", "racha_interno:risco"). */
  flags: string[];
}

export const DEFAULT_LIFE: CareerLife = { mind: 60, homesick: 0, adaptation: 100, pressure: 30, coachTrust: 50, condition: 80, abroadWeeks: 0, weeksSinceVisit: 0, flags: [] };
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/** A região do time (lan house e sem dado: a sua). */
export function orgRegionOf(state: PlayerCareerState, orgRegion: string | null | undefined): string {
  return state.orgId === 'lan-house' || !orgRegion ? regionOf(state.country) : orgRegion;
}

/** Você mora fora do seu país quando o time é de outra região (a Europa para um brasileiro, por exemplo). */
export const livesAbroad = (state: PlayerCareerState, orgRegion: string | null | undefined): boolean => orgRegionOf(state, orgRegion) !== regionOf(state.country);

export function lifeOf(state: PlayerCareerState): CareerLife {
  return { ...DEFAULT_LIFE, ...(state.life ?? {}), flags: state.life?.flags ?? [] };
}

export const hasFlag = (state: PlayerCareerState, flag: string) => lifeOf(state).flags.some((entry) => entry === flag || entry.startsWith(`${flag}:`));

/** Marca uma decisão (sem repetir; guarda as 40 mais recentes). */
export function withFlags(life: CareerLife, flags: string[]): CareerLife {
  const next = [...life.flags.filter((flag) => !flags.includes(flag)), ...flags];
  return { ...life, flags: next.slice(-40) };
}

export interface LifeContext { abroad: boolean; teamFluency: number; avgRelationship: number; level: number; fame: number; result?: TournamentResult | null }

/**
 * Passa o tempo de um campeonato (~4 semanas). Em casa: saudade some, adaptação volta a 100. Fora: adaptação sobe
 * com o tempo, idioma e amigos; saudade sobe devagar e mais rápido com isolamento e muito tempo sem visita. Mental e
 * pressão voltam devagar ao normal e respondem ao resultado; condição física acompanha o cansaço.
 */
export function advanceLife(state: PlayerCareerState, ctx: LifeContext, weeks = 4): { life: CareerLife; moraleDelta: number; notes: string[] } {
  const life = lifeOf(state);
  const notes: string[] = [];
  let { mind, homesick, adaptation, pressure, condition, abroadWeeks, weeksSinceVisit } = life;
  if (ctx.abroad) {
    if (abroadWeeks === 0) { adaptation = Math.min(adaptation, 40); notes.push('Mudança de país: começa a adaptação.'); }
    abroadWeeks += weeks;
    weeksSinceVisit += weeks;
    adaptation = Math.round(clamp(adaptation + 3 + (ctx.teamFluency >= 70 ? 2 : 0) + (ctx.avgRelationship >= 70 ? 2 : 0)));
    homesick = Math.round(clamp(homesick + 2 + (weeksSinceVisit > 16 ? 2 : 0) + (ctx.avgRelationship < 45 ? 2 : 0) - (adaptation >= 75 ? 2 : 0)));
  } else {
    abroadWeeks = 0;
    weeksSinceVisit = 0;
    homesick = clamp(homesick - 8);
    adaptation = clamp(adaptation + 15);
  }
  // Pressão: o tier e a fama empurram, o resultado mexe, e ela volta devagar para o patamar do tier.
  const base = 20 + (5 - Math.min(5, ctx.level)) * 8 + (ctx.fame >= 100000 ? 10 : ctx.fame >= 20000 ? 5 : 0);
  const placement = ctx.result?.placement;
  const shock = placement === 'Campeão' ? -8 : placement === 'Vice' ? 0 : placement === 'Semis' ? 2 : placement ? 6 : 0;
  pressure = Math.round(clamp(pressure + (base - pressure) * 0.3 + shock));
  // Mental: volta para 60 (mais rápido quando está muito alto, para não virar bônus fixo); título dá confiança,
  // queda cedo com pressão alta pesa; saudade alta tira um pouco.
  // Chegar longe também dá confiança (final +2, semi +1); cair cedo com pressão alta pesa.
  const resultMind = placement === 'Campeão' ? 4 : placement === 'Vice' ? 2 : placement === 'Semis' ? 1 : placement && pressure >= 60 ? -2 : 0;
  // Volta ao normal devagar: o que você investe (semana, conversas, resultado) segura a Cabeça alta por um tempo.
  const pull = mind > 80 ? 0.15 : 0.1;
  mind = Math.round(clamp(mind + (60 - mind) * pull + resultMind - (homesick >= 70 ? 2 : 0) - (pressure >= 80 ? 1 : 0)));
  condition = Math.round(clamp(condition + ((state.fatigue ?? 0) >= 70 ? -6 : (state.fatigue ?? 0) >= 45 ? -2 : 4)));
  if (homesick >= 70 && life.homesick < 70) notes.push('A saudade de casa apertou.');
  if (adaptation >= 80 && life.adaptation < 80 && ctx.abroad) notes.push('Você já se sente em casa no país novo.');
  const moraleDelta = homesick >= 70 ? -2 : 0;
  return { life: { ...life, mind, homesick, adaptation, pressure, condition, abroadWeeks, weeksSinceVisit }, moraleDelta, notes };
}

/** Quanto o Mental (estado) puxa o Mental da carta em quadra: até 3 pontos para cada lado. */
export const mindBump = (mind: number | undefined): number => clamp(Math.round(((mind ?? 60) - 60) / 12), -3, 3);

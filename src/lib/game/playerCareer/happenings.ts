// src/lib/game/playerCareer/happenings.ts
// Acontecimentos da carreira (career-events.game.json: 150 situações do usuário, por fase, com gatilho, peso e
// cooldown). A cada campeonato há chance de um antes do jogo, depois do jogo ou na semana; a chance sobe com o
// momento (título, queda feia, fama, moral baixa, cansaço, Major). A escolha tem 3 caminhos e o resultado depende
// do seu mental e da sua moral: a mesma decisão pode sair melhor ou pior.
import rawEvents from '$lib/data/cs/career-events.game.json';
import { createSeededRng } from '../simulation';
import { orgOf, playedCount, type PlayerCareerState, type TournamentResult } from './engine';
import { matesOf, myPlayerOf } from './squad';

export type HappeningTrigger = 'pre' | 'post' | 'between';
export type HappeningEffect = 'performance' | 'fatigue' | 'mental' | 'reputation' | 'money' | 'chemistry' | 'fame';

export interface HappeningChoice { text: string; effects: Partial<Record<HappeningEffect, number>>; consequence: string }
export interface Happening {
  id: string;
  phase: string;
  /** Fase mínima (1 online amador … 10 Tier S e legado). */
  tierMin: number;
  situation: string;
  trigger: HappeningTrigger;
  weight: number;
  /** Campeonatos até poder aparecer de novo. */
  cooldown: number;
  choices: HappeningChoice[];
}

export const HAPPENINGS = (rawEvents as unknown as { events: Happening[] }).events;
export const HAPPENING_BY_ID = new Map(HAPPENINGS.map((event) => [event.id, event]));

/** As fases do documento que cada degrau da pirâmide vive (com uma abaixo, para o passado ainda aparecer). */
const PHASES_BY_LEVEL: Record<number, [number, number]> = { 5: [1, 2], 4: [2, 4], 3: [4, 5], 2: [5, 7], 1: [7, 8], 0: [8, 10] };

export const TRIGGER_LABEL: Record<HappeningTrigger, string> = { pre: 'Antes do jogo', post: 'Depois do jogo', between: 'Na semana' };

export interface HappeningContext {
  eventIndex: number;
  /** Resultado do campeonato que acabou (para o "depois do jogo"). */
  result?: TournamentResult;
}

/** Chance do acontecimento, pelo gatilho e pelo momento da carreira. */
export function happeningChance(state: PlayerCareerState, trigger: HappeningTrigger, context: HappeningContext): number {
  const fame = state.fame ?? 0;
  const famous = fame >= 20000 ? 0.08 : fame >= 5000 ? 0.04 : 0;
  if (trigger === 'post') {
    const result = context.result;
    const extreme = result && (result.placement === 'Campeão' || result.mvp?.you || (result.placement === 'Quartas' && result.rating < 0.95));
    return Math.min(0.6, 0.3 + (extreme ? 0.15 : 0) + famous);
  }
  if (trigger === 'between') {
    const pressure = ((state.morale ?? 60) < 40 ? 0.1 : 0) + ((state.fatigue ?? 0) >= 70 ? 0.1 : 0);
    return Math.min(0.55, 0.25 + pressure + famous / 2);
  }
  const entry = state.calendar?.[context.eventIndex];
  const big = entry?.format === 'major' || entry?.tier === 'Major' || entry?.tier === 'S';
  return Math.min(0.5, 0.2 + (big ? 0.15 : 0) + famous);
}

/** Sorteia (ou não) um acontecimento para o gatilho e deixa esperando a sua escolha. */
export function rollHappening(state: PlayerCareerState, trigger: HappeningTrigger, context: HappeningContext): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingHappening || state.pendingMove) return state;
  const played = playedCount(state);
  const rng = createSeededRng(`${state.seed}:happening:${state.seasonNumber}:${played}:${trigger}:${context.eventIndex}`);
  if (rng() >= happeningChance(state, trigger, context)) return state;
  const [low, high] = PHASES_BY_LEVEL[orgOf(state.orgId, state).level] ?? [1, 2];
  const log = state.happeningLog ?? {};
  const pool = HAPPENINGS.filter((event) => event.trigger === trigger && event.tierMin >= low && event.tierMin <= high
    && (log[event.id] === undefined || played - log[event.id] >= Math.max(event.cooldown, 8)));
  const total = pool.reduce((sum, event) => sum + event.weight, 0);
  if (!total) return state;
  let ticket = rng() * total;
  const picked = pool.find((event) => (ticket -= event.weight) < 0) ?? pool[pool.length - 1];
  return { ...state, pendingHappening: { id: picked.id, trigger, eventIndex: context.eventIndex }, happeningLog: { ...log, [picked.id]: played } };
}

/** Unidades de cada efeito por degrau: fama e dinheiro valem mais lá em cima. */
const FAME_UNIT: Record<number, number> = { 5: 20, 4: 60, 3: 150, 2: 400, 1: 1000, 0: 2500 };
const MONEY_UNIT: Record<number, number> = { 5: 50, 4: 200, 3: 800, 2: 2500, 1: 6000, 0: 12000 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface HappeningChip { label: string; value: number; display?: string }

export interface HappeningOutcome {
  state: PlayerCareerState;
  success: boolean;
  line: string;
  chips: HappeningChip[];
}

/** Chance de a escolha sair como você planejou: mental da carta e moral (25% a 90%). */
export function happeningSuccessChance(state: PlayerCareerState): number {
  const mental = Number(myPlayerOf(state).mental ?? 60);
  return clamp(0.5 + (mental - 70) / 80 + ((state.morale ?? 60) - 60) / 200, 0.25, 0.9);
}

/** Aplica a escolha: deu certo, o lado bom vale inteiro e o ruim pela metade; deu errado, o contrário. */
export function resolveHappening(state: PlayerCareerState, choiceIndex: number): HappeningOutcome {
  const pending = state.pendingHappening;
  const event = pending ? HAPPENING_BY_ID.get(pending.id) : undefined;
  const choice = event?.choices[choiceIndex];
  if (!pending || !event || !choice) return { state, success: false, line: '', chips: [] };
  const rng = createSeededRng(`${state.seed}:happening-roll:${event.id}:${playedCount(state)}:${choiceIndex}`);
  const success = rng() < happeningSuccessChance(state);
  const scaled = (value: number) => (value > 0 ? (success ? value : Math.trunc(value / 2)) : (success ? Math.trunc(value / 2) : value));
  const effect = (key: HappeningEffect) => scaled(choice.effects[key] ?? 0);
  const level = orgOf(state.orgId, state).level;
  const chips: HappeningChip[] = [];

  const formDelta = Math.round(effect('performance') / 2);
  const fatigueDelta = effect('fatigue') * 2;
  const moraleDelta = effect('mental') * 2;
  const reputationDelta = effect('reputation') * 2;
  const chemistryDelta = effect('chemistry') * 2;
  const fameDelta = effect('fame') * (FAME_UNIT[level] ?? 100);
  const moneyDelta = effect('money') * (MONEY_UNIT[level] ?? 200);

  const relationships = { ...state.relationships };
  if (chemistryDelta) for (const mate of matesOf(state)) relationships[mate.player.id] = clamp((relationships[mate.player.id] ?? mate.relationship) + chemistryDelta, 0, 100);
  const next: PlayerCareerState = {
    ...state,
    pendingHappening: null,
    form: clamp((state.form ?? 0) + formDelta, -3, 3),
    fatigue: clamp((state.fatigue ?? 0) + fatigueDelta, 0, 100),
    morale: clamp((state.morale ?? 60) + moraleDelta, 0, 100),
    reputation: clamp((state.reputation ?? 50) + reputationDelta, 0, 100),
    relationships,
    fame: Math.max(0, (state.fame ?? 0) + fameDelta),
    money: Math.max(0, (state.money ?? 0) + moneyDelta)
  };
  if (formDelta) chips.push({ label: 'Forma', value: formDelta });
  if (moraleDelta) chips.push({ label: 'Moral', value: moraleDelta });
  if (chemistryDelta) chips.push({ label: 'Química', value: chemistryDelta });
  if (reputationDelta) chips.push({ label: 'Reputação', value: reputationDelta });
  if (fameDelta) chips.push({ label: 'Fãs', value: fameDelta, display: `${fameDelta > 0 ? '+' : '−'}${Math.abs(fameDelta).toLocaleString('pt-BR')} fãs` });
  if (moneyDelta) chips.push({ label: 'Caixa', value: moneyDelta, display: `${moneyDelta > 0 ? '+' : '−'}US$ ${Math.abs(moneyDelta).toLocaleString('pt-BR')}` });
  if (fatigueDelta) chips.push({ label: 'Cansaço', value: -fatigueDelta, display: `Cansaço ${fatigueDelta > 0 ? '+' : '−'}${Math.abs(fatigueDelta)}` });
  const line = `${choice.consequence} ${success ? 'Saiu como você queria.' : 'Não saiu como você queria.'}`;
  return { state: next, success, line, chips };
}

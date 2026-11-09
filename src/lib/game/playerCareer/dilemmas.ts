// src/lib/game/playerCareer/dilemmas.ts
// Os 24 dilemas da semana (career-dilemmas): escolhas que se excluem, só quando existe conflito real (as condições da
// planilha conferidas no estado). Aparecem entre campeonatos, no máximo 3 por temporada e dentro do teto de
// acontecimentos do ano. O efeito vem da planilha e o contexto pesa: com saudade alta, voltar para casa rende mais;
// com o corpo cansado, o que cansa cansa mais. Algumas escolhas mexem de verdade no calendário ou no mercado, e toda
// escolha deixa uma marca na vida (para o histórico e para o que vem depois).
import rawDilemmas from '$lib/data/cs/career-dilemmas.game.json';
import { createSeededRng } from '../simulation';
import { happeningOffers, playedCount, skipEvent, type PlayerCareerState } from './engine';
import { applyEffects, type AgendaChip, type AgendaEffects } from './agenda';
import { careerCtx, conditionsHold, isUnsupported } from './conditions';
import { lifeOf, withFlags, type CareerLife } from './life';
import type { HappeningRecord } from './happenings';
import { retier } from './tiers';

export interface DilemmaOption { key: 'A' | 'B' | 'C'; text: string; effects: AgendaEffects }
export interface Dilemma { id: string; title: string; condition: string[]; cooldownWeeks: number; options: DilemmaOption[] }

const RAW = (rawDilemmas as unknown as { dilemmas: Dilemma[] }).dilemmas;

/** "Eliminação por 13 a 0" afirma um placar de mapa que o jogo não guarda: só sai depois de uma série perdida por
 *  0-2 ou 0-3, com o título dizendo só o que é verdade. */
const EXTRA_CONDITIONS: Record<string, string[]> = { 'dilema-008': ['derrota_13_0'] };
const TITLE_FIX: Record<string, string> = { 'dilema-008': 'Eliminação dura' };

export const DILEMMAS: Dilemma[] = RAW.map((dilemma) => ({
  ...dilemma,
  title: retier(TITLE_FIX[dilemma.id] ?? dilemma.title),
  condition: [...dilemma.condition, ...(EXTRA_CONDITIONS[dilemma.id] ?? [])]
})).filter((dilemma) => !isUnsupported(dilemma.condition));
export const UNSUPPORTED_DILEMMAS = RAW.filter((dilemma) => isUnsupported([...dilemma.condition, ...(EXTRA_CONDITIONS[dilemma.id] ?? [])])).map((dilemma) => dilemma.id);
export const DILEMMA_BY_ID = new Map(DILEMMAS.map((dilemma) => [dilemma.id, dilemma]));

/** O que a escolha muda de verdade: proposta de fora, proposta de time maior, folga de um campeonato, viagem para
 *  casa (saudade cai) ou viagem marcada. */
type Move = 'region' | 'up' | 'skip' | 'visit' | 'plan_visit';
const MOVES: Record<string, Partial<Record<'A' | 'B' | 'C', Move>>> = {
  'dilema-001': { A: 'visit' },
  'dilema-002': { A: 'visit' },
  'dilema-003': { C: 'plan_visit' },
  'dilema-004': { A: 'region', B: 'region' },
  'dilema-005': { B: 'plan_visit' },
  'dilema-019': { B: 'region', C: 'region' },
  'dilema-020': { B: 'up' },
  'dilema-021': { B: 'skip' }
};

/** Mudanças na vida fora do servidor (adaptação, condição física) que a planilha descreve no texto. */
const LIFE_DELTA: Record<string, Partial<Record<'A' | 'B' | 'C', Partial<Pick<CareerLife, 'adaptation' | 'condition' | 'homesick' | 'coachTrust'>>>>> = {
  'dilema-010': { A: { coachTrust: 4 }, C: { coachTrust: -3 } },
  'dilema-011': { B: { coachTrust: 2 } },
  'dilema-013': { A: { condition: 12 }, B: { condition: 6, coachTrust: 2 }, C: { condition: -15 } },
  'dilema-017': { A: { adaptation: 8 }, B: { adaptation: 5 }, C: { adaptation: -3, homesick: 4 } },
  'dilema-023': { A: { coachTrust: 3 } }
};

/** Marcas com nome (as do documento de regras); toda escolha também marca "dilema-NNN:X". */
const NAMED_FLAGS: Record<string, Partial<Record<'A' | 'B' | 'C', string>>> = {
  'dilema-003': { C: 'visita_familia_planejada' },
  'dilema-005': { B: 'visita_familia_planejada' },
  'dilema-010': { C: 'acordo_folgas_org' },
  'dilema-011': { B: 'comunicacao_aberta_com_coach', C: 'tensao_igl' },
  'dilema-016': { A: 'promessa_patrocinio' },
  'dilema-019': { A: 'acordo_folgas_org' },
  'dilema-023': { A: 'comunicacao_aberta_com_coach' }
};

/** No máximo 3 dilemas por temporada; chance de 25% entre campeonatos quando algum vale. */
export const DILEMMAS_PER_SEASON = 3;
const DILEMMA_CHANCE = 0.25;

const seasonDilemmas = (state: PlayerCareerState) => (state.happeningHistory ?? []).filter((record) => record.season === state.seasonNumber && record.id.startsWith('dilema-'));

function onCooldown(state: PlayerCareerState, dilemma: Dilemma): boolean {
  const last = [...(state.happeningHistory ?? [])].reverse().find((record) => record.id === dilemma.id);
  if (!last) return false;
  // Cooldown em semanas vira meses (4 semanas por mês) no relógio absoluto: não zera no ano novo.
  const now = state.year * 12 + Math.min(11, Math.max(0, (state.calendar?.find((entry) => entry.status === 'UPCOMING')?.month ?? 12) - 1));
  return now - (last.year * 12 + last.month) < Math.ceil(dilemma.cooldownWeeks / 4);
}

/** Os dilemas que valem agora (condição real, fora do cooldown). */
export function dilemmasNow(state: PlayerCareerState): Dilemma[] {
  if (state.status !== 'ACTIVE') return [];
  const ctx = careerCtx(state, 'between');
  return DILEMMAS.filter((dilemma) => !onCooldown(state, dilemma) && conditionsHold(dilemma.condition, ctx));
}

/** Entre campeonatos, às vezes um dilema: só sem outra coisa esperando resposta e dentro dos limites do ano. */
export function rollDilemma(state: PlayerCareerState, eventIndex: number): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingHappening || state.pendingTalk || state.pendingDilemma || state.pendingMove) return state;
  if (seasonDilemmas(state).length >= DILEMMAS_PER_SEASON) return state;
  if ((state.happeningHistory ?? []).filter((record) => record.season === state.seasonNumber).length >= 10) return state;
  const rng = createSeededRng(`${state.seed}:dilemma:${state.seasonNumber}:${playedCount(state)}:${eventIndex}`);
  if (rng() >= DILEMMA_CHANCE) return state;
  const pool = dilemmasNow(state);
  if (!pool.length) return state;
  const picked = pool[Math.floor(rng() * pool.length)];
  const month = Math.min(11, Math.max(0, (state.calendar?.find((entry) => entry.status === 'UPCOMING')?.month ?? 12) - 1));
  const record: HappeningRecord = { id: picked.id, season: state.seasonNumber, year: state.year, month, severity: 'moderado' };
  return { ...state, pendingDilemma: { id: picked.id, eventIndex }, happeningHistory: [...(state.happeningHistory ?? []), record].slice(-160) };
}

export interface DilemmaOutcome { state: PlayerCareerState; line: string; chips: AgendaChip[] }

/** O efeito com o contexto: saudade alta faz a volta para casa render mais; corpo baixo faz o cansaço pesar mais. */
function withContext(state: PlayerCareerState, dilemma: Dilemma, option: DilemmaOption): AgendaEffects {
  const life = lifeOf(state);
  const goingHome = MOVES[dilemma.id]?.[option.key] === 'visit';
  const boost = goingHome && life.homesick >= 60 ? 1.5 : 1;
  const tiredBody = life.condition < 50 ? 1.5 : 1;
  const effects = { ...option.effects };
  if (boost > 1) {
    if (effects.morale && effects.morale > 0) effects.morale = Math.round(effects.morale * boost);
    if (effects.mind && effects.mind > 0) effects.mind = Math.round(effects.mind * boost);
  }
  if (effects.fatigue && effects.fatigue > 0) effects.fatigue = Math.round(effects.fatigue * tiredBody);
  return effects;
}

export function resolveDilemma(state: PlayerCareerState, key: 'A' | 'B' | 'C'): DilemmaOutcome {
  const pending = state.pendingDilemma;
  const dilemma = pending ? DILEMMA_BY_ID.get(pending.id) : undefined;
  const option = dilemma?.options.find((candidate) => candidate.key === key);
  if (!pending || !dilemma || !option) return { state, line: '', chips: [] };
  const chips: AgendaChip[] = [];
  let next = applyEffects({ ...state, pendingDilemma: null }, withContext(state, dilemma, option), chips);
  const life = lifeOf(next);
  const delta = LIFE_DELTA[dilemma.id]?.[key] ?? {};
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  let updated: CareerLife = {
    ...life,
    adaptation: clamp(life.adaptation + (delta.adaptation ?? 0)),
    condition: clamp(life.condition + (delta.condition ?? 0)),
    homesick: clamp(life.homesick + (delta.homesick ?? 0)),
    coachTrust: clamp(life.coachTrust + (delta.coachTrust ?? 0))
  };
  if (delta.adaptation) chips.push({ label: 'Adaptação', value: delta.adaptation, kind: 'team' });
  if (delta.condition) chips.push({ label: 'Corpo', value: delta.condition, kind: 'morale' });
  if (delta.coachTrust) chips.push({ label: 'Confiança do coach', value: delta.coachTrust, kind: 'team' });
  const move = MOVES[dilemma.id]?.[key];
  let extra = '';
  if (move === 'visit') {
    updated = { ...updated, homesick: Math.max(0, updated.homesick - 25), weeksSinceVisit: 0 };
    if (life.homesick > 0) chips.push({ label: 'Saudade', value: -Math.min(25, life.homesick), kind: 'morale' });
  }
  updated = withFlags(updated, [`${dilemma.id}:${key}`, ...(NAMED_FLAGS[dilemma.id]?.[key] ? [NAMED_FLAGS[dilemma.id][key]!] : [])]);
  next = { ...next, life: updated };
  if (move === 'skip') {
    const skipped = skipEvent(next, pending.eventIndex);
    next = skipped.state;
    if (skipped.name) extra = ` O time liberou você do ${skipped.name}.`;
  } else if (move === 'region' || move === 'up') {
    const offered = happeningOffers(next, move, `${dilemma.title}: ${option.text.toLowerCase()}.`);
    if (offered.pendingMove) extra = ' A proposta chegou: decida na tela de mercado.';
    next = offered;
  }
  // O histórico guarda a escolha.
  const history = [...(next.happeningHistory ?? [])];
  const at = history.map((record) => record.id).lastIndexOf(dilemma.id);
  if (at >= 0) history[at] = { ...history[at], choice: ['A', 'B', 'C'].indexOf(key), success: true, line: option.text };
  return { state: { ...next, happeningHistory: history }, line: `Você decidiu: ${option.text.charAt(0).toLowerCase()}${option.text.slice(1)}.${extra}`, chips };
}

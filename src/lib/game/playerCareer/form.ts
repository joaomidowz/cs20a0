// src/lib/game/playerCareer/form.ts
// O arco da carreira (D1 do desenho de 2026-11-09). A temporada anda em blocos de 3 a 4 campeonatos (o "trimestre"), e
// cada bloco tem uma fase do seu time: alta, normal ou baixa. A fase segue uma cadeia com persistência sorteada pela seed
// (seed + temporada + bloco), que o resultado do bloco anterior inclina um pouco. Depois de um bloco ou de uma temporada
// dominante, os rivais estudam vocês: um bônus de força contra o seu time que some quando vocês param de ganhar e que as
// cartas "Mudar o playbook" e "Estudar as demos deles" cortam no bloco do próximo campeonato. Tudo sai do save
// (calendário, histórico e o corte do playbook): o mesmo save dá sempre o mesmo arco.
import { createSeededRng } from '../simulation';
import type { PlayerCareerState, TournamentResult } from './engine';
import { currentLevelOf } from './tiers';

export type FormPhase = 'alta' | 'normal' | 'baixa';
export const FORM_PHASES: FormPhase[] = ['alta', 'normal', 'baixa'];

/** Os números do arco, num lugar só: a calibração (calibration.ts) mede variações deles sem mexer no jogo. */
export interface ArcTuning {
  /** Força que a fase alta soma (e a baixa tira) do seu time em cada campeonato. */
  phasePower: number;
  /** Chance de a fase alta (ou a baixa) continuar no bloco seguinte, sem contar o resultado. */
  stay: number;
  /** Probabilidade que um bloco dominante leva para a fase alta (e um bloco sem final, para a baixa). */
  tilt: number;
  /** Teto do estudo dos rivais, em pontos de força contra o seu time. */
  studyMax: number;
  /** Quanto o domínio do bloco anterior acima do piso vira estudo. */
  studyBlock: number;
  blockFloor: number;
  /** Quanto o domínio dos últimos campeonatos (o ano dominante) acima do piso vira estudo. */
  studySeason: number;
  seasonFloor: number;
}

/** Valores de partida, medidos num protótipo sobre 67fa6bf (antes dos planos 02 a 06); a Task 10 do plano 07 mede de novo
 *  com o jogo final e grava aqui os calibrados. */
export const ARC_TUNING: ArcTuning = { phasePower: 1.5, stay: 0.5, tilt: 0.1, studyMax: 3, studyBlock: 4, blockFloor: 0.5, studySeason: 6, seasonFloor: 0.4 };

/** Cadeia entre blocos (linha: a fase do bloco anterior). A fase tende a continuar; normal é a mais comum. */
export function formTransition(stay: number = ARC_TUNING.stay): Record<FormPhase, Record<FormPhase, number>> {
  return {
    alta: { alta: stay, normal: 0.9 - stay, baixa: 0.1 },
    normal: { alta: 0.2, normal: 0.6, baixa: 0.2 },
    baixa: { alta: 0.1, normal: 0.9 - stay, baixa: stay }
  };
}

/** Primeira temporada da carreira (sem histórico): o primeiro bloco é sempre normal, você acabou de chegar. */
export const FORM_START: Record<FormPhase, number> = { alta: 0, normal: 1, baixa: 0 };
/** Bloco bom: domínio a partir disto. */
export const FORM_GOOD_BLOCK = 0.5;
/** Final perdida vale isto de um título no domínio (Astralis 2018: 10 títulos em 12 finais). */
export const LOST_FINAL_WEIGHT = 0.4;
/** O fim da temporada passada que abre a cadeia desta: os últimos campeonatos dela. */
export const SEASON_TAIL = 3;

const seasonSeedOf = (state: Pick<PlayerCareerState, 'seed' | 'seasonNumber'>) => `${state.seed}:season:${state.seasonNumber}`;

/** Tamanhos dos blocos de uma temporada com `count` campeonatos: sempre 3 ou 4 (calendário curto de troca no meio do ano:
 *  um bloco só, ou 3 e 2). A ordem dos blocos sai da seed. */
export function blockSizes(count: number, seed: string): number[] {
  if (count <= 0) return [];
  if (count <= 4) return [count];
  const blocks = Math.ceil(count / 4);
  const base = Math.floor(count / blocks);
  const extra = count % blocks;
  const sizes = Array.from({ length: blocks }, (_, index) => base + (index < extra ? 1 : 0));
  const rng = createSeededRng(`${seed}:form-blocks`);
  for (let index = sizes.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [sizes[index], sizes[swap]] = [sizes[swap], sizes[index]];
  }
  return sizes;
}

const sizesOf = (state: PlayerCareerState) => blockSizes(state.calendar?.length ?? 0, seasonSeedOf(state));

/** Em que bloco da temporada está o campeonato (0 = o primeiro). */
export function formBlockOf(state: PlayerCareerState, eventIndex: number): number {
  const sizes = sizesOf(state);
  let end = 0;
  for (let block = 0; block < sizes.length; block += 1) {
    end += sizes[block];
    if (eventIndex < end) return block;
  }
  return Math.max(0, sizes.length - 1);
}

/** Os índices do bloco: do primeiro campeonato (incluso) ao fim (excluso). */
export function blockRange(state: PlayerCareerState, block: number): [number, number] {
  const sizes = sizesOf(state);
  const start = sizes.slice(0, block).reduce((sum, size) => sum + size, 0);
  return [start, start + (sizes[block] ?? 0)];
}

/** Chave do bloco no save (temporada:bloco), para o corte do playbook. */
export const blockKeyOf = (state: PlayerCareerState, eventIndex: number) => `${state.seasonNumber}:${formBlockOf(state, eventIndex)}`;

/** Resultados jogados num trecho do calendário. Qualificatória (plano 4) não é título: fica fora do domínio. */
export const playedIn = (state: PlayerCareerState, [from, to]: [number, number]): TournamentResult[] =>
  (state.calendar ?? []).slice(from, to).flatMap((entry) => (entry.result && !entry.result.skipped && entry.kind !== 'qualifier' ? [entry.result] : []));
/** Os campeonatos jogados na temporada passada. */
export const lastSeasonResults = (state: PlayerCareerState): TournamentResult[] => (state.history.at(-1)?.tournaments ?? []).filter((result) => !result.skipped);
const finalsIn = (results: TournamentResult[]) => results.filter((result) => result.placement === 'Campeão' || result.placement === 'Vice').length;

/** Domínio de um conjunto de campeonatos: títulos, mais um peso pelas finais perdidas, sobre o que foi jogado. */
export function dominanceOf(results: TournamentResult[]): number {
  if (!results.length) return 0;
  const titles = results.filter((result) => result.placement === 'Campeão').length;
  const lostFinals = results.filter((result) => result.placement === 'Vice').length;
  return (titles + LOST_FINAL_WEIGHT * lostFinals) / results.length;
}

/** Leva `amount` de probabilidade para `to`, tirando primeiro da fase oposta e depois da normal. */
function shift(row: Record<FormPhase, number>, to: 'alta' | 'baixa', amount: number): Record<FormPhase, number> {
  const opposite: FormPhase = to === 'alta' ? 'baixa' : 'alta';
  const fromOpposite = Math.min(row[opposite], amount);
  const fromNormal = Math.min(row.normal, amount - fromOpposite);
  return { ...row, [to]: row[to] + fromOpposite + fromNormal, [opposite]: row[opposite] - fromOpposite, normal: row.normal - fromNormal };
}

/** O resultado do bloco anterior inclina a cadeia: bloco dominante sobe, bloco sem final desce. */
function tilt(row: Record<FormPhase, number>, results: TournamentResult[], amount: number): Record<FormPhase, number> {
  if (!results.length) return row;
  if (dominanceOf(results) >= FORM_GOOD_BLOCK) return shift(row, 'alta', amount);
  return finalsIn(results) === 0 && results.length >= 2 ? shift(row, 'baixa', amount) : row;
}

/** Como a temporada passada terminou, para abrir a cadeia desta: dominante fecha em alta, sem final fecha em baixa. */
function seasonClose(results: TournamentResult[]): FormPhase {
  if (dominanceOf(results) >= FORM_GOOD_BLOCK) return 'alta';
  return results.length >= 4 && finalsIn(results) === 0 ? 'baixa' : 'normal';
}

function draw(row: Record<FormPhase, number>, seed: string): FormPhase {
  const total = FORM_PHASES.reduce((sum, phase) => sum + row[phase], 0);
  let roll = createSeededRng(seed)() * total;
  for (const phase of FORM_PHASES) {
    roll -= row[phase];
    if (roll < 0) return phase;
  }
  return 'normal';
}

/** A fase com números escolhidos (a calibração usa; o jogo usa formPhaseOf). */
export function formPhaseWith(state: PlayerCareerState, eventIndex: number, tuning: ArcTuning): FormPhase {
  const target = formBlockOf(state, eventIndex);
  const seed = seasonSeedOf(state);
  const chain = formTransition(tuning.stay);
  const last = lastSeasonResults(state);
  const opening = state.history.length ? chain[seasonClose(last)] : FORM_START;
  let phase = draw(tilt(opening, last.slice(-SEASON_TAIL), tuning.tilt), `${seed}:form:0`);
  for (let block = 1; block <= target; block += 1) {
    phase = draw(tilt(chain[phase], playedIn(state, blockRange(state, block - 1)), tuning.tilt), `${seed}:form:${block}`);
  }
  return phase;
}

/** A fase do seu time no bloco do campeonato: a cadeia do primeiro bloco da temporada até o bloco pedido. */
export function formPhaseOf(state: PlayerCareerState, eventIndex: number): FormPhase {
  return formPhaseWith(state, eventIndex, ARC_TUNING);
}

/** Estudo dos rivais: só contra times de Tier S (nível 0, Elite, e nível 1). */
export const STUDY_MAX_LEVEL = 1;
/** Quantos campeonatos para trás o ano dominante é lembrado. */
export const STUDY_WINDOW = 12;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** O estudo antes do corte do playbook, com números escolhidos: o bloco anterior (no 1º bloco, o fim da temporada
 *  passada) e os últimos STUDY_WINDOW campeonatos, cada um acima do seu piso. */
export function rawRivalStudyWith(state: PlayerCareerState, eventIndex: number, tuning: ArcTuning): number {
  if (currentLevelOf(state, state.orgId) > STUDY_MAX_LEVEL) return 0;
  const block = formBlockOf(state, eventIndex);
  const [start] = blockRange(state, block);
  const previous = block > 0 ? playedIn(state, blockRange(state, block - 1)) : lastSeasonResults(state).slice(-SEASON_TAIL);
  const recent = [...lastSeasonResults(state), ...playedIn(state, [0, start])].slice(-STUDY_WINDOW);
  const value = tuning.studyBlock * Math.max(0, dominanceOf(previous) - tuning.blockFloor) + tuning.studySeason * Math.max(0, dominanceOf(recent) - tuning.seasonFloor);
  return round1(Math.min(tuning.studyMax, value));
}

/** O estudo com o corte do playbook do bloco, com números escolhidos. */
export function rivalStudyWith(state: PlayerCareerState, eventIndex: number, tuning: ArcTuning): number {
  const raw = rawRivalStudyWith(state, eventIndex, tuning);
  const cut = state.studyCut?.key === blockKeyOf(state, eventIndex) ? state.studyCut.factor : 1;
  return round1(raw * cut);
}

/** Bônus de força dos rivais nas séries contra o seu time no campeonato (já com o corte do playbook do bloco). */
export function rivalStudyOf(state: PlayerCareerState, eventIndex: number): number {
  return rivalStudyWith(state, eventIndex, ARC_TUNING);
}

/** O arco de um campeonato, congelado do começo ao fim (vai no save do evento em andamento): a fase, a força que ela
 *  vale e o estudo dos rivais. */
export interface EventArc { phase: FormPhase; phasePower: number; study: number }

export function eventArcOf(state: PlayerCareerState, eventIndex: number, tuning: ArcTuning = ARC_TUNING): EventArc {
  const phase = formPhaseWith(state, eventIndex, tuning);
  return { phase, phasePower: phase === 'alta' ? tuning.phasePower : phase === 'baixa' ? -tuning.phasePower : 0, study: rivalStudyWith(state, eventIndex, tuning) };
}

/** O que o arco faz com a força do seu time no campeonato: a fase soma, o estudo dos rivais tira. */
export const arcPowerOf = (arc: EventArc): number => arc.phasePower - arc.study;

/** O corte do estudo no bloco do próximo campeonato: o fator que sobra e as cartas já usadas no bloco. */
export interface StudyCut { key: string; factor: number; cards: string[] }

const nextEventIndex = (state: PlayerCareerState): number | null => state.calendar?.find((entry) => entry.status === 'UPCOMING')?.index ?? null;

/** A carta de contra-jogo entra na semana: os rivais estudam vocês para o próximo campeonato e ela não foi usada no bloco. */
export function studyCardOpen(state: PlayerCareerState, cardId: string): boolean {
  const next = nextEventIndex(state);
  if (next === null || rawRivalStudyWith(state, next, ARC_TUNING) <= 0) return false;
  const cut = state.studyCut?.key === blockKeyOf(state, next) ? state.studyCut : null;
  return !cut?.cards.includes(cardId);
}

/** Corta uma fração (0 a 1) do estudo no bloco do próximo campeonato. Dois cortes no mesmo bloco se multiplicam. */
export function cutRivalStudy(state: PlayerCareerState, cardId: string, fraction: number): PlayerCareerState {
  const next = nextEventIndex(state);
  if (next === null) return state;
  const key = blockKeyOf(state, next);
  const current = state.studyCut?.key === key ? state.studyCut : { key, factor: 1, cards: [] };
  const factor = Math.round(current.factor * (1 - Math.max(0, Math.min(1, fraction))) * 100) / 100;
  return { ...state, studyCut: { key, factor, cards: [...current.cards, cardId] } };
}

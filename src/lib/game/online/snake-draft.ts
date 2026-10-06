import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import type { LineupSlotRole, Player, SelectedPlayer } from '../types';
import type { PublicSnake } from './contracts';

/**
 * Fila Draft (protocolo 12): draft "snake" com pool compartilhado. O servidor sorteia um pool de cartas para a sala
 * inteira, os participantes escolhem em turnos alternados (1..N, N..1) e cada carta escolhida some para os outros.
 * Módulo puro, compartilhado por servidor, cliente e testes: nada de dados, nada de rede.
 */
export const SNAKE_PICKS_PER_PARTICIPANT = 5;
/** Cartas no pool por participante: com 10 cada, sobram 5 por pessoa no fim — nunca falta escolha. */
export const SNAKE_POOL_PER_PARTICIPANT = 10;
/** Prazo por escolha (dono, 2026-10-06): 30 s; quem não escolhe recebe a melhor carta que ainda cabe. */
export const SNAKE_TURN_MS = 30_000;
export const SNAKE_COACH_OFFER_SIZE = 3;
export const SNAKE_COACH_REROLLS = 1;

/** O que cada participante decide depois dos cinco picks: estrela, coach (entre a oferta) e, fora daqui, estilo e mapas. */
export interface SnakeSeat {
  coachOffer: string[];
  coachRerollsUsed: number;
  coachId: string | null;
  starPlayerId: string | null;
}

export interface SnakeState {
  /** Ids das cartas, na ordem fixa do sorteio. */
  pool: string[];
  /** playerId → participantId de quem levou. */
  taken: Record<string, string>;
  /** Participantes na ordem da primeira rodada (sorteada pelo seed da sala). */
  order: string[];
  /** Turno atual, 0..order.length × 5; igual ao total = snake fechado. */
  turn: number;
  turnDeadlineAt: number | null;
  seats: Record<string, SnakeSeat>;
}

export const snakeTotalTurns = (state: Pick<SnakeState, 'order'>): number => state.order.length * SNAKE_PICKS_PER_PARTICIPANT;

/** Fechado só depois de começar: o marcador vazio da sala no lobby (ordem ainda não sorteada) não conta como completo. */
export const isSnakeComplete = (state: Pick<SnakeState, 'order' | 'turn'>): boolean => state.order.length > 0 && state.turn >= snakeTotalTurns(state);

/** Quem escolhe no turno `turn`: rodadas pares seguem a ordem, ímpares a invertem (1..N, N..1). */
export function snakeTurnParticipantAt(order: readonly string[], turn: number): string | null {
  const size = order.length;
  if (!size || turn < 0 || turn >= size * SNAKE_PICKS_PER_PARTICIPANT) return null;
  const round = Math.floor(turn / size);
  const index = turn % size;
  return round % 2 === 0 ? order[index] : order[size - 1 - index];
}

export const snakeTurnParticipant = (state: Pick<SnakeState, 'order' | 'turn'>): string | null => snakeTurnParticipantAt(state.order, state.turn);

/** Base de uma carta: `baseId` quando existe, senão o id sem o ano (`s1mple-2021` → `s1mple`). */
export const snakeBaseOf = (player: Pick<Player, 'id' | 'baseId'>): string => (player.baseId ?? player.id.replace(/-\d{4}$/, '')).toLowerCase();

/** Uma versão por jogador no pool: a primeira sorteada vence, para não haver dois anos do mesmo nome. */
export function dedupeByBase(players: readonly Player[]): Player[] {
  const seen = new Set<string>();
  const result: Player[] = [];
  for (const player of players) {
    const base = snakeBaseOf(player);
    if (seen.has(base)) continue;
    seen.add(base);
    result.push(player);
  }
  return result;
}

/** Cartas do pool que ainda estão livres, na ordem do sorteio. */
export const snakeAvailable = (state: Pick<SnakeState, 'pool' | 'taken'>, lookup: (id: string) => Player | undefined): Player[] =>
  state.pool.filter((id) => !state.taken[id]).map((id) => lookup(id)).filter((player): player is Player => Boolean(player));

/**
 * Escolha automática quando o prazo vence: a carta livre de maior overall que ainda cabe na line numa função elegível
 * (funções livres, como todo modo que não é PRO). Devolve null só se nada couber — na prática o pool sempre sobra.
 */
export function snakeAutoPick(
  available: readonly Player[],
  lineup: readonly SelectedPlayer[],
  lookup: (id: string) => Player | undefined
): { player: Player; role: LineupSlotRole } | null {
  const ranked = [...available].sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id));
  for (const player of ranked) {
    for (const role of getEligibleSlotRoles(player)) {
      if (validatePlayerPick(player, [...lineup], role, lookup, { unlimitedRoles: true }).ok) return { player, role };
    }
  }
  return null;
}

/** A visão pública do snake: sem os assentos (oferta de coach e estrela são de cada um). */
export function toPublicSnake(state: SnakeState): PublicSnake {
  return {
    pool: [...state.pool],
    taken: { ...state.taken },
    order: [...state.order],
    turn: state.turn,
    totalTurns: snakeTotalTurns(state),
    turnParticipantId: snakeTurnParticipant(state),
    turnEndsAt: state.turnDeadlineAt,
    complete: isSnakeComplete(state),
    picksPerParticipant: SNAKE_PICKS_PER_PARTICIPANT
  };
}

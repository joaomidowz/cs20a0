import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import type { LineupSlotRole, Player, SelectedPlayer } from '../types';
import type { PublicSnake } from './contracts';
import type { Rarity } from './collection-rules';

/**
 * Fila Draft (protocolo 12): draft "snake" com pool compartilhado. O servidor sorteia um pool de cartas para a sala
 * inteira, os participantes escolhem em turnos alternados (1..N, N..1) e cada carta escolhida some para os outros.
 * Módulo puro, compartilhado por servidor, cliente e testes: nada de dados, nada de rede.
 */
export const SNAKE_PICKS_PER_PARTICIPANT = 5;
/** Cartas no pool por participante: a soma das cotas abaixo (12); sobram 7 por pessoa no fim — nunca falta escolha. */
export const SNAKE_POOL_PER_PARTICIPANT = 12;
/**
 * Cotas de raridade por participante (dono, 2026-10-07): o pool por odds de pacote Ouro dava um GOAT a cada vinte salas
 * e times finais na casa dos 84; a primeira cota (1 GOAT, 2 Legends) ainda deixava cartas ruins demais. Agora cada
 * participante traz ao pool dois GOATs, três Legends e um meio forte, sem Rare nem Comum: a diferença entre os times sai
 * da sinergia (tema, funções, estrela), não de quem achou a única carta boa.
 */
export const SNAKE_POOL_QUOTA: Readonly<Record<Rarity, number>> = { goat: 2, legend: 3, superstar: 4, elite: 3, rare: 0, common: 0 };
/** Cartas elegíveis para cada função (IGL, AWPer, entry, lurker, rifler, suporte) por participante: dá para montar qualquer line. */
export const SNAKE_ROLE_MIN_PER_PARTICIPANT = 2;
/** Prazo por escolha (dono, 2026-10-06): 30 s; quem não escolhe recebe a melhor carta que ainda cabe. */
export const SNAKE_TURN_MS = 30_000;
/**
 * Coaches (protocolo 13, dono 2026-10-07): um pool COMPARTILHADO para a sala inteira, visível a todos; quem contrata
 * primeiro leva. Nove coaches fixos (três fortes, três médios, três comuns), ou participantes + 3 em salas grandes, para
 * o autocomplete sempre ter um coach distinto para cada um.
 */
export const SNAKE_COACH_POOL_SIZE = 9;
export const SNAKE_COACH_POOL_SPARE = 3;
export const snakeCoachPoolSize = (participants: number): number => Math.max(SNAKE_COACH_POOL_SIZE, participants + SNAKE_COACH_POOL_SPARE);
/** Faixas de overall do pool de coaches, uma por terço: fortes, médios e comuns. */
export const SNAKE_COACH_TIERS: readonly { readonly min: number; readonly max: number }[] = [{ min: 85, max: 99 }, { min: 78, max: 84 }, { min: 0, max: 77 }];

/** O que cada participante decide depois dos cinco picks: estrela, coach (do pool da sala) e, fora daqui, estilo e mapas. */
export interface SnakeSeat {
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
  /** Ids dos coaches da sala, na ordem do sorteio. */
  coachPool: string[];
  /** coachId → participantId de quem contratou. */
  coachTaken: Record<string, string>;
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

/** A visão pública do snake: sem os assentos (a estrela é de cada um); o pool de coaches e quem levou cada um são públicos. */
export function toPublicSnake(state: SnakeState): PublicSnake {
  return {
    pool: [...state.pool],
    taken: { ...state.taken },
    coachPool: [...state.coachPool],
    coachTaken: { ...state.coachTaken },
    order: [...state.order],
    turn: state.turn,
    totalTurns: snakeTotalTurns(state),
    turnParticipantId: snakeTurnParticipant(state),
    turnEndsAt: state.turnDeadlineAt,
    complete: isSnakeComplete(state),
    picksPerParticipant: SNAKE_PICKS_PER_PARTICIPANT
  };
}

// tests/snakeDraft.test.ts
// Fila Draft (protocolo 12): a parte pura do snake — ordem dos turnos, dedupe do pool, escolha automática e a visão pública.
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, parseClientCommand } from '../src/lib/game/online/contracts';
import { collectionPlayerById, collectionPlayers } from '../src/lib/game/online/collection-pool';
import {
  SNAKE_PICKS_PER_PARTICIPANT,
  SNAKE_POOL_PER_PARTICIPANT,
  SNAKE_POOL_QUOTA,
  SNAKE_ROLE_MIN_PER_PARTICIPANT,
  SNAKE_TURN_MS,
  dedupeByBase,
  isSnakeComplete,
  snakeAutoPick,
  snakeAvailable,
  snakeTurnParticipantAt,
  toPublicSnake,
  type SnakeState
} from '../src/lib/game/online/snake-draft';

const lookup = (id: string) => collectionPlayerById.get(id);

const stateOf = (order: string[], pool: string[], taken: Record<string, string> = {}, turn = 0): SnakeState => ({
  pool, taken, order, turn, turnDeadlineAt: null,
  seats: Object.fromEntries(order.map((id) => [id, { coachOffer: [], coachRerollsUsed: 0, coachId: null, starPlayerId: null }]))
});

describe('snake: ordem dos turnos', () => {
  it('vai e volta (1..N, N..1) até cada um ter cinco picks', () => {
    const order = ['a', 'b', 'c'];
    const sequence = Array.from({ length: order.length * SNAKE_PICKS_PER_PARTICIPANT }, (_, turn) => snakeTurnParticipantAt(order, turn));
    expect(sequence.slice(0, 6)).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
    expect(sequence.filter((id) => id === 'a')).toHaveLength(5);
    expect(sequence.filter((id) => id === 'c')).toHaveLength(5);
    expect(snakeTurnParticipantAt(order, 15)).toBeNull();
    expect(snakeTurnParticipantAt(order, -1)).toBeNull();
    expect(snakeTurnParticipantAt([], 0)).toBeNull();
  });

  it('com dois participantes, o segundo escolhe duas seguidas no meio', () => {
    const order = ['a', 'b'];
    expect(Array.from({ length: 4 }, (_, turn) => snakeTurnParticipantAt(order, turn))).toEqual(['a', 'b', 'b', 'a']);
    expect(isSnakeComplete(stateOf(order, [], {}, 10))).toBe(true);
    expect(isSnakeComplete(stateOf(order, [], {}, 9))).toBe(false);
  });
});

describe('snake: pool', () => {
  it('dedupe por base mantém uma versão por jogador, a primeira sorteada', () => {
    const s1mple = collectionPlayers.filter((player) => (player.baseId ?? player.id.replace(/-\d{4}$/, '')) === 's1mple');
    expect(s1mple.length).toBeGreaterThan(2);
    const deduped = dedupeByBase([...s1mple, ...s1mple.slice().reverse()]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe(s1mple[0].id);
  });

  it('constantes do dono: 5 picks, 12 cartas por participante no pool (1 GOAT, 2 Legends), 2 por função, 30 s por turno', () => {
    expect(SNAKE_PICKS_PER_PARTICIPANT).toBe(5);
    expect(SNAKE_POOL_PER_PARTICIPANT).toBe(12);
    expect(SNAKE_POOL_QUOTA).toEqual({ goat: 1, legend: 2, superstar: 3, elite: 4, rare: 2, common: 0 });
    expect(Object.values(SNAKE_POOL_QUOTA).reduce((sum, count) => sum + count, 0)).toBe(SNAKE_POOL_PER_PARTICIPANT);
    expect(SNAKE_ROLE_MIN_PER_PARTICIPANT).toBe(2);
    expect(SNAKE_TURN_MS).toBe(30_000);
  });
});

describe('snake: escolha automática', () => {
  const pool = collectionPlayers.slice(0, 40);
  const deduped = dedupeByBase(pool).map((player) => player.id);

  it('pega a carta livre de maior overall numa função válida e nunca uma já tomada', () => {
    const state = stateOf(['a', 'b'], deduped, { [deduped[0]]: 'b' });
    const available = snakeAvailable(state, lookup);
    expect(available.some((player) => player.id === deduped[0])).toBe(false);
    const pick = snakeAutoPick(available, [], lookup);
    expect(pick).not.toBeNull();
    const best = Math.max(...available.map((player) => player.overall ?? 0));
    expect(pick!.player.overall).toBe(best);
  });

  it('não repete a mesma pessoa que já está na line', () => {
    const state = stateOf(['a'], deduped);
    const available = snakeAvailable(state, lookup);
    const first = snakeAutoPick(available, [], lookup)!;
    const lineup = [{ playerId: first.player.id, selectedSlotRole: first.role }];
    const second = snakeAutoPick(available, lineup, lookup)!;
    expect(second.player.id).not.toBe(first.player.id);
  });
});

describe('snake: visão pública e protocolo', () => {
  it('toPublicSnake expõe turno, prazo e total, mas não os assentos', () => {
    const state = stateOf(['a', 'b'], ['x', 'y', 'z'], { x: 'a' }, 1);
    state.turnDeadlineAt = 123;
    const pub = toPublicSnake(state);
    expect(pub).toEqual({ pool: ['x', 'y', 'z'], taken: { x: 'a' }, order: ['a', 'b'], turn: 1, totalTurns: 10, turnParticipantId: 'b', turnEndsAt: 123, complete: false, picksPerParticipant: 5 });
    expect('seats' in pub).toBe(false);
  });

  it('protocolo 12 aceita os comandos do snake', () => {
    expect(PROTOCOL_VERSION).toBe(12);
    expect(parseClientCommand({ type: 'snake-pick', requestId: 'r-00000001', playerId: 'donk-2024', role: 'entry' }).type).toBe('snake-pick');
    expect(parseClientCommand({ type: 'pick-star', requestId: 'r-00000002', playerId: 'donk-2024' }).type).toBe('pick-star');
    expect(parseClientCommand({ type: 'pick-coach', requestId: 'r-00000003', coachId: 'coach-spirit-2024' }).type).toBe('pick-coach');
    expect(parseClientCommand({ type: 'reroll-coach', requestId: 'r-00000004' }).type).toBe('reroll-coach');
  });
});

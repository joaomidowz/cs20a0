// tests/onlineSnakeDraft.test.ts
// Fila Draft (protocolo 12) na sala: snake com pool compartilhado, ordem 1..N/N..1, auto-pick no prazo, estrela, coach,
// confirmação, prepared sintetizado, run completa valendo pontos, revanche e saída.
import { describe, expect, it } from 'vitest';
import { CONFIRMATION_GRACE_MS, RoomError, RoomManager, VETO_STEP_DEADLINE_MS, type RunCompletedEvent } from '../server/room-manager';
import { collectionCoachById, collectionPlayerById } from '../src/lib/game/online/collection-pool';
import { collectionRoleOf, isStarEffective, starRoleAllowed } from '../src/lib/game/online/collection-lineup';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { SNAKE_COACH_OFFER_SIZE, SNAKE_PICKS_PER_PARTICIPANT, SNAKE_POOL_PER_PARTICIPANT, SNAKE_TURN_MS } from '../src/lib/game/online/snake-draft';
import { DEFAULT_ROOM_CONFIG, REMATCH_WINDOW_MS, type RoomConfig, type RoomSnapshot } from '../src/lib/game/online/contracts';
import type { LineupSlotRole, Player } from '../src/lib/game/types';

const CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'stage3', capacity: 6, draftDeadlineSeconds: 60, simulationMode: 'automatic', simulationSpeed: 'ultra', seasonRuns: 1 };
let counter = 0;
const requestId = () => `req-${(counter += 1).toString().padStart(8, '0')}`;
const lookup = (id: string) => collectionPlayerById.get(id);

/** Sala snake com três contas, já iniciada (host dá `start`). */
function openSnakeRoom(events: RunCompletedEvent[] = [], seed = 'snake-room') {
  const manager = new RoomManager({ onRunCompleted: (event) => events.push(event) });
  let now = 10_000;
  const code = manager.createRoom(CONFIG, now, seed, { draft: true });
  const ids = ['user-a', 'user-b', 'user-c'].map((userId, index) => {
    const ticket = manager.prepareDraftSeat(code, userId, now);
    return manager.join(code, `P${index}`, `Org ${index}`, now + index, ticket).participantId;
  });
  now += 10;
  manager.execute(code, ids[0], { type: 'start', requestId: requestId() }, now);
  return { manager, code, ids, now };
}

/** Escolhe a melhor carta livre do pool que ainda cabe na line do participante (mesma regra do auto-pick). */
function bestPick(snapshot: RoomSnapshot, prefer?: (player: Player) => boolean): { player: Player; role: LineupSlotRole } {
  const snake = snapshot.snake!;
  const lineup = snapshot.self!.lineup;
  const free = snake.pool.filter((id) => !snake.taken[id]).map(lookup).filter((player): player is Player => Boolean(player));
  const ranked = [...free].sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0));
  const ordered = prefer ? [...ranked.filter(prefer), ...ranked.filter((player) => !prefer(player))] : ranked;
  for (const player of ordered) {
    const base = (player.baseId ?? player.id.replace(/-\d{4}$/, '')).toLowerCase();
    if (lineup.some((pick) => { const mine = lookup(pick.playerId); return mine && (mine.baseId ?? mine.id.replace(/-\d{4}$/, '')).toLowerCase() === base; })) continue;
    const role = getEligibleSlotRoles(player)[0];
    if (role) return { player, role };
  }
  throw new Error('No pick available');
}

/** Joga o snake inteiro por comandos, cada um na sua vez; devolve quem escolheu em cada turno. */
function playSnake(manager: RoomManager, code: string, now: number, prefer?: (participantId: string, player: Player) => boolean): string[] {
  const turns: string[] = [];
  for (let turn = 0; turn < 100; turn += 1) {
    const snapshot = manager.getSnapshot(code, null, now);
    if (snapshot.snake!.complete) break;
    const who = snapshot.snake!.turnParticipantId!;
    const mine = manager.getSnapshot(code, who, now);
    const { player, role } = bestPick(mine, prefer ? (candidate) => prefer(who, candidate) : undefined);
    manager.execute(code, who, { type: 'snake-pick', requestId: requestId(), playerId: player.id, role }, now);
    turns.push(who);
  }
  return turns;
}

function finishSeat(manager: RoomManager, code: string, participantId: string, now: number) {
  const snapshot = manager.getSnapshot(code, participantId, now);
  const lineup = snapshot.self!.lineup;
  const players = lineup.map((pick) => lookup(pick.playerId)!);
  const roles = lineup.map(collectionRoleOf);
  const star = [...players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).find((player) => isStarEffective(players, player.id, roles))!;
  manager.execute(code, participantId, { type: 'set-style', requestId: requestId(), style: 'balanced' }, now);
  manager.execute(code, participantId, { type: 'pick-star', requestId: requestId(), playerId: star.id }, now);
  manager.execute(code, participantId, { type: 'pick-coach', requestId: requestId(), coachId: snapshot.self!.coachOffer![0] }, now);
}

function runToCompletion(manager: RoomManager, code: string, participantId: string, now: number) {
  let snapshot = manager.getSnapshot(code, participantId, now);
  for (let index = 0; index < 5_000 && snapshot.phase !== 'completed'; index += 1) {
    now += VETO_STEP_DEADLINE_MS;
    manager.tick(now);
    snapshot = manager.getSnapshot(code, participantId, now);
  }
  expect(snapshot.phase).toBe('completed');
  return { snapshot, now };
}

describe('sala snake: picks', () => {
  it('abre com pool, ordem e oferta de coach; respeita 1..3,3..1; recusa fora da vez, carta tomada e roleta', () => {
    const { manager, code, ids, now } = openSnakeRoom();
    const snapshot = manager.getSnapshot(code, ids[0], now);
    expect(snapshot.phase).toBe('draft');
    expect(snapshot.deadlineStage).toBe('picks');
    expect(snapshot.deadlineAt).toBe(snapshot.snake!.turnEndsAt);
    expect(snapshot.snake!.pool).toHaveLength(3 * SNAKE_POOL_PER_PARTICIPANT);
    expect(new Set(snapshot.snake!.pool.map((id) => (lookup(id)!.baseId ?? id.replace(/-\d{4}$/, '')).toLowerCase())).size).toBe(snapshot.snake!.pool.length);
    expect([...snapshot.snake!.order].sort()).toEqual([...ids].sort());
    expect(snapshot.snake!.totalTurns).toBe(3 * SNAKE_PICKS_PER_PARTICIPANT);
    expect(snapshot.snake!.turnParticipantId).toBe(snapshot.snake!.order[0]);
    expect(snapshot.self!.coachOffer).toHaveLength(SNAKE_COACH_OFFER_SIZE);
    expect(snapshot.self!.coachRerollsLeft).toBe(1);
    expect(snapshot.participants.every((participant) => !participant.collection)).toBe(true);
    expect(snapshot.competitive).toBe(true);

    const order = snapshot.snake!.order;
    const notMyTurn = order.find((id) => id !== order[0])!;
    const first = bestPick(manager.getSnapshot(code, notMyTurn, now));
    expect(() => manager.execute(code, notMyTurn, { type: 'snake-pick', requestId: requestId(), playerId: first.player.id, role: first.role }, now)).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    expect(() => manager.execute(code, order[0], { type: 'draw-team', requestId: requestId() }, now)).toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
    expect(() => manager.execute(code, order[0], { type: 'pick-star', requestId: requestId(), playerId: first.player.id }, now)).toThrowError(RoomError);

    manager.execute(code, order[0], { type: 'snake-pick', requestId: requestId(), playerId: first.player.id, role: first.role }, now);
    const after = manager.getSnapshot(code, order[1], now);
    expect(after.snake!.taken[first.player.id]).toBe(order[0]);
    expect(after.snake!.turnParticipantId).toBe(order[1]);
    expect(() => manager.execute(code, order[1], { type: 'snake-pick', requestId: requestId(), playerId: first.player.id, role: first.role }, now)).toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));

    const turns = [order[0], ...playSnake(manager, code, now)];
    expect(turns).toHaveLength(15);
    expect(turns.slice(0, 6)).toEqual([order[0], order[1], order[2], order[2], order[1], order[0]]);
    for (const id of ids) expect(turns.filter((turn) => turn === id)).toHaveLength(5);
    const done = manager.getSnapshot(code, ids[0], now);
    expect(done.snake!.complete).toBe(true);
    expect(done.deadlineStage).toBe('confirmation');
    expect(done.participants.every((participant) => participant.power !== null)).toBe(true);
  });

  it('prazo vencido escolhe sozinho pela melhor carta que cabe e passa a vez', () => {
    const { manager, code, ids, now } = openSnakeRoom();
    const before = manager.getSnapshot(code, ids[0], now);
    const who = before.snake!.turnParticipantId!;
    manager.tick(before.snake!.turnEndsAt! - 1);
    expect(manager.getSnapshot(code, who, now).snake!.turn).toBe(0);
    manager.tick(before.snake!.turnEndsAt!);
    const after = manager.getSnapshot(code, who, before.snake!.turnEndsAt!);
    expect(after.snake!.turn).toBe(1);
    expect(after.self!.lineup).toHaveLength(1);
    expect(after.snake!.taken[after.self!.lineup[0].playerId]).toBe(who);
    expect(after.snake!.turnEndsAt).toBe(before.snake!.turnEndsAt! + SNAKE_TURN_MS);
    expect(after.deadlineAt).toBe(after.snake!.turnEndsAt);
  });
});

describe('sala snake: estrela, coach e confirmação', () => {
  it('estrela não pode ser IGL puro ou suporte; coach só da oferta; um reroll', () => {
    const { manager, code, ids, now } = openSnakeRoom();
    // Garante um IGL puro na line de quem for testado: prioriza cartas elegíveis a 'igl' no primeiro pick.
    playSnake(manager, code, now, (_participant, player) => getEligibleSlotRoles(player).includes('igl'));
    const me = ids[0];
    const snapshot = manager.getSnapshot(code, me, now);
    const lineup = snapshot.self!.lineup;
    const players = lineup.map((pick) => lookup(pick.playerId)!);
    const roles = lineup.map(collectionRoleOf);
    const igl = lineup.find((pick) => !starRoleAllowed(collectionRoleOf(pick)));
    if (igl) expect(() => manager.execute(code, me, { type: 'pick-star', requestId: requestId(), playerId: igl.playerId }, now)).toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
    expect(() => manager.execute(code, me, { type: 'pick-star', requestId: requestId(), playerId: 'not-mine' }, now)).toThrowError(RoomError);
    const star = [...players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).find((player) => isStarEffective(players, player.id, roles))!;
    expect(starRoleAllowed(roles[players.indexOf(star)])).toBe(true);
    manager.execute(code, me, { type: 'pick-star', requestId: requestId(), playerId: star.id }, now);
    expect(manager.getSnapshot(code, me, now).self!.starPlayerId).toBe(star.id);

    expect(() => manager.execute(code, me, { type: 'pick-coach', requestId: requestId(), coachId: 'nobody' }, now)).toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
    const offer = snapshot.self!.coachOffer!;
    manager.execute(code, me, { type: 'pick-coach', requestId: requestId(), coachId: offer[1] }, now);
    expect(manager.getSnapshot(code, me, now).self!.coachId).toBe(offer[1]);
    expect(manager.getSnapshot(code, me, now).participants.find((participant) => participant.id === me)!.coachId).toBe(offer[1]);

    manager.execute(code, me, { type: 'reroll-coach', requestId: requestId() }, now);
    const rerolled = manager.getSnapshot(code, me, now).self!;
    expect(rerolled.coachId).toBeNull();
    expect(rerolled.coachRerollsLeft).toBe(0);
    expect(rerolled.coachOffer).toHaveLength(SNAKE_COACH_OFFER_SIZE);
    expect(rerolled.coachOffer).not.toEqual(offer);
    expect(() => manager.execute(code, me, { type: 'pick-coach', requestId: requestId(), coachId: offer[1] }, now)).toThrowError(RoomError);
    expect(() => manager.execute(code, me, { type: 'reroll-coach', requestId: requestId() }, now)).toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
  });

  it('vencida a confirmação, o servidor fecha estilo/estrela/coach/mapas e o Major começa; prepared traz coach e estrela', () => {
    const events: RunCompletedEvent[] = [];
    const { manager, code, ids, now } = openSnakeRoom(events);
    playSnake(manager, code, now);
    const confirming = manager.getSnapshot(code, ids[0], now);
    expect(confirming.deadlineStage).toBe('confirmation');
    expect(confirming.deadlineAt).toBe(now + CONFIRMATION_GRACE_MS);
    // Um fecha tudo na mão; os outros deixam o prazo vencer.
    finishSeat(manager, code, ids[0], now);
    expect(manager.getSnapshot(code, ids[0], now).phase).toBe('draft');
    manager.tick(now + CONFIRMATION_GRACE_MS);
    const started = manager.getSnapshot(code, ids[0], now + CONFIRMATION_GRACE_MS);
    expect(started.phase).toBe('swiss');
    expect(started.competitive).toBe(true);
    for (const id of ids) {
      const organization = started.organizations!.find((candidate) => candidate.id === id)!;
      expect(organization.lineup).toHaveLength(5);
      expect(organization.coachId).not.toBeNull();
      expect(collectionCoachById.has(organization.coachId!)).toBe(true);
    }

    const { snapshot } = runToCompletion(manager, code, ids[0], now + CONFIRMATION_GRACE_MS);
    expect(snapshot.phase).toBe('completed');
    expect(events).toHaveLength(1);
    expect(events[0].competitive).toBe(true);
    expect(events[0].lobbySize).toBe(3);
    expect(events[0].entries.map((entry) => entry.userId).sort()).toEqual(['user-a', 'user-b', 'user-c']);
    for (const entry of events[0].entries) {
      expect(entry.lineup).toHaveLength(5);
      expect(entry.starPlayerId).not.toBeNull();
      expect(entry.lineupIds.every((id) => collectionPlayerById.has(id))).toBe(true);
    }
  });

  it('todos prontos na mão inicia sem esperar a confirmação', () => {
    const { manager, code, ids, now } = openSnakeRoom();
    playSnake(manager, code, now);
    for (const id of ids) finishSeat(manager, code, id, now);
    // Mapas ficam por conta do servidor na confirmação; antes disso ninguém está pronto.
    expect(manager.getSnapshot(code, ids[0], now).phase).toBe('draft');
    manager.tick(now + CONFIRMATION_GRACE_MS);
    expect(manager.getSnapshot(code, ids[0], now + CONFIRMATION_GRACE_MS).phase).toBe('swiss');
  });
});

describe('sala snake: revanche e saída', () => {
  it('a revanche recria o snake com pool e ordem novos', () => {
    const { manager, code, ids, now } = openSnakeRoom([], 'snake-rematch');
    const firstPool = manager.getSnapshot(code, ids[0], now).snake!.pool;
    playSnake(manager, code, now);
    manager.tick(now + CONFIRMATION_GRACE_MS);
    const { now: ended } = runToCompletion(manager, code, ids[0], now + CONFIRMATION_GRACE_MS);
    for (const id of ids) manager.execute(code, id, { type: 'rematch-vote', requestId: requestId(), accept: true }, ended);
    manager.tick(ended + REMATCH_WINDOW_MS + 1);
    const again = manager.getSnapshot(code, ids[0], ended + REMATCH_WINDOW_MS + 1);
    expect(again.phase).toBe('draft');
    expect(again.snake!.turn).toBe(0);
    expect(again.snake!.complete).toBe(false);
    expect(again.snake!.pool).toHaveLength(3 * SNAKE_POOL_PER_PARTICIPANT);
    expect(again.snake!.pool).not.toEqual(firstPool);
    expect(again.self!.lineup).toHaveLength(0);
    expect(again.self!.coachId).toBeNull();
    expect(again.self!.coachOffer).toHaveLength(SNAKE_COACH_OFFER_SIZE);
    expect(again.participants.every((participant) => participant.power === null)).toBe(true);
  });

  it('com um participante só a sala volta ao lobby e o snake zera', () => {
    const { manager, code, ids, now } = openSnakeRoom();
    manager.execute(code, ids[1], { type: 'leave', requestId: requestId() }, now);
    expect(manager.getSnapshot(code, ids[0], now).phase).toBe('draft');
    manager.execute(code, ids[2], { type: 'leave', requestId: requestId() }, now);
    const lobby = manager.getSnapshot(code, ids[0], now);
    expect(lobby.phase).toBe('lobby');
    // O marcador vazio do lobby: sem ordem nem pool (o `complete` do módulo puro dá true para ordem vazia — o cliente olha `order.length`).
    expect(lobby.snake).toMatchObject({ order: [], pool: [], turn: 0, totalTurns: 0, turnParticipantId: null });
    expect(lobby.self!.lineup).toHaveLength(0);
  });
});

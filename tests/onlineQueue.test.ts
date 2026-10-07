// tests/onlineQueue.test.ts
// Fila competitiva: com 3+ espera a janela de 10 s (até 8 por sala); só 2 por 30 s jogam entre si (não competitivo);
// quem para de consultar some da fila; regra única de "vale pontos".
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { QUEUE_FILL_WINDOW_MS, QUEUE_PAIR_WINDOW_MS, QUEUE_STALE_MS, createQueue } from '../server/queue';
import { QUEUE_JOIN_WINDOW_MS, RoomManager, type PreparedLineup } from '../server/room-manager';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
import { SNAKE_POOL_PER_PARTICIPANT } from '../src/lib/game/online/snake-draft';
import { DEFAULT_ROOM_CONFIG } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';

const five = (() => {
  const seen = new Set<string>();
  const pool = players.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; });
  return ['igl', 'awper', 'entry', 'lurker', 'support'].map((role) => pool.find((player) => primaryRoleOf(player) === role)!);
})();
const prepared = (userId: string): PreparedLineup => ({
  userId,
  lineup: five.map((player) => ({ playerId: player.id, selectedSlotRole: primaryRoleOf(player) })),
  style: 'balanced',
  starPlayerId: null,
  coachId: null,
  mapPreferences: [...getDefaultMapSelection(five, teams)]
});

describe('fila competitiva', () => {
  it('inicia a sala solo com modo e velocidade escolhidos sem pontuar temporada', () => {
    const clock = 500_000;
    const manager = new RoomManager();
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, simulationMode: 'manual', simulationSpeed: 'normal' }, clock, 'solo-manual-seed', { origin: 'solo' });
    const ticket = manager.prepareLineup(code, prepared('solo-user'), clock);
    const host = manager.join(code, 'Solo player', 'Solo org', clock + 1, ticket);
    manager.tick(clock + 2);

    const snapshot = manager.getSnapshot(code, host.participantId, clock + 2);
    expect(snapshot).toMatchObject({ origin: 'solo', competitive: false, config: { simulationMode: 'manual', simulationSpeed: 'normal' } });
    expect(manager.getLiveUpdate(code, host.participantId, clock + 2).cursor).toMatchObject({ status: 'waiting_host', nextRoundAt: null });
  });

  it('um sozinho espera; o terceiro abre a janela de 10 s e ela fecha a sala', () => {
    let clock = 1_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    queue.join('a', prepared('a'));
    clock += 60_000;
    queue.status('a');
    queue.tick();
    expect(queue.status('a').state).toBe('waiting');
    for (const user of ['b', 'c', 'd']) queue.join(user, prepared(user));
    expect(queue.status('d')).toMatchObject({ state: 'waiting', pair: false, closesInMs: QUEUE_FILL_WINDOW_MS });
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    const match = queue.status('a');
    expect(match.state).toBe('matched');
    expect(['b', 'c', 'd'].map((user) => queue.status(user).match?.roomCode)).toEqual([match.match!.roomCode, match.match!.roomCode, match.match!.roomCode]);
    expect(queue.size()).toBe(0);
  });

  it('só dois por 30 s jogam entre si e valem pontos (1/3)', () => {
    let clock = 2_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    queue.join('a', prepared('a'));
    queue.join('b', prepared('b'));
    expect(queue.status('a')).toMatchObject({ state: 'waiting', pair: true, closesInMs: QUEUE_PAIR_WINDOW_MS });
    clock += QUEUE_PAIR_WINDOW_MS - 1_000;
    queue.status('a'); queue.status('b');
    queue.tick();
    expect(queue.status('a').state).toBe('waiting');
    clock += 1_000;
    queue.tick();
    const { roomCode } = queue.status('a').match!;
    expect(queue.status('b').match?.roomCode).toBe(roomCode);
    ['a', 'b'].forEach((user, index) => manager.join(roomCode, `P${user}`, `Org ${user}`, clock + index, queue.status(user).match!.lineupTicket));
    manager.tick(clock + 10);
    const started = manager.getSnapshot(roomCode, null, clock + 10);
    expect(started.phase).toBe('swiss');
    expect(started.competitive).toBe(true);
  });

  it('dupla que ganha um terceiro troca para a janela de 10 s; dupla desfeita reinicia os 30 s', () => {
    let clock = 3_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    queue.join('a', prepared('a'));
    queue.join('b', prepared('b'));
    clock += 20_000;
    queue.join('c', prepared('c'));
    expect(queue.status('a')).toMatchObject({ pair: false, closesInMs: QUEUE_FILL_WINDOW_MS });
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    expect(queue.status('c').state).toBe('matched');

    queue.join('x', prepared('x'));
    queue.join('y', prepared('y'));
    clock += 20_000;
    queue.leave('y');
    queue.join('z', prepared('z'));
    clock += 20_000;
    queue.status('x'); queue.status('z');
    queue.tick();
    expect(queue.status('x').state).toBe('waiting');
    expect(queue.status('x').closesInMs).toBe(QUEUE_PAIR_WINDOW_MS - 20_000);
  });

  it('quem para de consultar some da fila e não entra no match; saída por aba escondida é informada', () => {
    let clock = 4_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    for (const user of ['a', 'b', 'ghost']) queue.join(user, prepared(user));
    clock += QUEUE_STALE_MS - 5_000;
    queue.status('a'); queue.status('b');
    clock += 6_000;
    queue.status('a'); queue.status('b');
    queue.tick();
    expect(queue.status('ghost')).toMatchObject({ state: 'idle', left: 'stale' });
    expect(queue.size()).toBe(2);

    queue.leave('b', 'hidden');
    expect(queue.status('b')).toMatchObject({ state: 'idle', left: 'hidden' });
    queue.leave('a');
    expect(queue.status('a').left).toBeNull();
    queue.join('b', prepared('b'));
    expect(queue.status('b').left).toBeNull();
  });

  it('mesmo com oito espera a janela; fecha oito e o nono espera a próxima', () => {
    let clock = 5_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    for (let index = 0; index < 9; index += 1) queue.join(`u${index}`, prepared(`u${index}`));
    expect(queue.status('u0').state).toBe('waiting');
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    expect(queue.status('u0').state).toBe('matched');
    expect(queue.status('u7').state).toBe('matched');
    expect(queue.status('u8').state).toBe('waiting');
  });

  it('sala da fila começa sozinha quando todos entram e vale pontos; sala por código só vale com todos de coleção e 2+', () => {
    let clock = 10_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    for (const user of ['a', 'b', 'c', 'd']) queue.join(user, prepared(user));
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    const { roomCode } = queue.status('a').match!;
    ['a', 'b', 'c', 'd'].forEach((user, index) => manager.join(roomCode, `P${user}`, `Org ${user}`, clock + index, queue.status(user).match!.lineupTicket));
    expect(manager.getSnapshot(roomCode, null, clock).competitive).toBe(true);
    manager.tick(clock + 10);
    const started = manager.getSnapshot(roomCode, null, clock + 10);
    expect(started.phase).toBe('swiss');
    expect(started.origin).toBe('queue');
    expect(started.config).toMatchObject({ simulationMode: 'automatic', simulationSpeed: 'ultra' });
    // The public live board lists the ranked Major with its human teams and never the room code.
    const live = manager.liveQueueRooms(clock + 10);
    expect(live).toHaveLength(1);
    expect(live[0].teams.map((team) => team.name).sort()).toEqual(['Org a', 'Org b', 'Org c', 'Org d']);
    expect(JSON.stringify(live)).not.toContain(roomCode);

    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 8 }, clock);
    manager.join(code, 'Pw', 'Org w', clock, manager.prepareLineup(code, prepared('w'), clock));
    expect(manager.getSnapshot(code, null, clock).competitive).toBe(false);
    manager.join(code, 'Pz', 'Org z', clock, manager.prepareLineup(code, prepared('z'), clock));
    expect(manager.getSnapshot(code, null, clock).competitive).toBe(true);
    manager.join(code, 'Drafter', 'Org draft', clock);
    expect(manager.getSnapshot(code, null, clock).competitive).toBe(false);
  });

  it('se alguém do match não conecta, a sala da fila começa após a janela com quem veio', () => {
    let clock = 20_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    for (const user of ['a', 'b', 'c', 'd']) queue.join(user, prepared(user));
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    const { roomCode } = queue.status('a').match!;
    manager.join(roomCode, 'Pa', 'Org a', clock, queue.status('a').match!.lineupTicket);
    manager.tick(clock + 1);
    expect(manager.getSnapshot(roomCode, null, clock + 1).phase).toBe('lobby');
    manager.tick(clock + QUEUE_JOIN_WINDOW_MS + 1);
    const snapshot = manager.getSnapshot(roomCode, null, clock + QUEUE_JOIN_WINDOW_MS + 1);
    expect(snapshot.phase).toBe('swiss');
    expect(snapshot.competitive).toBe(false);
  });
});

describe('fila draft (snake)', () => {
  it('dois só fecham após a janela de 30 s; um sozinho nunca fecha; o status traz kind', () => {
    let clock = 100_000;
    const manager = new RoomManager();
    const draft = createQueue(manager, () => clock, { kind: 'draft' });
    expect(draft.kind).toBe('draft');
    draft.join('solo', null);
    clock += 10 * 60_000;
    draft.status('solo');
    draft.tick();
    expect(draft.status('solo')).toMatchObject({ kind: 'draft', state: 'waiting', closesInMs: null });

    draft.join('b', null);
    expect(draft.status('solo')).toMatchObject({ state: 'waiting', pair: true, closesInMs: QUEUE_PAIR_WINDOW_MS });
    clock += QUEUE_PAIR_WINDOW_MS - 1_000;
    draft.status('solo'); draft.status('b');
    draft.tick();
    expect(draft.status('b').state).toBe('waiting');
    clock += 1_000;
    draft.tick();
    const match = draft.status('solo');
    expect(match).toMatchObject({ kind: 'draft', state: 'matched' });
    expect(draft.status('b').match?.roomCode).toBe(match.match!.roomCode);
  });

  it('a sala da fila draft não começa com um só (queueAbandoned) e começa com dois (snake com ordem de 2)', () => {
    let clock = 200_000;
    const manager = new RoomManager();
    const draft = createQueue(manager, () => clock, { kind: 'draft' });
    for (const user of ['a', 'b', 'c']) draft.join(user, null);
    clock += QUEUE_FILL_WINDOW_MS;
    draft.tick();
    const { roomCode } = draft.status('a').match!;
    expect(draft.size()).toBe(0);
    const a = manager.join(roomCode, 'Pa', 'Org a', clock, draft.status('a').match!.lineupTicket);
    manager.tick(clock + QUEUE_JOIN_WINDOW_MS + 1);
    const abandoned = manager.getSnapshot(roomCode, a.participantId, clock + QUEUE_JOIN_WINDOW_MS + 1);
    expect(abandoned.phase).toBe('lobby');
    expect(abandoned.queueAbandoned).toBe(true);
    expect(abandoned.snake).toMatchObject({ order: [], turn: 0 });

    const manager2 = new RoomManager();
    const draft2 = createQueue(manager2, () => clock, { kind: 'draft' });
    for (const user of ['a', 'b', 'c']) draft2.join(user, null);
    clock += QUEUE_FILL_WINDOW_MS;
    draft2.tick();
    const second = draft2.status('a').match!.roomCode;
    const pa = manager2.join(second, 'Pa', 'Org a', clock, draft2.status('a').match!.lineupTicket);
    manager2.join(second, 'Pb', 'Org b', clock + 1, draft2.status('b').match!.lineupTicket);
    manager2.tick(clock + 2);
    expect(manager2.getSnapshot(second, pa.participantId, clock + 2).phase).toBe('lobby');
    manager2.tick(clock + QUEUE_JOIN_WINDOW_MS + 1);
    const started = manager2.getSnapshot(second, pa.participantId, clock + QUEUE_JOIN_WINDOW_MS + 1);
    expect(started.phase).toBe('draft');
    expect(started.queueAbandoned).toBeUndefined();
    expect(started.competitive).toBe(true);
    expect(started.snake!.order).toHaveLength(2);
    expect(started.snake!.pool).toHaveLength(2 * SNAKE_POOL_PER_PARTICIPANT);
    expect(started.snake!.coachPool.length).toBeGreaterThanOrEqual(9);
    expect(started.participants.every((participant) => !participant.collection)).toBe(true);
    expect(started.config.capacity).toBe(6);
  });

  it('a mesma conta não entra duas vezes na sala snake; entrar numa fila tira da outra (regra das rotas)', () => {
    let clock = 300_000;
    const manager = new RoomManager();
    const draft = createQueue(manager, () => clock, { kind: 'draft' });
    const collection = createQueue(manager, () => clock);
    draft.join('a', null);
    draft.join('b', null);
    clock += QUEUE_PAIR_WINDOW_MS / 2;
    draft.status('a'); draft.status('b');
    clock += QUEUE_PAIR_WINDOW_MS / 2;
    draft.tick();
    const { roomCode, lineupTicket } = draft.status('a').match!;
    manager.join(roomCode, 'Pa', 'Org a', clock, lineupTicket);
    const again = manager.prepareDraftSeat(roomCode, 'a', clock);
    expect(() => manager.join(roomCode, 'Pa2', 'Org a2', clock, again)).toThrowError(/already in the room/);

    // A rota faz `collection.leave` ao entrar na draft e vice-versa; aqui só se garante que as filas são independentes.
    collection.join('x', prepared('x'));
    draft.join('x', null);
    expect(collection.has('x')).toBe(true);
    collection.leave('x');
    expect(collection.has('x')).toBe(false);
    expect(draft.has('x')).toBe(true);
    expect(draft.status('x')).toMatchObject({ kind: 'draft', state: 'waiting' });
    expect(collection.status('x')).toMatchObject({ kind: 'collection', state: 'idle' });
  });
});

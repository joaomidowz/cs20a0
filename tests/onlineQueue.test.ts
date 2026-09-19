// tests/onlineQueue.test.ts
// Fila competitiva: com 3+ espera a janela de 10 s (até 8 por sala); só 2 por 30 s jogam entre si (não competitivo);
// quem para de consultar some da fila; regra única de "vale pontos".
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { QUEUE_FILL_WINDOW_MS, QUEUE_PAIR_WINDOW_MS, QUEUE_STALE_MS, createQueue } from '../server/queue';
import { QUEUE_JOIN_WINDOW_MS, RoomManager, type PreparedLineup } from '../server/room-manager';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
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

// tests/onlineQueue.test.ts
// Fila competitiva: com 3+ espera sempre a janela (até 8 por sala); nunca fecha com menos de 3. Regra única de "vale pontos".
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { QUEUE_FILL_WINDOW_MS, createQueue } from '../server/queue';
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
  it('dois esperando não fecha nunca; o terceiro abre a janela e ela fecha a sala', () => {
    let clock = 1_000;
    const manager = new RoomManager();
    const queue = createQueue(manager, () => clock);
    for (const user of ['a', 'b']) queue.join(user, prepared(user));
    clock += 10 * 60_000;
    queue.tick();
    expect(queue.status('a').state).toBe('waiting');
    queue.join('c', prepared('c'));
    queue.join('d', prepared('d'));
    expect(queue.status('d').state).toBe('waiting');
    clock += QUEUE_FILL_WINDOW_MS;
    queue.tick();
    const match = queue.status('a');
    expect(match.state).toBe('matched');
    expect(['b', 'c', 'd'].map((user) => queue.status(user).match?.roomCode)).toEqual([match.match!.roomCode, match.match!.roomCode, match.match!.roomCode]);
    expect(queue.size()).toBe(0);
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

  it('sala da fila começa sozinha quando todos entram e vale pontos; sala por código só vale com todos de coleção e 3+', () => {
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

    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, capacity: 8 }, clock);
    for (const user of ['w', 'x']) manager.join(code, `P${user}`, `Org ${user}`, clock, manager.prepareLineup(code, prepared(user), clock));
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
    for (const user of ['a', 'b']) manager.join(roomCode, `P${user}`, `Org ${user}`, clock, queue.status(user).match!.lineupTicket);
    manager.tick(clock + 1);
    expect(manager.getSnapshot(roomCode, null, clock + 1).phase).toBe('lobby');
    manager.tick(clock + QUEUE_JOIN_WINDOW_MS + 1);
    const snapshot = manager.getSnapshot(roomCode, null, clock + QUEUE_JOIN_WINDOW_MS + 1);
    expect(snapshot.phase).toBe('swiss');
    expect(snapshot.competitive).toBe(false);
  });
});

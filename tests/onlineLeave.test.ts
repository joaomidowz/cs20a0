// tests/onlineLeave.test.ts
// O botão de sair e a tela pós-run do solo: sair remove o participante de verdade (host passa adiante, draft
// raso volta ao lobby) e o Major solo não abre janela de revanche — "jogar de novo com todo mundo" precisa de
// todo mundo. O snapshot do lobby também leva o power (e o coach) de cada time.
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { RoomManager, type PreparedLineup } from '../server/room-manager';
import { toSelectedPlayer, type CollectionSlotRole } from '../src/lib/game/online/collection-lineup';
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { QUEUE_ROOM_CONFIG } from '../server/queue';
import type { Player } from '../src/lib/game/types';

const CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 4, draftDeadlineSeconds: 60, simulationSpeed: 'ultra', seasonRuns: 1 };
let counter = 0;
const requestId = () => `leave-${(counter += 1).toString().padStart(8, '0')}`;

const IDS = ['taco-2018', 'fallen-2016', 'coldzera-2017', 'fnx-2016', 'fer-2017'];
const ROLES: CollectionSlotRole[] = ['entry', 'awper-igl', 'rifler', 'support', 'lurker'];
const cards = IDS.map((id) => players.find((player) => player.id === id)!);

const preparedOf = (userId: string, ids: string[], coachId: string | null): PreparedLineup => {
  const picked = ids.map((id) => players.find((player) => player.id === id)!);
  return {
    userId,
    lineup: picked.map((player, index) => toSelectedPlayer(player.id, (['igl', 'awper', 'entry', 'support', 'lurker'] as CollectionSlotRole[])[index])),
    style: 'balanced', starPlayerId: null, coachId, mapPreferences: [...getDefaultMapSelection(picked as Player[], teams)]
  };
};

/** Roda o relógio da sala até a run acabar (as decisões humanas sem resposta se resolvem no prazo). */
function runToEnd(manager: RoomManager, code: string, participantId: string, startedAt = 2_000) {
  let now = startedAt;
  for (let index = 0; index < 2_000; index += 1) {
    now += 5_000;
    manager.tick(now);
    if (manager.getSnapshot(code, participantId, now).phase === 'completed') return now;
  }
  return now;
}

describe('o botão de sair', () => {
  it('remove o participante na hora e passa o host adiante', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `sair-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001);
    const other = manager.join(code, 'Amigo', 'Org B', 1_002);
    manager.execute(code, me.participantId, { type: 'leave', requestId: requestId() }, 1_100);
    const snapshot = manager.getSnapshot(code, other.participantId, 1_100);
    expect(snapshot.participants.map((participant) => participant.playerName)).toEqual(['Amigo']);
    expect(snapshot.participants[0].host).toBe(true);
  });

  it('um draft que perde gente volta ao lobby em vez de morrer pendurado', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `draft-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001);
    const other = manager.join(code, 'Amigo', 'Org B', 1_002);
    manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
    expect(manager.getSnapshot(code, other.participantId, 1_010).phase).toBe('draft');
    manager.execute(code, other.participantId, { type: 'leave', requestId: requestId() }, 1_100);
    // Sala por código precisa de dois: sozinho, volta ao lobby.
    expect(manager.getSnapshot(code, me.participantId, 1_100).phase).toBe('lobby');
  });
});

describe('a tela pós-run do solo', () => {
  it('não abre janela de revanche para quem jogou sozinho contra bots', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(QUEUE_ROOM_CONFIG, 1_000, `solo-${requestId()}`, { origin: 'queue', expected: 2 });
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, {
      userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])),
      style: 'tactical', starPlayerId: 'fallen-2016', coachId: null, mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)]
    }, 1_000));
    runToEnd(manager, code, me.participantId);
    const solo = manager.getSnapshot(code, me.participantId).season;
    expect(solo, 'a temporada existe depois da primeira run').toBeTruthy();
    expect(solo!.rematch).toBeNull();
  });

  it('com dois jogadores a revanche segue lá', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `dupla-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, preparedOf('dono', IDS, null), 1_000));
    const other = manager.join(code, 'Amigo', 'Org B', 1_002, manager.prepareLineup(code, preparedOf('amigo', players.filter((player) => !IDS.includes(player.id)).slice(0, 5).map((player) => player.id), null), 1_000));
    manager.execute(code, me.participantId, { type: 'start', requestId: requestId() }, 1_010);
    runToEnd(manager, code, me.participantId);
    const duo = manager.getSnapshot(code, other.participantId).season;
    expect(duo!.rematch).not.toBeNull();
  });
});

describe('o lobby mostra o time de todo mundo', () => {
  it('o snapshot leva o power e o coach de cada participante', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 1_000, `lobby-${requestId()}`);
    const me = manager.join(code, 'Dono', 'SK', 1_001, manager.prepareLineup(code, {
      userId: 'dono', lineup: cards.map((player, index) => toSelectedPlayer(player.id, ROLES[index])),
      style: 'tactical', starPlayerId: 'fallen-2016', coachId: 'coach-sk-2016', mapPreferences: [...getDefaultMapSelection(cards as Player[], teams)]
    }, 1_000));
    const other = manager.join(code, 'Amigo', 'Org B', 1_002);
    const snapshot = manager.getSnapshot(code, me.participantId, 1_100);
    const mine = snapshot.participants.find((participant) => participant.id === me.participantId)!;
    const bare = snapshot.participants.find((participant) => participant.id === other.participantId)!;
    // Com time da coleção salvo o número (e o coach do banco) aparecem já no lobby; sem time, ainda não.
    expect(mine.power).not.toBeNull();
    expect(mine.coachId).toBe('coach-sk-2016');
    expect(bare.power).toBeNull();
  });
});

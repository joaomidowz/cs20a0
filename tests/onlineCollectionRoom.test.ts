// tests/onlineCollectionRoom.test.ts
// Sala com lineup da coleção: pula o draft, aplica star/sinergia e entrega o run terminado ao hook de persistência.
import { describe, expect, it } from 'vitest';
import { players, teams, playerById } from '../server/data';
import { detectAwards } from '../server/collection/awards';
import { pointsFor } from '../server/collection/seasons';
import { LINEUP_TICKET_TTL_MS, RoomError, RoomManager, VETO_STEP_DEADLINE_MS, type PreparedLineup, type RunCompletedEvent } from '../server/room-manager';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../src/lib/game/online/contracts';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import type { Player, SeriesResult } from '../src/lib/game/types';

const CONFIG: RoomConfig = { ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 4, draftDeadlineSeconds: 60, simulationSpeed: 'ultra', seasonRuns: 1 };
let counter = 0;
const requestId = () => `req-${(counter += 1).toString().padStart(8, '0')}`;

const distinctByBase = (list: Player[]) => {
  const seen = new Set<string>();
  return list.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; });
};
function prepared(userId: string, offset: number): PreparedLineup {
  const pool = distinctByBase(players.filter((_, index) => index % 3 === offset));
  const pick = (role: string) => pool.find((player) => primaryRoleOf(player) === role)!;
  const five = [pick('igl'), pick('awper'), pick('entry'), pick('lurker'), pick('support')];
  return {
    userId,
    lineup: five.map((player) => ({ playerId: player.id, selectedSlotRole: primaryRoleOf(player) })),
    style: 'balanced',
    starPlayerId: [...five].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0].id,
    mapPreferences: [...getDefaultMapSelection(five, teams)]
  };
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

describe('lineup da coleção na sala', () => {
  it('dois times de coleção começam o Major sem draft e o hook recebe as duas entradas', () => {
    const events: RunCompletedEvent[] = [];
    const manager = new RoomManager({ onRunCompleted: (event) => events.push(event) });
    const code = manager.createRoom(CONFIG, 1_000, 'collection-room');
    const ticketA = manager.prepareLineup(code, prepared('user-a', 0), 1_000);
    const ticketB = manager.prepareLineup(code, prepared('user-b', 1), 1_000);
    const a = manager.join(code, 'Ana', 'Org A', 1_001, ticketA);
    const b = manager.join(code, 'Bia', 'Org B', 1_002, ticketB);
    expect(() => manager.join(code, 'Cai', 'Org C', 1_003, ticketA)).toThrowError(RoomError);
    const lobby = manager.getSnapshot(code, a.participantId, 1_003);
    expect(lobby.participants.every((participant) => participant.collection)).toBe(true);

    manager.execute(code, a.participantId, { type: 'start', requestId: requestId() }, 1_010);
    const started = manager.getSnapshot(code, a.participantId, 1_010);
    expect(started.phase).toBe('playoffs');
    expect(started.tournament).not.toBeNull();
    expect(started.organizations?.find((organization) => organization.id === a.participantId)?.lineup).toHaveLength(5);

    const { snapshot } = runToCompletion(manager, code, a.participantId, 1_010);
    expect(snapshot.phase).toBe('completed');
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.lobbySize).toBe(2);
    expect(event.entries.map((entry) => entry.userId).sort()).toEqual(['user-a', 'user-b']);
    const champion = event.entries.find((entry) => entry.champion);
    expect(event.entries.filter((entry) => entry.champion).length).toBeLessThanOrEqual(1);
    for (const entry of event.entries) {
      expect(entry.lineup).toHaveLength(5);
      expect(entry.matches.length).toBeGreaterThan(0);
      expect(entry.stats).toHaveLength(5);
      expect(entry.opponents.length).toBe(entry.matches.length);
    }
    if (champion) expect(champion.placement).toBe('placementChampion');
    expect(b.participantId).not.toBe(a.participantId);
  });

  it('mistura coleção com draft: o de coleção já está pronto e o outro drafta', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 5_000, 'mixed-room');
    const ticket = manager.prepareLineup(code, prepared('user-a', 0), 5_000);
    const a = manager.join(code, 'Ana', 'Org A', 5_001, ticket);
    const b = manager.join(code, 'Bob', 'Org B', 5_002);
    manager.execute(code, a.participantId, { type: 'start', requestId: requestId() }, 5_010);
    const snapshot = manager.getSnapshot(code, b.participantId, 5_010);
    expect(snapshot.phase).toBe('draft');
    const ana = snapshot.participants.find((participant) => participant.id === a.participantId)!;
    const bob = snapshot.participants.find((participant) => participant.id === b.participantId)!;
    expect(ana.ready).toBe(true);
    expect(ana.collection).toBe(true);
    expect(bob.ready).toBe(false);
    expect(bob.collection).toBeUndefined();
  });

  it('ticket expira, sala iniciada recusa e a mesma conta não entra duas vezes', () => {
    const manager = new RoomManager();
    const code = manager.createRoom(CONFIG, 9_000, 'ticket-room');
    const ticket = manager.prepareLineup(code, prepared('user-a', 0), 9_000);
    expect(() => manager.join(code, 'Ana', 'Org A', 9_000 + LINEUP_TICKET_TTL_MS + 1, ticket)).toThrowError(/expired/);
    const fresh = manager.prepareLineup(code, prepared('user-a', 0), 9_100);
    manager.join(code, 'Ana', 'Org A', 9_101, fresh);
    const again = manager.prepareLineup(code, prepared('user-a', 1), 9_102);
    expect(() => manager.join(code, 'Ana 2', 'Org A2', 9_103, again)).toThrowError(/already in the room/);
    manager.join(code, 'Bob', 'Org B', 9_104);
    manager.execute(code, manager.getSnapshot(code, null, 9_105).participants[0].id, { type: 'start', requestId: requestId() }, 9_105);
    expect(() => manager.prepareLineup(code, prepared('user-c', 2), 9_106)).toThrowError(RoomError);
  });
});

describe('awards e pontos', () => {
  const me = 'p1';
  const team = (id: string, power = 80) => ({ id, name: id, power, mental: 70, clutch: 70, experience: 70 });
  const map = (mine: number, theirs: number, meIsA: boolean, extra: Partial<SeriesResult['maps'][number]> = {}) => ({ map: 1, scoreA: meIsA ? mine : theirs, scoreB: meIsA ? theirs : mine, winnerId: mine > theirs ? me : 'x', rounds: [], overtime: false, ...extra });
  const series = (id: string, maps: SeriesResult['maps'], bestOf: 1 | 3 | 5 = 3, phase: SeriesResult['phase'] = 'quarterfinal'): SeriesResult => {
    const wins = maps.filter((entry) => entry.winnerId === me).length;
    return { id, phase, bestOf, teamA: team(me), teamB: team('x', 95), scoreA: wins, scoreB: maps.length - wins, winnerId: wins > maps.length - wins ? me : 'x', maps, userMatch: true };
  };
  const lineup = distinctByBase(players).slice(0, 5);

  it('detecta 13-0, série perfeita, virada, invicto, gigante e star', () => {
    const matches = [
      series('q', [map(13, 0, true), map(13, 11, true, { overtime: false })]),
      series('s', [map(10, 13, true), map(16, 14, true, { overtime: true }), map(13, 7, true)], 3, 'semifinal'),
      series('f', [map(13, 9, true), map(13, 5, true)], 3, 'final')
    ];
    const star = lineup[0];
    const found = detectAwards({
      participantId: me, placement: 'placementChampion', champion: true,
      lineup: lineup.map((player) => ({ playerId: player.id, selectedSlotRole: 'rifler' })), starPlayerId: star.id,
      matches, stats: lineup.map((player) => ({ playerId: player.id, assignedRole: 'rifler', runRating: player.id === star.id ? 1.42 : 1.0, kills: 0, deaths: 0, kdRatio: 1, adr: 0, impact: 0, clutches: 0, openingKills: 0, mvpCount: 0, consistency: 0, mapsPlayed: 7, mapsWon: 6, mapsLost: 1, roundsWon: 0, roundsLost: 0 })),
      opponents: matches.map((entry) => ({ id: 'x', power: 95, won: true })), ownPower: 80,
      awards: { mvp: { playerId: star.id, name: star.nickname ?? star.id, teamId: me, teamName: 'me', rating: 1.42, kills: 0, deaths: 0, kdRatio: 1 } as never, topPlayers: [], topTeam: null, teams: [], clutchKing: null, highlightReel: null },
      lookup: (id) => playerById.get(id)
    });
    const kinds = found.map((award) => award.kind);
    expect(kinds).toEqual(expect.arrayContaining(['major_title', 'major_mvp', 'flawless_map', 'perfect_series', 'comeback_series', 'undefeated_major', 'giant_killer', 'star_delivered', 'carried']));
    expect(kinds.filter((kind) => kind === 'giant_killer')).toHaveLength(3);
    expect(kinds).not.toContain('overtime_king');
  });

  it('pontos por tamanho do lobby', () => {
    expect(pointsFor(1)).toBe(0);
    expect(pointsFor(2)).toBe(0);
    expect(pointsFor(3)).toBe(3);
    expect(pointsFor(4)).toBe(3);
    expect(pointsFor(5)).toBe(4);
    expect(pointsFor(7)).toBe(4);
    expect(pointsFor(8)).toBe(5);
    expect(pointsFor(16)).toBe(5);
  });
});

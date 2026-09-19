// tests/majorChampions.test.ts
// Lista curada de campeões de Major contra o dataset do online e o solo "Major dos Campeões" na sala.
import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { QUEUE_ROOM_CONFIG } from '../server/queue';
import { RoomManager, VETO_STEP_DEADLINE_MS, type PreparedLineup, type RunCompletedEvent } from '../server/room-manager';
import { primaryRoleOf } from '../src/lib/game/online/collection-lineup';
import { CHAMPION_TEAM_IDS, MAJOR_CHAMPIONS } from '../src/lib/game/online/major-champions';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import type { Player } from '../src/lib/game/types';

const teamIds = new Set(teams.map((team) => team.id));

function prepared(userId: string): PreparedLineup {
  const seen = new Set<string>();
  const pool = players.filter((player) => { const base = player.baseId ?? player.id; if (seen.has(base)) return false; seen.add(base); return true; });
  const pick = (role: string) => pool.find((player) => primaryRoleOf(player) === role)!;
  const five: Player[] = [pick('igl'), pick('awper'), pick('entry'), pick('lurker'), pick('support')];
  return { userId, lineup: five.map((player) => ({ playerId: player.id, selectedSlotRole: primaryRoleOf(player) })), style: 'balanced', starPlayerId: null, mapPreferences: [...getDefaultMapSelection(five, teams)] };
}

describe('MAJOR_CHAMPIONS', () => {
  it('todo teamId preenchido existe no teams.game.json e bate com o ano do título', () => {
    for (const champion of MAJOR_CHAMPIONS) {
      if (!champion.teamId) continue;
      expect(teamIds.has(champion.teamId), champion.event).toBe(true);
      expect(teams.find((team) => team.id === champion.teamId)?.year, champion.event).toBe(champion.year);
    }
  });

  it('lista os campeões que ficam fora do sorteio por faltar no dataset', () => {
    const missing = MAJOR_CHAMPIONS.filter((champion) => !champion.teamId || !teamIds.has(champion.teamId)).map((champion) => champion.event);
    // Hoje o dataset do online começa em 2016: os sete Majors de 2013–2015 ficam de fora.
    expect(missing).toEqual([
      'DreamHack Winter 2013', 'EMS One Katowice 2014', 'ESL One Cologne 2014', 'DreamHack Winter 2014',
      'ESL One Katowice 2015', 'ESL One Cologne 2015', 'DreamHack Open Cluj-Napoca 2015'
    ]);
    expect(CHAMPION_TEAM_IDS.size).toBe(15);
  });

  it("a sala solo com field 'champions' monta o campo só com campeões e marca o evento", () => {
    const events: RunCompletedEvent[] = [];
    const manager = new RoomManager({ onRunCompleted: (event) => events.push(event) });
    const code = manager.createRoom(QUEUE_ROOM_CONFIG, 1_000, 'champions-room', { origin: 'queue', expected: 1, field: 'champions' });
    const ticket = manager.prepareLineup(code, prepared('solo-user'), 1_000);
    const me = manager.join(code, 'Solo', 'Solo Org', 1_001, ticket);
    manager.tick(1_002);
    let now = 1_002;
    let snapshot = manager.getSnapshot(code, me.participantId, now);
    for (let index = 0; index < 5 && !snapshot.organizations; index += 1) { now += 1_000; manager.tick(now); snapshot = manager.getSnapshot(code, me.participantId, now); }
    const bots = (snapshot.organizations ?? []).filter((organization) => organization.id !== me.participantId);
    expect(bots).toHaveLength(15);
    for (const bot of bots) expect(CHAMPION_TEAM_IDS.has(bot.id.replace(/^bot-/, '')), bot.id).toBe(true);
    for (let index = 0; index < 5_000 && snapshot.phase !== 'completed'; index += 1) {
      now += VETO_STEP_DEADLINE_MS;
      manager.tick(now);
      snapshot = manager.getSnapshot(code, me.participantId, now);
    }
    expect(snapshot.phase).toBe('completed');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ field: 'champions', competitive: false, lobbySize: 1 });
    const entry = events[0].entries[0];
    expect(entry.lineupIds).toHaveLength(5);
    expect(entry.seriesLost).toBe(entry.matches.filter((series) => series.winnerId !== me.participantId).length);
    expect(manager.liveQueueRooms(now)).toHaveLength(0);
  });
});

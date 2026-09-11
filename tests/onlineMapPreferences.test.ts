import { describe, expect, it } from 'vitest';
import { players, teams } from '../server/data';
import { RoomError, RoomManager } from '../server/room-manager';
import { drawHumanSeeds } from '../src/lib/game/online/tournament-engine';
import { getDefaultMapSelection, getLineupMapContributors, MAP_POOL } from '../src/lib/game/maps';
import { DEFAULT_ROOM_CONFIG, PROTOCOL_VERSION, parseClientCommand } from '../src/lib/game/online/contracts';
import type { MapId, Player } from '../src/lib/game/types';

const lineupPlayers = (manager: RoomManager, code: string, participantId: string, now: number): Player[] =>
  (manager.getSnapshot(code, participantId, now).self?.lineup ?? [])
    .map((pick) => players.find((player) => player.id === pick.playerId))
    .filter((player): player is Player => Boolean(player));

describe('online map preferences', () => {
  it('uses protocol 8 and parses exactly three historical maps', () => {
    expect(PROTOCOL_VERSION).toBe(9);
    expect(parseClientCommand({
      type: 'submit-map-preferences', requestId: 'maps-valid-0001', mapPreferences: ['train', 'cache', 'overpass']
    })).toMatchObject({ type: 'submit-map-preferences' });
    expect(() => parseClientCommand({
      type: 'submit-map-preferences', requestId: 'maps-invalid-01', mapPreferences: ['train', 'cache', 'office']
    })).toThrow();
  });

  it('keeps the room in draft until both participants confirm valid familiar maps, then runs authoritative vetoes', () => {
    const manager = new RoomManager();
    const now = 10_000;
    // A seed where the two humans land in different quarterfinals: their vetoes run automatically against bots.
    const seed = Array.from({ length: 200 }, (_, index) => `map-flow-${index}`).find((candidate) => { const [a, b] = drawHumanSeeds(candidate, 2, 8); return a + b !== 9; })!;
    const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, entryStage: 'playoffs', capacity: 2, draftDeadlineSeconds: 60 }, now, seed);
    const host = manager.join(code, 'Host', 'Host org', now);
    const guest = manager.join(code, 'Guest', 'Guest org', now + 1);
    manager.execute(code, host.participantId, { type: 'start', requestId: 'start-map-flow' }, now + 2);
    manager.tick(now + 61_000);

    const hostPlayers = lineupPlayers(manager, code, host.participantId, now + 61_000);
    const guestPlayers = lineupPlayers(manager, code, guest.participantId, now + 61_000);
    const hostMaps = getDefaultMapSelection(hostPlayers, teams);
    const guestMaps = getDefaultMapSelection(guestPlayers, teams);
    expect(() => manager.execute(code, host.participantId, {
      type: 'submit-map-preferences', requestId: 'maps-duplicate-1', mapPreferences: [hostMaps[0], hostMaps[0], hostMaps[1]]
    }, now + 61_010)).toThrowError(RoomError);

    const unknown = MAP_POOL.find((mapId) => getLineupMapContributors(hostPlayers, teams)[mapId].length === 0);
    if (unknown) {
      expect(() => manager.execute(code, host.participantId, {
        type: 'submit-map-preferences', requestId: 'maps-era-bad-01', mapPreferences: [unknown, hostMaps[0], hostMaps[1]] as [MapId, MapId, MapId]
      }, now + 61_011)).toThrowError(RoomError);
    }

    manager.execute(code, host.participantId, { type: 'submit-map-preferences', requestId: 'maps-host-ok-01', mapPreferences: hostMaps }, now + 61_020);
    const hostAsSeenByGuest = manager.getSnapshot(code, guest.participantId, now + 61_020).participants.find((item) => item.id === host.participantId);
    expect(hostAsSeenByGuest?.mapsConfirmed).toBe(true);
    expect(hostAsSeenByGuest?.mapPreferences).toEqual([]);
    expect(manager.getSnapshot(code, host.participantId, now + 61_020).phase).toBe('draft');

    manager.execute(code, guest.participantId, { type: 'submit-map-preferences', requestId: 'maps-guest-ok1', mapPreferences: guestMaps }, now + 61_030);
    const started = manager.getSnapshot(code, host.participantId, now + 61_030);
    expect(started.phase).toBe('playoffs');
    const series = started.tournament?.liveCursor?.primarySeries?.series;
    expect(series?.veto?.length).toBeGreaterThanOrEqual(7);
    expect(series?.maps.every((map) => map.mapId)).toBe(true);
    expect(new Set(series?.veto?.map((step) => step.mapId)).size).toBe(series?.veto?.length);
  });
});

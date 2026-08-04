import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_CONFIG } from '../src/lib/game/online/contracts';
import { EMPTY_ROOM_TTL_MS, RoomManager } from '../server/room-manager';

describe('online room load and cleanup', () => {
  it('keeps ten rooms with sixteen participants deterministic and cleans them after the TTL', () => {
    const manager = new RoomManager();
    const startedAt = 1_000_000;
    const rooms = Array.from({ length: 10 }, (_, roomIndex) => {
      const code = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, draftDeadlineSeconds: 60, simulationSpeed: 'ultra' }, startedAt);
      const participants = Array.from({ length: 16 }, (_, participantIndex) => manager.join(
        code,
        `Player ${roomIndex}-${participantIndex}`,
        `Org ${roomIndex}-${participantIndex}`,
        startedAt + participantIndex
      ));
      manager.execute(code, participants[0].participantId, { type: 'start', requestId: `start-${roomIndex.toString().padStart(8, '0')}` }, startedAt + 20);
      return { code, participants };
    });

    manager.tick(startedAt + 61_000);
    for (const room of rooms) {
      const snapshots = room.participants.map((participant) => manager.getSnapshot(room.code, participant.participantId, startedAt + 61_000));
      expect(snapshots.every((snapshot) => snapshot.version === snapshots[0].version)).toBe(true);
      expect(snapshots.every((snapshot) => snapshot.participants.length === 16)).toBe(true);
      for (const participant of room.participants) manager.disconnect(room.code, participant.participantId, startedAt + 62_000);
    }
    expect(manager.roomCount()).toBe(10);
    manager.tick(startedAt + 62_000 + EMPTY_ROOM_TTL_MS);
    expect(manager.roomCount()).toBe(0);
  }, 20_000);
});

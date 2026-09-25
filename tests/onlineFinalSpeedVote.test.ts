import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_CONFIG, type RoomConfig } from '../src/lib/game/online/contracts';
import { finalHumanIds, RoomError, RoomManager } from '../server/room-manager';

describe('voto por velocidade Normal na Grande Final', () => {
  it('exige exatamente dois finalistas humanos', () => {
    expect(finalHumanIds('final', ['p1', 'p2'], new Set(['p1', 'p2']))).toEqual(['p1', 'p2']);
    expect(finalHumanIds('final', ['p1', 'bot-team'], new Set(['p1']))).toBeNull();
    expect(finalHumanIds('semifinal', ['p1', 'p2'], new Set(['p1', 'p2']))).toBeNull();
  });

  it('só aplica Normal após os dois finalistas votarem e rejeita não finalistas', () => {
    const manager = new RoomManager();
    const roomCode = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, simulationSpeed: 'ultra' }, 1_000, 'vote-test-seed', { origin: 'queue', expected: 2 });
    const p1 = manager.join(roomCode, 'Player One', 'Org One', 1_001).participantId;
    const p2 = manager.join(roomCode, 'Player Two', 'Org Two', 1_002).participantId;
    const p3 = manager.join(roomCode, 'Player Three', 'Org Three', 1_003).participantId;
    expect(() => manager.execute(roomCode, p1, { type: 'configure', requestId: 'queue-config-0001', config: { ...DEFAULT_ROOM_CONFIG, simulationSpeed: 'normal' } }, 1_004)).toThrow(RoomError);
    const roomMap = (manager as unknown as { rooms: Map<string, { phase: string; engine: unknown; live: Map<string, unknown>; config: RoomConfig; finalNormalVotes: Set<string> }> }).rooms;
    const room = roomMap.get(roomCode)!;
    room.phase = 'playoffs';
    room.engine = { rounds: [{ phase: 'final', complete: false }] };
    room.live = new Map([['final-series', { state: { phase: 'veto', current: null, config: { teamA: { id: p1 }, teamB: { id: p2 } } }, nextRoundAt: null }]]);

    manager.execute(roomCode, p1, { type: 'vote-final-speed', requestId: 'vote-first-0001' }, 2_000);
    expect(room.config.simulationSpeed).toBe('ultra');
    expect(room.finalNormalVotes).toEqual(new Set([p1]));
    expect(() => manager.execute(roomCode, p3, { type: 'vote-final-speed', requestId: 'vote-third-0001' }, 2_001)).toThrow(RoomError);

    manager.execute(roomCode, p2, { type: 'vote-final-speed', requestId: 'vote-second-001' }, 2_002);
    expect(room.config.simulationSpeed).toBe('normal');
    expect(room.finalNormalVotes).toEqual(new Set([p1, p2]));
  });

  it('rejeita final com bot e qualquer fase diferente da final', () => {
    const manager = new RoomManager();
    const roomCode = manager.createRoom({ ...DEFAULT_ROOM_CONFIG, simulationSpeed: 'ultra' }, 1_000, 'vote-bot-seed', { origin: 'queue', expected: 2 });
    const p1 = manager.join(roomCode, 'Player One', 'Org One', 1_001).participantId;
    const roomMap = (manager as unknown as { rooms: Map<string, { phase: string; engine: unknown; live: Map<string, unknown>; config: RoomConfig }> }).rooms;
    const room = roomMap.get(roomCode)!;
    room.phase = 'playoffs';
    room.engine = { rounds: [{ phase: 'final', complete: false }] };
    room.live = new Map([['final-series', { state: { phase: 'veto', current: null, config: { teamA: { id: p1 }, teamB: { id: 'bot-team' } } }, nextRoundAt: null }]]);
    expect(() => manager.execute(roomCode, p1, { type: 'vote-final-speed', requestId: 'vote-bot-00001' }, 2_000)).toThrow(RoomError);
    room.engine = { rounds: [{ phase: 'semifinal', complete: false }] };
    room.live = new Map([['semi-series', { state: { phase: 'veto', current: null, config: { teamA: { id: p1 }, teamB: { id: 'another-human' } } }, nextRoundAt: null }]]);
    expect(() => manager.execute(roomCode, p1, { type: 'vote-final-speed', requestId: 'vote-semi-0001' }, 2_001)).toThrow(RoomError);
    expect(room.config.simulationSpeed).toBe('ultra');
  });
});

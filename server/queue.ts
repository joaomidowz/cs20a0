import type { RoomConfig } from '../src/lib/game/online/contracts';
import { COMPETITIVE_MIN_HUMANS, type PreparedLineup, type RoomManager } from './room-manager';

/** Competitive matchmaking: collection teams only, at least four humans per Major, bots fill the rest of the field. */
export const QUEUE_MIN = COMPETITIVE_MIN_HUMANS;
export const QUEUE_MAX = 8;
/** Once four are waiting, the queue holds this long for more players before it closes the room. */
export const QUEUE_FILL_WINDOW_MS = 20_000;
/** A match stays claimable this long; the player's client polls it and connects. */
const MATCH_TTL_MS = 120_000;

export const QUEUE_ROOM_CONFIG: RoomConfig = {
  mode: 'premier',
  entryStage: 'stage3',
  capacity: QUEUE_MAX,
  draftDeadlineSeconds: 60,
  simulationMode: 'automatic',
  simulationSpeed: 'normal',
  seasonRuns: 1
};

interface Waiting {
  userId: string;
  prepared: PreparedLineup;
  since: number;
}

export interface QueueStatus {
  state: 'idle' | 'waiting' | 'matched';
  waiting: number;
  since: number | null;
  match: { roomCode: string; lineupTicket: string } | null;
}

export function createQueue(manager: RoomManager, now: () => number = Date.now) {
  const waiting = new Map<string, Waiting>();
  const matches = new Map<string, { roomCode: string; lineupTicket: string; at: number }>();
  /** When the queue first reached the minimum; the fill window runs from here. */
  let readySince: number | null = null;

  function join(userId: string, prepared: PreparedLineup): QueueStatus {
    matches.delete(userId);
    if (!waiting.has(userId)) waiting.set(userId, { userId, prepared, since: now() });
    else waiting.get(userId)!.prepared = prepared;
    tick();
    return status(userId);
  }

  function leave(userId: string) {
    waiting.delete(userId);
    if (waiting.size < QUEUE_MIN) readySince = null;
  }

  function status(userId: string): QueueStatus {
    const match = matches.get(userId);
    if (match) return { state: 'matched', waiting: waiting.size, since: null, match: { roomCode: match.roomCode, lineupTicket: match.lineupTicket } };
    const entry = waiting.get(userId);
    return { state: entry ? 'waiting' : 'idle', waiting: waiting.size, since: entry?.since ?? null, match: null };
  }

  /** Closes a room when eight are waiting, or when at least four waited out the fill window. Oldest first. */
  function tick() {
    const current = now();
    for (const [userId, match] of matches) if (current - match.at > MATCH_TTL_MS) matches.delete(userId);
    if (waiting.size < QUEUE_MIN) { readySince = null; return; }
    readySince ??= current;
    if (waiting.size < QUEUE_MAX && current - readySince < QUEUE_FILL_WINDOW_MS) return;
    const group = [...waiting.values()].sort((a, b) => a.since - b.since).slice(0, QUEUE_MAX);
    const roomCode = manager.createRoom(QUEUE_ROOM_CONFIG, current, undefined, { origin: 'queue', expected: group.length });
    for (const entry of group) {
      const lineupTicket = manager.prepareLineup(roomCode, entry.prepared, current);
      matches.set(entry.userId, { roomCode, lineupTicket, at: current });
      waiting.delete(entry.userId);
    }
    readySince = waiting.size >= QUEUE_MIN ? current : null;
  }

  return { join, leave, status, tick, size: () => waiting.size };
}

export type Queue = ReturnType<typeof createQueue>;

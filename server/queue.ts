import type { RoomConfig } from '../src/lib/game/online/contracts';
import type { PreparedLineup, RoomManager } from './room-manager';

/** Competitive matchmaking: collection teams only, at least three humans per Major, bots fill the rest of the field. */
/** Three or more close a room after the short fill window; exactly two wait for the pair window instead. */
export const QUEUE_MIN = 3;
export const QUEUE_MAX = 8;
/** Once the minimum is waiting, the queue always holds this long for more players (even when full) before it closes the room. */
export const QUEUE_FILL_WINDOW_MS = 10_000;
/** Exactly two waiting: once they have been the only ones for this long, they play each other (a third of the points). */
export const QUEUE_PAIR_WINDOW_MS = 30_000;
/** A player whose client stopped polling for this long (tab closed, browser gone) leaves the queue. */
export const QUEUE_STALE_MS = 20_000;
/** A match stays claimable this long; the player's client polls it and connects. */
const MATCH_TTL_MS = 120_000;
/** How long `status` keeps explaining why a player was taken out of the queue. */
const REMOVAL_MEMORY_MS = 120_000;

export type QueueLeftReason = 'stale' | 'hidden';

export const QUEUE_ROOM_CONFIG: RoomConfig = {
  mode: 'premier',
  entryStage: 'stage3',
  capacity: QUEUE_MAX,
  draftDeadlineSeconds: 60,
  simulationMode: 'automatic',
  // Queue matches always run automatic at ultra speed; nobody can change it in the room.
  simulationSpeed: 'ultra',
  seasonRuns: 1
};

interface Waiting {
  userId: string;
  prepared: PreparedLineup;
  since: number;
  /** Last join or status call: the client's 2 s poll doubles as a heartbeat. */
  lastSeen: number;
}

export interface QueueStatus {
  state: 'idle' | 'waiting' | 'matched';
  waiting: number;
  since: number | null;
  match: { roomCode: string; lineupTicket: string } | null;
  /** Time left before the queue closes a room for the players waiting now; null while there are not enough. */
  closesInMs: number | null;
  /** Only two waiting: the room they get scores a third of the season points. */
  pair: boolean;
  /** Why this player was taken out of the queue recently (not set when they left on purpose). */
  left: QueueLeftReason | null;
}

export function createQueue(manager: RoomManager, now: () => number = Date.now) {
  const waiting = new Map<string, Waiting>();
  const matches = new Map<string, { roomCode: string; lineupTicket: string; at: number }>();
  const removed = new Map<string, { reason: QueueLeftReason; at: number }>();
  /** When the queue first reached the minimum; the fill window runs from here. */
  let readySince: number | null = null;
  /** When the queue first had two players (and fewer than the minimum); the pair window runs from here. */
  let pairSince: number | null = null;

  function join(userId: string, prepared: PreparedLineup): QueueStatus {
    const current = now();
    matches.delete(userId);
    removed.delete(userId);
    const entry = waiting.get(userId);
    if (!entry) waiting.set(userId, { userId, prepared, since: current, lastSeen: current });
    else { entry.prepared = prepared; entry.lastSeen = current; }
    tick();
    return status(userId);
  }

  function leave(userId: string, reason?: QueueLeftReason) {
    const wasWaiting = waiting.delete(userId);
    if (wasWaiting && reason) removed.set(userId, { reason, at: now() });
    resetWindows();
  }

  function resetWindows() {
    if (waiting.size < QUEUE_MIN) readySince = null;
    if (waiting.size < 2) pairSince = null;
  }

  function closesIn(current: number): number | null {
    if (waiting.size >= QUEUE_MIN) return Math.max(0, (readySince ?? current) + QUEUE_FILL_WINDOW_MS - current);
    if (waiting.size === 2) return Math.max(0, (pairSince ?? current) + QUEUE_PAIR_WINDOW_MS - current);
    return null;
  }

  function status(userId: string): QueueStatus {
    const current = now();
    const match = matches.get(userId);
    if (match) return { state: 'matched', waiting: waiting.size, since: null, match: { roomCode: match.roomCode, lineupTicket: match.lineupTicket }, closesInMs: null, pair: false, left: null };
    const entry = waiting.get(userId);
    if (entry) entry.lastSeen = current;
    const gone = entry ? null : removed.get(userId) ?? null;
    return { state: entry ? 'waiting' : 'idle', waiting: waiting.size, since: entry?.since ?? null, match: null, closesInMs: entry ? closesIn(current) : null, pair: Boolean(entry) && waiting.size === 2, left: gone?.reason ?? null };
  }

  function openRoom(group: Waiting[], current: number) {
    const roomCode = manager.createRoom(QUEUE_ROOM_CONFIG, current, undefined, { origin: 'queue', expected: group.length });
    for (const entry of group) {
      const lineupTicket = manager.prepareLineup(roomCode, entry.prepared, current);
      matches.set(entry.userId, { roomCode, lineupTicket, at: current });
      waiting.delete(entry.userId);
    }
  }

  /**
   * Drops players whose client stopped polling, then closes a room: three or more after the fill window (up to
   * eight, oldest first), or exactly two after they were alone together for the pair window.
   */
  function tick() {
    const current = now();
    for (const [userId, match] of matches) if (current - match.at > MATCH_TTL_MS) matches.delete(userId);
    for (const [userId, gone] of removed) if (current - gone.at > REMOVAL_MEMORY_MS) removed.delete(userId);
    for (const [userId, entry] of waiting) {
      if (current - entry.lastSeen > QUEUE_STALE_MS) { waiting.delete(userId); removed.set(userId, { reason: 'stale', at: current }); }
    }
    resetWindows();
    if (waiting.size >= QUEUE_MIN) {
      readySince ??= current;
      if (current - readySince < QUEUE_FILL_WINDOW_MS) return;
      openRoom([...waiting.values()].sort((a, b) => a.since - b.since).slice(0, QUEUE_MAX), current);
      readySince = waiting.size >= QUEUE_MIN ? current : null;
      pairSince = waiting.size === 2 ? current : null;
      return;
    }
    if (waiting.size === 2) {
      pairSince ??= current;
      if (current - pairSince < QUEUE_PAIR_WINDOW_MS) return;
      openRoom([...waiting.values()], current);
      pairSince = null;
    }
  }

  return { join, leave, status, tick, size: () => waiting.size };
}

export type Queue = ReturnType<typeof createQueue>;

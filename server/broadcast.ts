import type { PublicLiveSeries, RoomPhase } from '../src/lib/game/online/contracts';

/** Last kill-feed round one connection received, for the map it was watching (`seriesId:activeMap`). */
export interface FeedCursor {
  key: string;
  round: number;
}

/**
 * What one connection has already received. The server decides per connection what to send next, so a slow client
 * never gets an update it cannot use and never misses a round of its kill feed.
 */
export interface DeliveryState {
  /** Last room version delivered (by snapshot or live update). */
  sentVersion: number;
  /** Last room state version delivered by a snapshot. */
  sentStateVersion: number;
  feedCursor: FeedCursor | null;
}

export interface RoomVersions {
  /** Bumped on every change of the room. */
  version: number;
  /** Bumped only when something outside the live cursor changes: participants, config, phase, history, season. */
  stateVersion: number;
  phase: RoomPhase;
}

export type BroadcastPlan = 'snapshot' | 'live' | 'skip' | 'none';

export const initialDelivery = (): DeliveryState => ({ sentVersion: 0, sentStateVersion: 0, feedCursor: null });

export const feedKey = (seriesId: string, activeMap: number) => `${seriesId}:${activeMap}`;

/**
 * Chooses what a connection gets now. A changed state version always earns a full snapshot (never skipped, since it
 * carries decisions of the room such as a closed round or a rematch); the lobby and the draft only ever use snapshots
 * (they are small); a live update is skipped while the socket still has more than `backpressureLimit` bytes queued,
 * and the next tick tries again with the state of that moment.
 */
export function planBroadcast(delivery: DeliveryState, versions: RoomVersions, bufferedBytes: number, backpressureLimit: number): BroadcastPlan {
  if (versions.stateVersion !== delivery.sentStateVersion) return 'snapshot';
  if (versions.version === delivery.sentVersion) return 'none';
  if (versions.phase === 'lobby' || versions.phase === 'draft') return 'snapshot';
  return bufferedBytes > backpressureLimit ? 'skip' : 'live';
}

/** The cursor after `primary` was delivered: only ever advanced on a successful send, so a skipped update loses nothing. */
export function advanceFeedCursor(previous: FeedCursor | null, primary: PublicLiveSeries | null): FeedCursor | null {
  if (!primary) return previous;
  const key = feedKey(primary.series.id, primary.activeMap);
  const last = (primary.series.maps[primary.activeMap]?.details ?? []).reduce((max, detail) => Math.max(max, detail.number), 0);
  return previous?.key === key ? { key, round: Math.max(previous.round, last) } : { key, round: last };
}

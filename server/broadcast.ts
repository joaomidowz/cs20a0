import type { PublicLiveSeries, RoomPhase } from '../src/lib/game/online/contracts';

/**
 * How much of the kill feed of the series it watches one connection already received: every map before `map` in
 * full, and `map` up to `round`. Keeping the whole series (not just the live map) lets a client that fell behind across a
 * map change catch up on the tail of the previous map together with the new one.
 */
export interface FeedCursor {
  seriesId: string;
  map: number;
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

/** Key of one map's feed (`seriesId:map`), handy for bookkeeping on either side. */
export const feedKey = (seriesId: string, map: number) => `${seriesId}:${map}`;

/** True when round `round` of map `map` of `seriesId` still has to be sent to a connection at `cursor`. */
export const feedOwes = (cursor: FeedCursor | null, seriesId: string, map: number, round: number) =>
  !cursor || cursor.seriesId !== seriesId || map > cursor.map || (map === cursor.map && round > cursor.round);

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

/**
 * The cursor after `primary` was delivered: only ever advanced on a successful send, so a skipped update loses nothing.
 * A message always carries every owed round of the earlier maps before the later ones, so landing on the last map
 * with details is safe.
 */
export function advanceFeedCursor(previous: FeedCursor | null, primary: PublicLiveSeries | null): FeedCursor | null {
  if (!primary) return previous;
  const seriesId = primary.series.id;
  let cursor: FeedCursor = previous?.seriesId === seriesId ? previous : { seriesId, map: 0, round: 0 };
  primary.series.maps.forEach((map, index) => {
    const last = (map.details ?? []).reduce((max, detail) => Math.max(max, detail.number), 0);
    if (last > 0 && feedOwes(cursor, seriesId, index, last)) cursor = { seriesId, map: index, round: last };
  });
  return cursor;
}

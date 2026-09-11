import { describe, expect, it } from 'vitest';
import { advanceFeedCursor, feedOwes, initialDelivery, planBroadcast, type DeliveryState } from '../server/broadcast';
import type { PublicLiveSeries } from '../src/lib/game/online/contracts';

const delivery = (patch: Partial<DeliveryState> = {}): DeliveryState => ({ ...initialDelivery(), ...patch });

/** Just enough of a live series for the cursor: the maps up to the active one and the round numbers of their kill feed. */
const primaryMaps = (seriesId: string, activeMap: number, perMap: Array<number[] | null>): PublicLiveSeries => {
  const maps = Array.from({ length: activeMap + 1 }, (_, index) => ({
    map: index + 1, scoreA: 0, scoreB: 0, winnerId: '', rounds: [], overtime: false,
    ...(perMap[index] ? { details: perMap[index]!.map((number) => ({ number })) } : {})
  }));
  return { series: { id: seriesId, maps }, activeMap } as unknown as PublicLiveSeries;
};
const primary = (seriesId: string, activeMap: number, numbers: number[] | null): PublicLiveSeries =>
  primaryMaps(seriesId, activeMap, Array.from({ length: activeMap + 1 }, (_, index) => (index === activeMap ? numbers : null)));

describe('broadcast plan per connection', () => {
  const limit = 64 * 1024;

  it('sends a snapshot whenever the state version moved, even to a saturated socket', () => {
    expect(planBroadcast(delivery(), { version: 1, stateVersion: 1, phase: 'lobby' }, 0, limit)).toBe('snapshot');
    expect(planBroadcast(delivery({ sentVersion: 5, sentStateVersion: 2 }), { version: 6, stateVersion: 3, phase: 'swiss' }, limit + 1, limit)).toBe('snapshot');
  });

  it('sends nothing while the connection is up to date', () => {
    expect(planBroadcast(delivery({ sentVersion: 5, sentStateVersion: 2 }), { version: 5, stateVersion: 2, phase: 'swiss' }, 0, limit)).toBe('none');
    expect(planBroadcast(delivery({ sentVersion: 5, sentStateVersion: 2 }), { version: 5, stateVersion: 2, phase: 'draft' }, 0, limit)).toBe('none');
  });

  it('uses live updates during the tournament and skips them while the socket is backed up', () => {
    const sent = delivery({ sentVersion: 5, sentStateVersion: 2 });
    expect(planBroadcast(sent, { version: 6, stateVersion: 2, phase: 'swiss' }, 0, limit)).toBe('live');
    expect(planBroadcast(sent, { version: 6, stateVersion: 2, phase: 'playoffs' }, limit, limit)).toBe('live');
    expect(planBroadcast(sent, { version: 6, stateVersion: 2, phase: 'swiss' }, limit + 1, limit)).toBe('skip');
  });

  it('keeps the lobby and the draft on snapshots only', () => {
    const sent = delivery({ sentVersion: 5, sentStateVersion: 2 });
    expect(planBroadcast(sent, { version: 6, stateVersion: 2, phase: 'lobby' }, 0, limit)).toBe('snapshot');
    expect(planBroadcast(sent, { version: 6, stateVersion: 2, phase: 'draft' }, limit + 1, limit)).toBe('snapshot');
  });
});

describe('kill feed cursor per connection', () => {
  it('advances to the last round delivered and only forward within the same series', () => {
    const first = advanceFeedCursor(null, primary('s1', 0, [1, 2, 3]));
    expect(first).toEqual({ seriesId: 's1', map: 0, round: 3 });
    expect(advanceFeedCursor(first, primary('s1', 0, [4, 5]))).toEqual({ seriesId: 's1', map: 0, round: 5 });
    expect(advanceFeedCursor({ seriesId: 's1', map: 0, round: 5 }, primary('s1', 0, []))).toEqual({ seriesId: 's1', map: 0, round: 5 });
    expect(advanceFeedCursor({ seriesId: 's1', map: 0, round: 5 }, primary('s1', 0, [2]))).toEqual({ seriesId: 's1', map: 0, round: 5 });
  });

  it('moves to the next map once its rounds arrive and restarts on another series', () => {
    expect(advanceFeedCursor({ seriesId: 's1', map: 0, round: 5 }, primary('s1', 1, [1]))).toEqual({ seriesId: 's1', map: 1, round: 1 });
    // A catch-up message carries the tail of map 0 together with the start of map 1: the cursor lands on the later map.
    expect(advanceFeedCursor({ seriesId: 's1', map: 0, round: 5 }, primaryMaps('s1', 1, [[6, 7], [1, 2]]))).toEqual({ seriesId: 's1', map: 1, round: 2 });
    expect(advanceFeedCursor({ seriesId: 's1', map: 1, round: 1 }, primary('s2', 0, null))).toEqual({ seriesId: 's2', map: 0, round: 0 });
    expect(advanceFeedCursor({ seriesId: 's2', map: 0, round: 0 }, null)).toEqual({ seriesId: 's2', map: 0, round: 0 });
    expect(advanceFeedCursor(null, null)).toBeNull();
  });

  it('knows which rounds a connection is still owed', () => {
    expect(feedOwes(null, 's1', 0, 1)).toBe(true);
    expect(feedOwes({ seriesId: 's2', map: 3, round: 30 }, 's1', 0, 1)).toBe(true);
    const cursor = { seriesId: 's1', map: 1, round: 4 };
    expect(feedOwes(cursor, 's1', 0, 30)).toBe(false);
    expect(feedOwes(cursor, 's1', 1, 4)).toBe(false);
    expect(feedOwes(cursor, 's1', 1, 5)).toBe(true);
    expect(feedOwes(cursor, 's1', 2, 1)).toBe(true);
  });
});

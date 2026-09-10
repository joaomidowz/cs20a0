import { describe, expect, it } from 'vitest';
import { advanceFeedCursor, initialDelivery, planBroadcast, type DeliveryState } from '../server/broadcast';
import type { PublicLiveSeries } from '../src/lib/game/online/contracts';

const delivery = (patch: Partial<DeliveryState> = {}): DeliveryState => ({ ...initialDelivery(), ...patch });

/** Just enough of a live series for the cursor: the active map and the round numbers of its kill feed. */
const primary = (seriesId: string, activeMap: number, numbers: number[] | null): PublicLiveSeries => {
  const maps = Array.from({ length: activeMap + 1 }, (_, index) => ({
    map: index + 1, scoreA: 0, scoreB: 0, winnerId: '', rounds: [], overtime: false,
    ...(index === activeMap && numbers ? { details: numbers.map((number) => ({ number })) } : {})
  }));
  return { series: { id: seriesId, maps }, activeMap } as unknown as PublicLiveSeries;
};

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
  it('starts at the last round delivered and only moves forward on the same map', () => {
    const first = advanceFeedCursor(null, primary('s1', 0, [1, 2, 3]));
    expect(first).toEqual({ key: 's1:0', round: 3 });
    expect(advanceFeedCursor(first, primary('s1', 0, [4, 5]))).toEqual({ key: 's1:0', round: 5 });
    expect(advanceFeedCursor({ key: 's1:0', round: 5 }, primary('s1', 0, []))).toEqual({ key: 's1:0', round: 5 });
    expect(advanceFeedCursor({ key: 's1:0', round: 5 }, primary('s1', 0, [2]))).toEqual({ key: 's1:0', round: 5 });
  });

  it('restarts on a new map or another series and survives updates without a primary series', () => {
    expect(advanceFeedCursor({ key: 's1:0', round: 5 }, primary('s1', 1, [1]))).toEqual({ key: 's1:1', round: 1 });
    expect(advanceFeedCursor({ key: 's1:1', round: 1 }, primary('s2', 0, null))).toEqual({ key: 's2:0', round: 0 });
    expect(advanceFeedCursor({ key: 's2:0', round: 0 }, null)).toEqual({ key: 's2:0', round: 0 });
    expect(advanceFeedCursor(null, null)).toBeNull();
  });
});

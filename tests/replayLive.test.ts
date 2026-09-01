import { describe, expect, it } from 'vitest';
import {
  getLatestReplayRoundStartMs,
  getReplayRoundAtMs,
  ReplayLiveQueue
} from '../src/lib/game/replay/live';

const rounds = [
  { durationMs: 10_000 },
  { durationMs: 20_000 },
  { durationMs: 15_000 }
];

describe('replay live edge', () => {
  it('starts at the newest received round instead of replaying from round one', () => {
    expect(getLatestReplayRoundStartMs(rounds, 1)).toBe(0);
    expect(getLatestReplayRoundStartMs(rounds, 2)).toBe(10_000);
    expect(getLatestReplayRoundStartMs(rounds, 3)).toBe(30_000);
  });

  it('identifies the replayed round at boundaries and after the last frame', () => {
    expect(getReplayRoundAtMs(rounds, 0)).toBe(1);
    expect(getReplayRoundAtMs(rounds, 10_000)).toBe(2);
    expect(getReplayRoundAtMs(rounds, 44_999)).toBe(3);
    expect(getReplayRoundAtMs(rounds, 90_000)).toBe(3);
  });

  it('queues arrivals and never switches before the current round end was rendered', () => {
    const queue = new ReplayLiveQueue();
    queue.receive(1, 0);
    queue.receive(2, 5_000);

    expect(queue.currentRound).toBe(1);
    expect(queue.pendingRounds).toEqual([2]);
    expect(() => queue.markRoundEndRendered(1, false)).toThrow(/round-end/i);
    expect(queue.currentRound).toBe(1);
    expect(queue.advanceBetweenRounds()).toBeNull();

    queue.markRoundEndRendered(1, true);
    expect(queue.advanceBetweenRounds()).toMatchObject({ roundNumber: 2, pendingBefore: 1 });
    expect(queue.currentRound).toBe(2);
  });

  it('skips to the penultimate queued round only at a rendered round boundary', () => {
    const queue = new ReplayLiveQueue();
    queue.receive(1, 0);
    queue.receive(9, 8_000);

    expect(queue.currentRound).toBe(1);
    queue.markRoundEndRendered(1, true);
    expect(queue.advanceBetweenRounds()).toEqual({
      roundNumber: 8,
      pendingBefore: 8,
      skippedRounds: [2, 3, 4, 5, 6, 7]
    });
    expect(queue.pendingRounds).toEqual([9]);
  });
});

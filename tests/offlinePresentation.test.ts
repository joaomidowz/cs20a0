import { describe, expect, it } from 'vitest';
import { createOfflineMomentTracker } from '../src/lib/game/offlinePresentation';
import type { RoundDetail } from '../src/lib/game/types';

function round(number: number, kind: 'ace' | 'clutch' | 'comeback' = 'ace'): RoundDetail {
  return {
    number, winner: 'a', sideA: 'ct', overtime: false, ending: 'elimination', kills: [],
    economy: { a: { buy: 'full', money: 5000, awp: true, awpKept: false }, b: { buy: 'eco', money: 1000, awp: false, awpKept: false } },
    tags: kind === 'comeback' ? ['comeback-alert'] : [kind],
    ...(kind === 'comeback' ? {} : { highlight: { kind, playerId: 'test-player', playerName: 'Test', side: 'a' as const, kills: kind === 'ace' ? 5 : 3, against: 3 } })
  };
}

describe('offline presentation follows actual game events', () => {
  it('does not celebrate a restored round or repeat it when the same snapshot arrives', () => {
    const track = createOfflineMomentTracker();
    expect(track('series-a', 0, 5, round(5), 'en')).toBeNull();
    expect(track('series-a', 0, 5, round(5), 'pt-BR')).toBeNull();
    expect(track('series-a', 0, 6, round(6, 'clutch'), 'en')?.kind).toBe('clutch');
    expect(track('series-a', 0, 6, round(6, 'clutch'), 'en')).toBeNull();
  });

  it('celebrates committed aces and comeback alerts but not skipped batches', () => {
    const track = createOfflineMomentTracker();
    track('series-a', 0, 0, null, 'en');
    expect(track('series-a', 0, 1, round(1), 'en')?.kind).toBe('ace');
    expect(track('series-a', 0, 2, round(2, 'comeback'), 'en')?.kind).toBe('comeback');
    expect(track('series-a', 0, 12, round(12), 'en')).toBeNull();
    expect(track('series-a', 0, 13, round(13), 'en')?.kind).toBe('ace');
  });

  it('does not reuse round numbers across series or accept uncommitted details', () => {
    const track = createOfflineMomentTracker();
    track('series-a', 0, 0, null, 'en');
    expect(track('series-a', 0, 1, round(2), 'en')).toBeNull();
    expect(track('series-b', 0, 2, round(2), 'en')).toBeNull();
    expect(track('series-b', 1, 1, round(1), 'en')?.kind).toBe('ace');
  });

});

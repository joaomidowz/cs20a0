import type { MapResult, RoundScore } from './types';

export interface VisibleMapScore {
  a: number;
  b: number;
}

export function getVisibleMapScore(
  map: MapResult,
  round: RoundScore | null,
  state: { isComplete: boolean; isLive: boolean }
): VisibleMapScore | null {
  if (state.isComplete) return { a: map.scoreA, b: map.scoreB };
  if (round) return { a: round.a, b: round.b };
  if (state.isLive) return { a: 0, b: 0 };
  return null;
}

import type { MapResult, RoundScore } from './types';

export interface VisibleMapScore {
  a: number;
  b: number;
}

export interface SeriesPlaybackState {
  controlled: boolean;
  controlledStarted: boolean;
  started: boolean;
  auto: boolean;
  finished: boolean;
}

export function isSeriesVisuallyStarted(state: SeriesPlaybackState): boolean {
  if (state.controlled) return state.controlledStarted;
  return state.started || (state.auto && !state.finished);
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

import type { MapResult, MapVetoStep, RoundScore, SeriesResult } from './types';

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

export interface DecidedMap {
  mapId: MapVetoStep['mapId'];
  action: Exclude<MapVetoStep['action'], 'ban'>;
  teamId: string | null;
  result: MapResult | null;
}

/** Only the maps that will actually be played (picks and decider), in veto order; bans are never shown. */
export function getDecidedMaps(series: Pick<SeriesResult, 'maps' | 'veto'>): DecidedMap[] {
  const decidedSteps = (series.veto ?? []).filter(
    (step): step is MapVetoStep & { action: Exclude<MapVetoStep['action'], 'ban'> } => step.action !== 'ban'
  );
  if (decidedSteps.length === 0) {
    return series.maps.filter((result) => result.mapId).map((result) => ({ mapId: result.mapId!, action: 'decider', teamId: null, result }));
  }
  return decidedSteps.map((step) => ({
    mapId: step.mapId,
    action: step.action,
    teamId: step.teamId,
    result: series.maps.find((map) => map.mapId === step.mapId) ?? null
  }));
}

/** Feed delays under this play the kills at once, so the round has no in-progress phase. */
export const INSTANT_FEED_DELAY = 400;

export interface RoundCommitState {
  /** Milliseconds per round of the kill feed. */
  delay: number;
  /** The whole series is over (nothing may stay pending on screen). */
  finished: boolean;
  /** The revealed round is the last one of the map. */
  mapFinished: boolean;
}

/** Whether the round just revealed must be committed on the spot instead of being played by the kill feed first. */
export function shouldCommitInstantly(state: RoundCommitState): boolean {
  return state.delay < INSTANT_FEED_DELAY || state.finished || state.mapFinished;
}

/**
 * Rounds whose result may be shown (score, strip tick, ending line).
 * The last revealed round stays "in progress" until its kill feed resolved it, unless there is no feed to play or the
 * commit is instant. A previous round that never resolved commits as soon as the next one is revealed.
 */
export function getCommittedRounds(visibleRounds: number, resolvedRound: number, hasFeed: boolean, instant: boolean): number {
  if (visibleRounds <= 0) return 0;
  if (instant || !hasFeed) return visibleRounds;
  return resolvedRound >= visibleRounds ? visibleRounds : visibleRounds - 1;
}

/** Which round detail should flash on screen: the last committed one, and only while it is the latest revealed round or the next one is still being played. */
export function getFlashRound(visibleRounds: number, committedRounds: number): number | null {
  if (committedRounds <= 0) return null;
  if (visibleRounds - committedRounds > 1) return null;
  return committedRounds;
}

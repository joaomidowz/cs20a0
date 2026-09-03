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

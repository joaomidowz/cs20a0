import { isMajorStage, type GamePhase, type MajorStage, type SeriesResult } from './types';

/** Finds the first campaign series not confirmed yet. Confirmation ids remain stable across a reconstructed run. */
export function currentUserSeries(matches: SeriesResult[], confirmedSeriesIds: string[]): SeriesResult | null {
  const confirmed = new Set(confirmedSeriesIds);
  return matches.find((match) => !confirmed.has(match.id)) ?? null;
}

export function stageRecord(matches: SeriesResult[], stage: MajorStage, confirmedSeriesIds: string[], userTeamId: string) {
  const confirmed = new Set(confirmedSeriesIds);
  return matches.reduce((record, match) => {
    if (match.phase !== stage || !confirmed.has(match.id) || !match.winnerId) return record;
    if (match.winnerId === userTeamId) record.wins += 1;
    else record.losses += 1;
    return record;
  }, { wins: 0, losses: 0 });
}

/** Derives the persisted cursor only after the engine advanced. Result is reserved for a genuinely finished campaign. */
export function advanceCursor(matches: SeriesResult[], confirmedSeriesIds: string[], finished: boolean): { completedSeries: number; phase: GamePhase } {
  const current = currentUserSeries(matches, confirmedSeriesIds);
  const completedSeries = current ? matches.findIndex((match) => match.id === current.id) : matches.length;
  if (finished) return { completedSeries, phase: 'result' };
  return { completedSeries, phase: current && isMajorStage(current.phase) ? 'stage3' : 'playoffs' };
}

import type { MajorStage } from '../types';

export interface SwissRecord {
  wins: number;
  losses: number;
}

export interface DynastySwissContext {
  stage: MajorStage;
  roundNumber: number;
  left: SwissRecord;
  right: SwissRecord;
}

/** Cologne 2026: early stages use MD1 except advancement/elimination matches; Stage 3 is entirely MD3. */
export function dynastySwissBestOf({ stage, left, right }: DynastySwissContext): 1 | 3 {
  if (stage === 'stage3') return 3;
  return [left, right].some((standing) => standing.wins === 2 || standing.losses === 2) ? 3 : 1;
}

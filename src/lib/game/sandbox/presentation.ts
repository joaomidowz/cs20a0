import { getDecidedMaps, type DecidedMap } from '../seriesPresentation';
import type { SeriesResult } from '../types';
import type { SandboxBuy, SandboxRoundEnding, SandboxSide, SandboxWeapon } from './rounds';
import type { SandboxMajorMatch, SandboxMajorState } from './types';

export type SandboxDecidedMap = DecidedMap;

export const getSandboxDecidedMaps = (match: SandboxMajorMatch): SandboxDecidedMap[] => getDecidedMaps(match);

export const SANDBOX_PHASES: SeriesResult['phase'][] = ['stage3', 'quarterfinal', 'semifinal', 'final'];

export const SANDBOX_PHASE_LABELS: Record<SeriesResult['phase'], string> = {
  stage3: 'STAGE 3',
  quarterfinal: 'QUARTAS DE FINAL',
  semifinal: 'SEMIFINAIS',
  final: 'GRANDE FINAL'
};

export const SANDBOX_BUY_LABELS: Record<SandboxBuy, string> = {
  pistol: 'PISTOL',
  eco: 'ECO',
  force: 'FORÇADO',
  full: 'FULL BUY'
};

export const SANDBOX_SIDE_LABELS: Record<SandboxSide, string> = { ct: 'CT', t: 'TR' };

export const SANDBOX_ENDING_LABELS: Record<SandboxRoundEnding, string> = {
  elimination: 'Eliminação',
  bomb: 'Bomba explodiu',
  defuse: 'Bomba desarmada',
  time: 'Tempo esgotado'
};

export const SANDBOX_WEAPON_LABELS: Record<SandboxWeapon, string> = {
  ak47: 'AK-47', m4a1: 'M4A1-S', awp: 'AWP', usp: 'USP-S', glock: 'Glock-18', deagle: 'Desert Eagle',
  famas: 'FAMAS', galil: 'Galil AR', mac10: 'MAC-10', mp9: 'MP9', fiveseven: 'Five-SeveN', p250: 'P250',
  tec9: 'Tec-9', knife: 'Faca'
};

export type SandboxMatchStatus = 'completed' | 'live' | 'pending';

export interface SandboxPhaseOverview {
  phase: SeriesResult['phase'];
  label: string;
  status: 'completed' | 'active' | 'upcoming';
  matches: Array<{ match: SandboxMajorMatch; status: SandboxMatchStatus }>;
}

/** Resolves a team name from the tournament (user team first, then any team that played). */
export function getSandboxTeamName(state: SandboxMajorState, teamId: string | null | undefined): string {
  if (!teamId) return '—';
  if (teamId === state.userTeam.id) return state.userTeam.name;
  for (const match of state.matches) {
    if (match.teamA.id === teamId) return match.teamA.name;
    if (match.teamB.id === teamId) return match.teamB.name;
  }
  return state.standings.find((standing) => standing.organizationId === teamId)?.name ?? teamId;
}

export function getSandboxMatchStatus(state: SandboxMajorState, match: SandboxMajorMatch): SandboxMatchStatus {
  if (match.resolved) return 'completed';
  if (!state.finished && state.matches[state.currentMatchIndex]?.id === match.id) return 'live';
  return 'pending';
}

/** Groups every match by phase without leaking results of matches that were not resolved yet. */
export function getSandboxPhaseOverview(state: SandboxMajorState): SandboxPhaseOverview[] {
  const currentPhase = state.finished ? null : state.matches[state.currentMatchIndex]?.phase ?? null;
  const currentPhaseIndex = currentPhase ? SANDBOX_PHASES.indexOf(currentPhase) : SANDBOX_PHASES.length;
  return SANDBOX_PHASES
    .map((phase, index) => ({
      phase,
      label: SANDBOX_PHASE_LABELS[phase],
      status: (index < currentPhaseIndex ? 'completed' : index === currentPhaseIndex ? 'active' : 'upcoming') as SandboxPhaseOverview['status'],
      matches: state.matches.filter((match) => match.phase === phase).map((match) => ({ match, status: getSandboxMatchStatus(state, match) }))
    }))
    .filter((group) => group.matches.length > 0);
}

export interface SandboxCampaignSummary {
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  eliminated: boolean;
  champion: boolean;
  lastPhase: SeriesResult['phase'] | null;
  placement: string;
}

export function getSandboxCampaignSummary(state: SandboxMajorState): SandboxCampaignSummary {
  const userId = state.userTeam.id;
  const played = state.matches.filter((match) => match.userMatch && match.resolved);
  const summary: SandboxCampaignSummary = {
    wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, roundsWon: 0, roundsLost: 0,
    eliminated: false, champion: state.championId === userId, lastPhase: null, placement: '—'
  };
  for (const match of played) {
    const mine = match.teamA.id === userId;
    if (match.winnerId === userId) summary.wins += 1; else summary.losses += 1;
    summary.mapsWon += mine ? match.scoreA : match.scoreB;
    summary.mapsLost += mine ? match.scoreB : match.scoreA;
    for (const map of match.maps) {
      summary.roundsWon += mine ? map.scoreA : map.scoreB;
      summary.roundsLost += mine ? map.scoreB : map.scoreA;
    }
    summary.lastPhase = match.phase;
  }
  const last = played.at(-1);
  summary.eliminated = Boolean(last && last.winnerId !== userId);
  if (summary.champion) summary.placement = 'Campeão';
  else if (summary.lastPhase === 'final') summary.placement = 'Vice-campeão';
  else if (summary.lastPhase === 'semifinal') summary.placement = 'Top 4';
  else if (summary.lastPhase === 'quarterfinal') summary.placement = 'Top 8';
  else if (summary.eliminated) summary.placement = 'Eliminado no Stage 3';
  else if (played.length) summary.placement = 'Em disputa';
  return summary;
}

/** Position (1-based) of the current user match among all user matches, plus the total that exist in the bracket so far. */
export function getSandboxUserProgress(state: SandboxMajorState): { played: number; current: number | null } {
  const userMatches = state.matches.filter((match) => match.userMatch);
  const played = userMatches.filter((match) => match.resolved).length;
  const current = state.matches[state.currentMatchIndex];
  return { played, current: current?.userMatch && !state.finished ? played + 1 : null };
}

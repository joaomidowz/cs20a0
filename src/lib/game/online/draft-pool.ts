import { pickRandomTeam, type SeededRng } from '../simulation';
import type { HistoricalTeam, Player } from '../types';
import type { OnlineGameMode } from './contracts';

export const FUN_MINIMUM_AVERAGE = 82;
export const MAX_FUN_HIGH_MINIMUM_AVERAGE = 90;
export const MAX_FUN_LOW_MAXIMUM_AVERAGE = 80;

export type MaxFunGroup = 'high' | 'low';

export class DraftPoolExhaustedError extends Error {
  constructor() {
    super('No draft team is available for this mode');
    this.name = 'DraftPoolExhaustedError';
  }
}

const historicalTeamOverallFromLookup = (team: HistoricalTeam, playerById: Map<string, Player>): number | null => {
  const playerIds = team.players ?? [];
  if (playerIds.length !== 5 || new Set(playerIds).size !== 5) return null;
  const roster = playerIds.map((playerId) => playerById.get(playerId));
  if (roster.some((player) => !player || !Number.isFinite(player.overall))) return null;
  return roster.reduce((sum, player) => sum + Number(player?.overall), 0) / 5;
};

export function getHistoricalTeamOverall(team: HistoricalTeam, players: Player[]): number | null {
  return historicalTeamOverallFromLookup(team, new Map(players.map((player) => [player.id, player])));
}

export function getEligibleDraftTeams(
  mode: OnlineGameMode,
  teams: HistoricalTeam[],
  players: Player[]
): HistoricalTeam[] {
  if (mode !== 'fun' && mode !== 'max_fun') return teams;
  const playerById = new Map(players.map((player) => [player.id, player]));
  return teams.filter((team) => {
    const average = historicalTeamOverallFromLookup(team, playerById);
    if (average === null) return false;
    if (mode === 'fun') return average >= FUN_MINIMUM_AVERAGE;
    return average >= MAX_FUN_HIGH_MINIMUM_AVERAGE || average <= MAX_FUN_LOW_MAXIMUM_AVERAGE;
  });
}

export function pickDraftTeam(
  mode: OnlineGameMode,
  teams: HistoricalTeam[],
  players: Player[],
  rng: SeededRng,
  excludedIds: string[] = []
): HistoricalTeam {
  if (mode !== 'max_fun') {
    const team = pickRandomTeam(getEligibleDraftTeams(mode, teams, players), rng, excludedIds);
    if (!team) throw new DraftPoolExhaustedError();
    return team;
  }

  const available = getEligibleDraftTeams(mode, teams, players)
    .filter((team) => !excludedIds.includes(team.id));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const grouped = available.reduce<Record<MaxFunGroup, HistoricalTeam[]>>((groups, team) => {
    const average = historicalTeamOverallFromLookup(team, playerById);
    groups[average !== null && average >= MAX_FUN_HIGH_MINIMUM_AVERAGE ? 'high' : 'low'].push(team);
    return groups;
  }, { high: [], low: [] });
  const preferredGroup: MaxFunGroup = rng() < 0.5 ? 'high' : 'low';
  const fallbackGroup: MaxFunGroup = preferredGroup === 'high' ? 'low' : 'high';
  const team = pickRandomTeam(grouped[preferredGroup], rng) ?? pickRandomTeam(grouped[fallbackGroup], rng);
  if (!team) throw new DraftPoolExhaustedError();
  return team;
}

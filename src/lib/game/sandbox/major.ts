import { completeStrategicSeries, type StrategicSeriesBook } from '../strategic-series';
import { playerById, players, teams } from '../data';
import { createBotMapStrategy, createUserMapStrategy, resolveMapVeto } from '../map-veto';
import { runOnlineTournament, type TournamentOrganization } from '../online/tournament';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import type { MapId } from '../types';
import { buildSandboxCombatTeam } from './lineup';
import { roundEventsToSandboxDetails } from './rounds';
import type { SandboxLineupSelection, SandboxMajorMatch, SandboxMajorState } from './types';

const USER_TEAM_ID = 'sandbox-user';

const shuffledOpponents = (selection: SandboxLineupSelection, seed: string): TournamentOrganization[] => {
  const rng = createSeededRng(`${seed}:sandbox-opponents`);
  const candidates = teams.filter((team) => team.id !== selection.organizationId).map((team) => ({
    id: team.id,
    name: `${team.name ?? 'Time'} ${team.year ?? ''}`.trim(),
    seed: 0,
    team: calculateHistoricalTeamPower(team, players),
    human: false,
    sourceTeamId: team.id
  }));
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
  }
  return candidates.slice(0, 15);
};

const skipBotMatches = (state: SandboxMajorState, fromIndex: number): SandboxMajorState => {
  const matches = state.matches.map((match) => ({ ...match }));
  let index = fromIndex;
  while (index < matches.length && !matches[index].userMatch) {
    matches[index] = { ...matches[index], resolved: true };
    index += 1;
  }
  return { ...state, matches, currentMatchIndex: index, finished: index >= matches.length };
};

export function createSandboxMajor(selection: SandboxLineupSelection, rawSeed: string, live: StrategicSeriesBook = {}): SandboxMajorState {
  const seed = rawSeed.trim() || 'sandbox';
  const userTeam = buildSandboxCombatTeam(selection);
  const userOrganization: TournamentOrganization = {
    id: USER_TEAM_ID, name: userTeam.name, seed: 1, team: userTeam, human: true, sourceTeamId: selection.organizationId
  };
  const opponents = shuffledOpponents(selection, seed);
  const selectedPlayers = selection.players.map(selected => playerById.get(selected.playerId)).filter(player => player !== undefined);
  const strategies = new Map(teams.map(team => [team.id, createBotMapStrategy(team)]));
  strategies.set(USER_TEAM_ID, createUserMapStrategy(USER_TEAM_ID, selection.mapPreferences as [MapId, MapId, MapId], selectedPlayers, teams));
  const tournament = runOnlineTournament({
    organizations: [userOrganization], botPool: opponents, entryStage: 'stage3', seed: `${seed}:sandbox-major`,
    mapContext: { mode: 'premier', seed: `${seed}:sandbox-maps`, strategies }, live, swissBestOf: 3
  });
  const matches: SandboxMajorMatch[] = tournament.rounds.flatMap(round => round.series.map(match => ({
    ...match, maps: match.maps.map(map => ({ ...map, details: roundEventsToSandboxDetails(map.events ?? []) })),
    roundNumber: round.number, userMatch: match.teamA.id === USER_TEAM_ID || match.teamB.id === USER_TEAM_ID, resolved: Boolean(match.winnerId)
  })));
  return skipBotMatches({
    seed,
    strategicSeries: live,
    selection: { ...selection, players: selection.players.map((player) => ({ ...player })), mapPreferences: [...selection.mapPreferences] },
    userTeam,
    matches,
    standings: tournament.standings.map((standing) => ({ ...standing })),
    tournament: {
      rounds: tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map((series) => matches.find((match) => match.id === series.id) ?? series) })),
      standings: tournament.standings.map((standing) => ({ ...standing })),
      championId: tournament.championId
    },
    championId: tournament.championId,
    currentMatchIndex: 0,
    finished: matches.length === 0
  }, matches.some(match => match.userMatch && !match.resolved) ? matches.findIndex(match => match.userMatch && !match.resolved) : matches.length);
}

export function advanceSandboxMajor(state: SandboxMajorState): SandboxMajorState {
  if (state.finished) return state;
  const current = state.matches[state.currentMatchIndex];
  if (state.strategicSeries?.[current.id]) {
    const live = { ...state.strategicSeries, [current.id]: completeStrategicSeries(state.strategicSeries[current.id]) };
    return createSandboxMajor(state.selection, state.seed, live);
  }
  const matches = state.matches.map((match, index) => index === state.currentMatchIndex ? { ...match, resolved: true } : { ...match });
  return skipBotMatches({ ...state, matches }, state.currentMatchIndex + 1);
}

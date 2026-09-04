import { getTeamPlayers, playerById, players, teams } from '../data';
import { createBotMapStrategy, createUserMapStrategy, resolveMapVeto } from '../map-veto';
import { runOnlineTournament, type TournamentOrganization } from '../online/tournament';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import type { LineupSlotRole, MapId } from '../types';
import { buildSandboxCombatTeam } from './lineup';
import { buildSandboxRoundDetails, type SandboxRoster } from './rounds';
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

export function createSandboxMajor(selection: SandboxLineupSelection, rawSeed: string): SandboxMajorState {
  const seed = rawSeed.trim() || 'sandbox';
  const userTeam = buildSandboxCombatTeam(selection);
  const userOrganization: TournamentOrganization = {
    id: USER_TEAM_ID, name: userTeam.name, seed: 1, team: userTeam, human: true, sourceTeamId: selection.organizationId
  };
  const opponents = shuffledOpponents(selection, seed);
  const tournament = runOnlineTournament({
    organizations: [userOrganization], botPool: opponents, entryStage: 'stage3', seed: `${seed}:sandbox-major`
  });
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const selectedPlayers = selection.players.map((selected) => playerById.get(selected.playerId)).filter((player) => player !== undefined);
  const userRoles = new Map<string, LineupSlotRole>(selection.players.map((selected) => [selected.playerId, selected.selectedSlotRole]));
  const rosterFor = (teamId: string): SandboxRoster => teamId === USER_TEAM_ID
    ? { players: selectedPlayers, roles: userRoles }
    : { players: getTeamPlayers(teamById.get(teamId) ?? null) };
  const userStrategy = createUserMapStrategy(USER_TEAM_ID, selection.mapPreferences as [MapId, MapId, MapId], selectedPlayers, teams);
  const matches: SandboxMajorMatch[] = tournament.rounds.flatMap((round) => round.series.map((match) => {
    const strategyFor = (teamId: string) => {
      if (teamId === USER_TEAM_ID) return userStrategy;
      const historicalTeam = teamById.get(teamId);
      if (!historicalTeam) throw new Error(`Unknown Sandbox team: ${teamId}`);
      return createBotMapStrategy(historicalTeam);
    };
    const veto = resolveMapVeto({ bestOf: match.bestOf, teamA: strategyFor(match.teamA.id), teamB: strategyFor(match.teamB.id), seed: `${seed}:${match.id}:veto` });
    return {
      ...match,
      maps: match.maps.map((map, index) => ({
        ...map,
        mapId: veto.playedMaps[index],
        details: buildSandboxRoundDetails(map, rosterFor(match.teamA.id), rosterFor(match.teamB.id), `${seed}:${match.id}:m${index}:rounds`)
      })),
      veto: veto.steps,
      roundNumber: round.number,
      userMatch: match.teamA.id === USER_TEAM_ID || match.teamB.id === USER_TEAM_ID,
      resolved: false
    };
  }));
  return skipBotMatches({
    seed,
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
  }, 0);
}

export function advanceSandboxMajor(state: SandboxMajorState): SandboxMajorState {
  if (state.finished) return state;
  const matches = state.matches.map((match, index) => index === state.currentMatchIndex ? { ...match, resolved: true } : { ...match });
  return skipBotMatches({ ...state, matches }, state.currentMatchIndex + 1);
}

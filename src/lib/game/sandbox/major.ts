import { players, teams } from '../data';
import { createBotMapStrategy, createUserMapStrategy, resolveMapVeto } from '../map-veto';
import { getDefaultMapSelection } from '../maps';
import { runOnlineTournament, type TournamentOrganization } from '../online/tournament';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import { buildSandboxCombatTeam } from './lineup';
import type { SandboxLineupSelection, SandboxMajorMatch, SandboxMajorPhase, SandboxMajorState } from './types';

const USER_TEAM_ID = 'sandbox-a';
const TOURNAMENT_SIZE = 16;

const normalizedSeed = (seed: string) => seed.trim() || 'sandbox';

const shuffledHistoricalOrganizations = (selection: SandboxLineupSelection, seed: string): TournamentOrganization[] => {
  const rng = createSeededRng(`${seed}:sandbox-opponents`);
  const candidates = teams
    .filter((team) => team.id !== selection.organizationId)
    .filter((team) => (team.players ?? []).filter((playerId) => players.some((player) => player.id === playerId)).length >= 5)
    .map((team) => ({
      id: team.id,
      name: `${team.name ?? 'Time'} ${team.year ?? ''}`.trim(),
      seed: 0,
      team: calculateHistoricalTeamPower(team, players),
      human: false,
      sourceTeamId: team.id
    }));

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  return candidates.slice(0, TOURNAMENT_SIZE - 1);
};

const getPhase = (matches: SandboxMajorMatch[], index: number, finished: boolean): SandboxMajorPhase =>
  finished ? 'finished' : matches[index]?.phase ?? 'finished';

const resolveUntilUserMatch = (state: SandboxMajorState, fromIndex: number): SandboxMajorState => {
  const matches = state.matches.map((match) => ({ ...match }));
  let index = fromIndex;
  while (index < matches.length && !matches[index].replayable) {
    matches[index] = { ...matches[index], resolved: true };
    index += 1;
  }
  const finished = index >= matches.length;
  return {
    ...state,
    matches,
    currentMatchIndex: index,
    phase: getPhase(matches, index, finished),
    finished
  };
};

export function createSandboxMajor(selection: SandboxLineupSelection, seed: string): SandboxMajorState {
  const effectiveSeed = normalizedSeed(seed);
  const userTeam = buildSandboxCombatTeam(selection, 'A');
  const userOrganization: TournamentOrganization = {
    id: USER_TEAM_ID,
    name: userTeam.name,
    seed: 1,
    team: userTeam,
    human: true,
    sourceTeamId: selection.organizationId
  };
  const botPool = shuffledHistoricalOrganizations(selection, effectiveSeed);
  const seededBot = botPool[0];
  if (!seededBot) throw new Error('Not enough historical teams to create the Sandbox Major');
  const tournament = runOnlineTournament({
    organizations: [userOrganization, seededBot],
    botPool: botPool.slice(1),
    entryStage: 'stage3',
    seed: `${effectiveSeed}:sandbox-major`
  });
  const historicalTeamById = new Map(teams.map((team) => [team.id, team]));
  const selectedPlayers = selection.players
    .map((selected) => players.find((player) => player.id === selected.playerId))
    .filter((player) => player !== undefined);
  const userMapStrategy = createUserMapStrategy(
    USER_TEAM_ID,
    getDefaultMapSelection(selectedPlayers, teams),
    selectedPlayers,
    teams
  );
  const matches: SandboxMajorMatch[] = tournament.rounds.flatMap((round) =>
    round.series.map((match) => {
      const strategyFor = (teamId: string) => {
        if (teamId === USER_TEAM_ID) return userMapStrategy;
        const historicalTeam = historicalTeamById.get(teamId);
        if (!historicalTeam) throw new Error(`Unknown Sandbox historical team: ${teamId}`);
        return createBotMapStrategy(historicalTeam);
      };
      const veto = resolveMapVeto({
        bestOf: match.bestOf,
        teamA: strategyFor(match.teamA.id),
        teamB: strategyFor(match.teamB.id),
        seed: `${effectiveSeed}:sandbox:${match.id}:veto`
      });
      return {
        ...match,
        maps: match.maps.map((map, index) => ({ ...map, mapId: veto.playedMaps[index] })),
        veto: veto.steps,
        roundNumber: round.number,
        replayable: match.teamA.id === USER_TEAM_ID || match.teamB.id === USER_TEAM_ID,
        resolved: false
      };
    })
  );
  const initial: SandboxMajorState = {
    seed: effectiveSeed,
    selection: {
      ...selection,
      players: selection.players.map((selected) => ({ ...selected }))
    },
    userTeam,
    matches,
    standings: tournament.standings.map((standing) => ({ ...standing })),
    championId: tournament.championId,
    currentMatchIndex: 0,
    phase: matches[0]?.phase ?? 'finished',
    finished: matches.length === 0
  };
  return resolveUntilUserMatch(initial, 0);
}

export function advanceSandboxMajor(state: SandboxMajorState): SandboxMajorState {
  if (state.finished) return state;
  const matches = state.matches.map((match, index) =>
    index === state.currentMatchIndex ? { ...match, resolved: true } : { ...match }
  );
  return resolveUntilUserMatch({ ...state, matches }, state.currentMatchIndex + 1);
}

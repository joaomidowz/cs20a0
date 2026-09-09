import { getTeamPlayers, playerById, players, teams } from '../data';
import { createBotMapStrategy, createUserMapStrategy, type MapSimulationContext } from '../map-veto';
import {
  applySeriesDecision,
  autoDecide,
  pendingSeriesDecision,
  requestSeriesTimeout,
  runSeriesToEnd,
  seriesLossStreak,
  seriesSideA,
  seriesTimeouts,
  stepSeries,
  toSeriesResult,
  type LiveSeriesState,
  type PendingSeriesDecision,
  type SeriesDecisionInput
} from '../online/live-series';
import { runOnlineTournament, type TournamentOrganization } from '../online/tournament';
import {
  canStartNextRound,
  completeRound,
  createTournamentEngine,
  currentRound,
  isRoundComplete,
  startNextRound,
  toResult,
  type TournamentEngineState
} from '../online/tournament-engine';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import type { LineupSlotRole, MapId, MapSide, Roster, SeriesResult } from '../types';
import { buildSandboxCombatTeam } from './lineup';
import type { SandboxLineupSelection, SandboxMajorMatch, SandboxMajorState } from './types';

const USER_TEAM_ID = 'sandbox-user';

export interface SandboxMajorOptions {
  /** When true the user's series wait for their veto, side, eco call and timeout decisions. */
  interactive?: boolean;
}

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

const toSandboxMatch = (match: SeriesResult, roundNumber: number, resolved: boolean): SandboxMajorMatch => ({
  ...match,
  maps: match.maps.map((map) => ({ ...map, details: map.details ?? [] })),
  roundNumber,
  userMatch: match.teamA.id === USER_TEAM_ID || match.teamB.id === USER_TEAM_ID,
  resolved
});

function buildMapContext(selection: SandboxLineupSelection, seed: string, opponents: TournamentOrganization[]): MapSimulationContext {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const selectedPlayers = selection.players.map((selected) => playerById.get(selected.playerId)).filter((player) => player !== undefined);
  const userRoles = new Map<string, LineupSlotRole>(selection.players.map((selected) => [selected.playerId, selected.selectedSlotRole]));
  const rosters = new Map<string, Roster>();
  rosters.set(USER_TEAM_ID, { players: selectedPlayers, roles: userRoles });
  const strategies: MapSimulationContext['strategies'] = new Map();
  strategies.set(USER_TEAM_ID, createUserMapStrategy(USER_TEAM_ID, selection.mapPreferences as [MapId, MapId, MapId], selectedPlayers, teams));
  for (const opponent of opponents) {
    const historicalTeam = teamById.get(opponent.id);
    if (!historicalTeam) throw new Error(`Unknown Sandbox team: ${opponent.id}`);
    strategies.set(opponent.id, createBotMapStrategy(historicalTeam));
    rosters.set(opponent.id, { players: getTeamPlayers(historicalTeam) });
  }
  // The veto and map bonuses are part of the simulation here, exactly like the online and solo Majors.
  return { mode: 'premier', seed: `${seed}:sandbox-maps`, strategies, rosters };
}

export function createSandboxMajor(selection: SandboxLineupSelection, rawSeed: string, options: SandboxMajorOptions = {}): SandboxMajorState {
  const seed = rawSeed.trim() || 'sandbox';
  const userTeam = buildSandboxCombatTeam(selection);
  const userOrganization: TournamentOrganization = {
    id: USER_TEAM_ID, name: userTeam.name, seed: 1, team: userTeam, human: true, sourceTeamId: selection.organizationId
  };
  const opponents = shuffledOpponents(selection, seed);
  const mapContext = buildMapContext(selection, seed, opponents);
  const base = {
    seed,
    selection: { ...selection, players: selection.players.map((player) => ({ ...player })), mapPreferences: [...selection.mapPreferences] },
    userTeam,
    confirmedSeriesIds: [] as string[]
  };

  if (options.interactive) {
    const engine = createTournamentEngine({
      organizations: [userOrganization],
      botPool: opponents,
      entryStage: 'stage3',
      seed: `${seed}:sandbox-major`,
      mapContext,
      swissBestOf: 3,
      controllerFor: (organization) => organization.human ? 'human' : 'bot',
      // Unlike the online mode, the Sandbox user vetoes against bots too: that is the point of the interactive toggle.
      interactiveVeto: (left, right) => left.human || right.human
    });
    return settle({ ...base, interactive: true, engine, matches: [], standings: [], tournament: { rounds: [], standings: [], championId: null }, championId: null, currentMatchIndex: 0, finished: false });
  }

  const tournament = runOnlineTournament({
    organizations: [userOrganization], botPool: opponents, entryStage: 'stage3', seed: `${seed}:sandbox-major`, mapContext
  });
  const matches: SandboxMajorMatch[] = tournament.rounds.flatMap((round) => round.series.map((match) => toSandboxMatch(match, round.number, false)));
  return skipBotMatches({
    ...base,
    interactive: false,
    engine: null,
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

const userSeriesOf = (engine: TournamentEngineState): LiveSeriesState | null => {
  const round = currentRound(engine);
  return round?.series.find((series) => series.config.teamA.id === USER_TEAM_ID || series.config.teamB.id === USER_TEAM_ID) ?? null;
};

/** The user's series still running in an interactive Sandbox, or null. */
export function currentSandboxSeries(state: SandboxMajorState): LiveSeriesState | null {
  if (!state.engine) return null;
  const series = userSeriesOf(state.engine);
  return series && !state.confirmedSeriesIds.includes(series.config.id) ? series : null;
}

/**
 * Interactive mode bookkeeping: starts the next round when needed, plays every bot-only series to the end, rounds
 * without the user run through, and rebuilds the presentation state from the engine.
 */
function settle(state: SandboxMajorState): SandboxMajorState {
  const engine = state.engine!;
  for (;;) {
    if (engine.finished) break;
    if (canStartNextRound(engine)) startNextRound(engine);
    const round = currentRound(engine)!;
    for (const series of round.series) {
      const involvesUser = series.config.teamA.id === USER_TEAM_ID || series.config.teamB.id === USER_TEAM_ID;
      if (!involvesUser) runSeriesToEnd(series);
    }
    const user = userSeriesOf(engine);
    if (user && !state.confirmedSeriesIds.includes(user.config.id)) break;
    if (isRoundComplete(round)) completeRound(engine);
    else break;
  }
  return syncFromEngine(state);
}

function syncFromEngine(state: SandboxMajorState): SandboxMajorState {
  const engine = state.engine!;
  const result = toResult(engine);
  const live = currentSandboxSeries(state);
  const matches = result.rounds.flatMap((round) => round.series.map((match) => {
    const isUser = match.teamA.id === USER_TEAM_ID || match.teamB.id === USER_TEAM_ID;
    const resolved = Boolean(match.winnerId) && (!isUser || state.confirmedSeriesIds.includes(match.id));
    return toSandboxMatch(match, round.number, resolved);
  }));
  const currentMatchIndex = live ? matches.findIndex((match) => match.id === live.config.id) : matches.length;
  return {
    ...state,
    matches,
    standings: result.standings.map((standing) => ({ ...standing })),
    tournament: {
      rounds: result.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map((series) => matches.find((match) => match.id === series.id) ?? series) })),
      standings: result.standings.map((standing) => ({ ...standing })),
      championId: result.championId
    },
    championId: result.championId,
    currentMatchIndex: Math.max(0, currentMatchIndex),
    finished: engine.finished && live === null
  };
}

export function advanceSandboxMajor(state: SandboxMajorState): SandboxMajorState {
  if (state.finished) return state;
  if (!state.engine) {
    const matches = state.matches.map((match, index) => index === state.currentMatchIndex ? { ...match, resolved: true } : { ...match });
    return skipBotMatches({ ...state, matches }, state.currentMatchIndex + 1);
  }
  const live = currentSandboxSeries(state);
  if (live && live.phase !== 'finished') return state;
  const confirmedSeriesIds = live ? [...state.confirmedSeriesIds, live.config.id] : state.confirmedSeriesIds;
  return settle({ ...state, confirmedSeriesIds });
}

export function pendingSandboxDecision(state: SandboxMajorState): PendingSeriesDecision | null {
  const live = currentSandboxSeries(state);
  return live ? pendingSeriesDecision(live) : null;
}

export function applySandboxDecision(state: SandboxMajorState, decision: SeriesDecisionInput): SandboxMajorState {
  const live = currentSandboxSeries(state);
  if (!live) return state;
  applySeriesDecision(live, decision);
  return syncFromEngine(state);
}

export const applySandboxSide = (state: SandboxMajorState, side: MapSide) => applySandboxDecision(state, { kind: 'side', teamId: USER_TEAM_ID, side });
export const applySandboxEcoCall = (state: SandboxMajorState, call: 'force' | 'eco') => applySandboxDecision(state, { kind: 'eco-call', teamId: USER_TEAM_ID, call });
export const applySandboxVeto = (state: SandboxMajorState, action: 'ban' | 'pick', mapId: MapId) => applySandboxDecision(state, { kind: 'veto', teamId: USER_TEAM_ID, action, mapId });

/** One step of the user's live series (a round, a map start or a map end). No-op while a decision is pending. */
export function stepSandboxSeries(state: SandboxMajorState): SandboxMajorState {
  const live = currentSandboxSeries(state);
  if (!live || live.phase === 'finished' || pendingSeriesDecision(live)) return state;
  stepSeries(live);
  return syncFromEngine(state);
}

/** Finishes the current map of the user's live series with the bot policies for any decision still pending. */
export function skipSandboxMap(state: SandboxMajorState): SandboxMajorState {
  const live = currentSandboxSeries(state);
  if (!live || live.phase === 'finished') return state;
  // Rounds keep coming until the map ends ('map-complete' / 'finished') or the user has to decide something.
  for (;;) {
    if (pendingSeriesDecision(live)) break;
    if (stepSeries(live) !== 'round') break;
  }
  return syncFromEngine(state);
}

/** Resolves the decision waiting on the user with the same policy a bot would use. */
export function autoDecideSandbox(state: SandboxMajorState): SandboxMajorState {
  const live = currentSandboxSeries(state);
  if (!live || !pendingSeriesDecision(live)) return state;
  autoDecide(live);
  return syncFromEngine(state);
}

export function callSandboxTimeout(state: SandboxMajorState): SandboxMajorState {
  const live = currentSandboxSeries(state);
  if (!live) return state;
  requestSeriesTimeout(live, USER_TEAM_ID);
  return syncFromEngine(state);
}

export interface SandboxLiveView {
  seriesId: string;
  phase: LiveSeriesState['phase'];
  activeMap: number;
  visibleRounds: number;
  started: boolean;
  finished: boolean;
  timeoutsLeft: number;
  /** Rounds the user has lost in a row in the live map. */
  lossStreak: number;
  userSide: MapSide | null;
  veto: { available: MapId[]; steps: NonNullable<SeriesResult['veto']>; turnTeamId: string | null; action: 'ban' | 'pick' | null } | null;
}

/** What the viewer needs to render the user's live series in interactive mode. */
export function getSandboxLiveView(state: SandboxMajorState): SandboxLiveView | null {
  const live = currentSandboxSeries(state);
  if (!live) return null;
  const result = toSeriesResult(live);
  const pending = pendingSeriesDecision(live);
  const userIsA = live.config.teamA.id === USER_TEAM_ID;
  const timeouts = seriesTimeouts(live);
  const streaks = seriesLossStreak(live);
  const sideA = seriesSideA(live);
  return {
    seriesId: live.config.id,
    phase: live.phase,
    activeMap: live.current ? live.current.index : Math.max(0, result.maps.length - 1),
    visibleRounds: result.maps.at(-1)?.rounds.length ?? 0,
    started: result.maps.length > 0,
    finished: live.phase === 'finished',
    timeoutsLeft: userIsA ? timeouts.a : timeouts.b,
    lossStreak: userIsA ? streaks.a : streaks.b,
    userSide: sideA ? (userIsA ? sideA : sideA === 'ct' ? 't' : 'ct') : null,
    veto: live.veto
      ? { available: [...live.veto.available], steps: [...live.veto.steps], turnTeamId: pending?.kind === 'veto' ? pending.teamId : null, action: pending?.kind === 'veto' ? pending.action : null }
      : null
  };
}

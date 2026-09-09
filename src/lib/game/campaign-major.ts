import {
  adoptSeriesResult,
  applySeriesDecision,
  autoDecide,
  pendingSeriesDecision,
  requestSeriesTimeout,
  runSeriesToEnd,
  seriesLossStreak,
  seriesSideA,
  seriesTimeouts,
  stepSeries,
  type LiveSeriesState,
  type PendingSeriesDecision,
  type SeriesDecisionInput
} from './online/live-series';
import {
  canStartNextRound,
  completeRound,
  createTournamentEngine,
  currentRound,
  isRoundComplete,
  startNextRound,
  toResult,
  type TournamentEngineState
} from './online/tournament-engine';
import { createMajorField, orientSeriesToTeam, toMajorRun } from './simulation';
import type { GameMode, HistoricalTeam, MajorRun, MapId, MapSide, OrgStyle, Player, SelectedPlayer, SeriesResult } from './types';

/**
 * The campaign Major played round by round: the user's series stop for the veto, the side, the economy call and the
 * tactical pause, while every bot series resolves instantly. Same engine the online mode and the Sandbox run on.
 */
export interface CampaignMajorState {
  userTeamId: string;
  engine: TournamentEngineState;
  /** Series the user already confirmed, so the Major can move on. */
  confirmedSeriesIds: string[];
  /** Derived view the campaign screens read. */
  run: MajorRun;
  /** Series restored from a saved campaign, to tell a clean restore from an incompatible save. */
  restoredSeriesIds: string[];
  finished: boolean;
}

export interface CampaignLiveView {
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

export interface CampaignMajorOptions {
  selectedMaps?: MapId[];
  mode?: GameMode;
  /** Series already played in a saved campaign, restored instead of simulated again. */
  played?: Record<string, SeriesResult>;
}

export function createCampaignMajor(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[] = [],
  options: CampaignMajorOptions = {}
): CampaignMajorState {
  const { user, field, mapContext, tournamentSeed } = createMajorField(players, style, teams, allPlayers, seed, lineup, options);
  const engine = createTournamentEngine({
    organizations: [{ id: user.id, name: user.name, seed: 1, team: user, human: true }],
    botPool: field,
    entryStage: 'stage3',
    seed: tournamentSeed,
    mapContext,
    // 13a0: every offline series is BO3 except the BO5 final.
    swissBestOf: 3,
    controllerFor: (organization) => (organization.human ? 'human' : 'bot'),
    interactiveVeto: (left, right) => left.human || right.human
  });
  const played = options.played ?? {};
  const state: CampaignMajorState = {
    userTeamId: user.id,
    engine,
    confirmedSeriesIds: Object.keys(played),
    run: { stage3: { wins: 0, losses: 0, qualified: false, matches: [] }, matches: [], champion: false, placement: 'placementStage3' },
    restoredSeriesIds: [],
    finished: false
  };
  return settle(state, played);
}

const userSeriesOf = (state: CampaignMajorState): LiveSeriesState | null => {
  const round = currentRound(state.engine);
  return round?.series.find((series) => series.config.teamA.id === state.userTeamId || series.config.teamB.id === state.userTeamId) ?? null;
};

/** The user's series still waiting to be played or confirmed, or null. */
export function currentCampaignSeries(state: CampaignMajorState): LiveSeriesState | null {
  const series = userSeriesOf(state);
  return series && !state.confirmedSeriesIds.includes(series.config.id) ? series : null;
}

/**
 * Starts rounds as they are needed, resolves every series the user is not in, and restores the ones already played in a
 * saved campaign, then rebuilds the run the screens read.
 */
function settle(state: CampaignMajorState, played: Record<string, SeriesResult> = {}): CampaignMajorState {
  const { engine } = state;
  for (;;) {
    if (engine.finished) break;
    if (canStartNextRound(engine)) startNextRound(engine);
    const round = currentRound(engine)!;
    for (const series of round.series) {
      if (series.phase === 'finished') continue;
      const restored = played[series.config.id];
      if (restored) {
        // A saved run stores the series turned to the player, so it goes back to the order the engine uses.
        adoptSeriesResult(series, orientSeriesToTeam(restored, series.config.teamA.id));
        state.restoredSeriesIds = [...state.restoredSeriesIds, series.config.id];
      }
      else if (series.config.teamA.id !== state.userTeamId && series.config.teamB.id !== state.userTeamId) runSeriesToEnd(series);
    }
    const user = userSeriesOf(state);
    if (user && !state.confirmedSeriesIds.includes(user.config.id)) break;
    if (isRoundComplete(round)) completeRound(engine);
    else break;
  }
  return syncFromEngine(state);
}

function syncFromEngine(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  return {
    ...state,
    run: toMajorRun(toResult(state.engine), state.userTeamId),
    finished: state.engine.finished && live === null
  };
}

export function pendingCampaignDecision(state: CampaignMajorState): PendingSeriesDecision | null {
  const live = currentCampaignSeries(state);
  return live ? pendingSeriesDecision(live) : null;
}

export function applyCampaignDecision(state: CampaignMajorState, decision: SeriesDecisionInput): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (!live) return state;
  applySeriesDecision(live, decision);
  return syncFromEngine(state);
}

export const applyCampaignVeto = (state: CampaignMajorState, action: 'ban' | 'pick', mapId: MapId) =>
  applyCampaignDecision(state, { kind: 'veto', teamId: state.userTeamId, action, mapId });
export const applyCampaignSide = (state: CampaignMajorState, side: MapSide) =>
  applyCampaignDecision(state, { kind: 'side', teamId: state.userTeamId, side });
export const applyCampaignEcoCall = (state: CampaignMajorState, call: 'force' | 'eco') =>
  applyCampaignDecision(state, { kind: 'eco-call', teamId: state.userTeamId, call });

/** Resolves the decision waiting on the user with the same policy a bot would use. */
export function autoDecideCampaign(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (!live || !pendingSeriesDecision(live)) return state;
  autoDecide(live);
  return syncFromEngine(state);
}

/** One step of the user's series: a round, a map start or a map end. No-op while a decision is pending. */
export function stepCampaignSeries(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (!live || live.phase === 'finished' || pendingSeriesDecision(live)) return state;
  stepSeries(live);
  return syncFromEngine(state);
}

/** Plays the current map to its end, taking any decision still pending with the bot policies. */
export function skipCampaignMap(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (!live || live.phase === 'finished') return state;
  for (;;) {
    if (pendingSeriesDecision(live)) break;
    if (stepSeries(live) !== 'round') break;
  }
  return syncFromEngine(state);
}

export function callCampaignTimeout(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (!live) return state;
  requestSeriesTimeout(live, state.userTeamId);
  return syncFromEngine(state);
}

/** Confirms the finished series and moves the Major to the next one. */
export function advanceCampaignMajor(state: CampaignMajorState): CampaignMajorState {
  const live = currentCampaignSeries(state);
  if (live && live.phase !== 'finished') return state;
  const confirmedSeriesIds = live ? [...state.confirmedSeriesIds, live.config.id] : state.confirmedSeriesIds;
  return settle({ ...state, confirmedSeriesIds });
}

/** Every user series already finished, in the shape a reload needs to restore the campaign exactly. */
export function campaignPlayedSeries(state: CampaignMajorState): Record<string, SeriesResult> {
  const played: Record<string, SeriesResult> = {};
  for (const round of state.engine.rounds) {
    for (const series of round.series) {
      const isUser = series.config.teamA.id === state.userTeamId || series.config.teamB.id === state.userTeamId;
      if (isUser && series.phase === 'finished') played[series.config.id] = toResult(state.engine).rounds
        .flatMap((item) => item.series).find((item) => item.id === series.config.id)!;
    }
  }
  return played;
}

export function getCampaignLiveView(state: CampaignMajorState): CampaignLiveView | null {
  const live = currentCampaignSeries(state);
  if (!live) return null;
  const pending = pendingSeriesDecision(live);
  const userIsA = live.config.teamA.id === state.userTeamId;
  const timeouts = seriesTimeouts(live);
  const streaks = seriesLossStreak(live);
  const sideA = seriesSideA(live);
  const maps = state.run.matches.find((match) => match.id === live.config.id)?.maps ?? [];
  return {
    seriesId: live.config.id,
    phase: live.phase,
    activeMap: live.current ? live.current.index : Math.max(0, maps.length - 1),
    visibleRounds: maps.at(-1)?.rounds.length ?? 0,
    started: maps.length > 0,
    finished: live.phase === 'finished',
    timeoutsLeft: userIsA ? timeouts.a : timeouts.b,
    lossStreak: userIsA ? streaks.a : streaks.b,
    userSide: sideA ? (userIsA ? sideA : sideA === 'ct' ? 't' : 'ct') : null,
    veto: live.veto
      ? { available: [...live.veto.available], steps: [...live.veto.steps], turnTeamId: pending?.kind === 'veto' ? pending.teamId : null, action: pending?.kind === 'veto' ? pending.action : null }
      : null
  };
}

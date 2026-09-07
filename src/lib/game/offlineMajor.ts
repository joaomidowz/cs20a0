import { computeMajorAwards } from './majorAwards';
import { createBotMapStrategy, createUserMapStrategy, type MapSimulationContext } from './map-veto';
import { isValidLineupMapSelection } from './maps';
import {
  applySeriesDecision,
  autoDecide,
  pendingSeriesDecision,
  requestSeriesTimeout,
  runSeriesToEnd,
  seriesSideA,
  seriesTimeouts,
  stepSeries,
  toSeriesResult,
  type LiveSeriesState,
  type PendingSeriesDecision,
  type SeriesDecisionInput,
  type SeriesStepOutcome
} from './online/live-series';
import {
  canStartNextRound,
  completeRound,
  createTournamentEngine,
  currentRound,
  isRoundComplete,
  startNextRound,
  toResult,
  type TournamentEngineState,
  type TournamentOrganization
} from './online/tournament-engine';
import { calculateHistoricalTeamPower, calculateUserTeamPower, createSeededRng, orientSeriesToTeam, stripSeriesDetails } from './simulation';
import type {
  GameMode,
  HistoricalTeam,
  MajorAwards,
  MajorRun,
  MapId,
  MapSide,
  OfflineDecisionLog,
  OfflineSeriesEvent,
  OfflineSeriesLog,
  OrgStyle,
  Player,
  PlayoffsResult,
  Roster,
  SelectedPlayer,
  SeriesResult
} from './types';

/**
 * Incremental offline Major: the same field, seeding and map context as `buildMajorRun` (simulation.ts) driven by the
 * live tournament engine, so the user's series wait for their veto, side pick, eco call and tactical timeouts.
 *
 * The engine holds closures and Maps and cannot be saved; everything the user did is appended to a replay log
 * (`OfflineDecisionLog`, persisted in the game state) and `restoreOfflineMajor` rebuilds the exact engine from it.
 */

export const OFFLINE_USER_ID = 'user';

export interface OfflineDecisionRules {
  veto: boolean;
  side: boolean;
  ecoCall: boolean;
  timeout: boolean;
}

/** PRO and Ranked hand every decision to the user; Normal only lets them call tactical timeouts. */
export function getOfflineDecisionRules(mode: GameMode): OfflineDecisionRules {
  const full = mode === 'pro' || mode === 'faceit';
  return { veto: full, side: full, ecoCall: full, timeout: true };
}

export interface OfflineMajorOptions {
  selectedMaps?: MapId[];
  mode?: GameMode;
  /**
   * Every decision of the user's team (timeouts included) is taken by the bot policies, exactly like `buildMajorRun`.
   * Used to check parity with the batch simulation; the product never sets it.
   */
  autopilot?: boolean;
}

export interface OfflineMajorState {
  engine: TournamentEngineState;
  rules: OfflineDecisionRules;
  userId: string;
  log: OfflineDecisionLog;
  /** Awards of the finished tournament, computed once from the full kill feeds. */
  awards?: MajorAwards | null;
}

export interface OfflineLiveView {
  seriesId: string;
  phase: LiveSeriesState['phase'];
  activeMap: number;
  visibleRounds: number;
  started: boolean;
  finished: boolean;
  timeoutsLeft: number;
  userSide: MapSide | null;
  veto: { available: MapId[]; steps: NonNullable<SeriesResult['veto']>; turnTeamId: string | null; action: 'ban' | 'pick' | null } | null;
}

/**
 * Field, map context and rosters of the offline Major. Mirrors the top of `buildMajorRun` — keep the two in sync: the
 * seeds (`:offline-maps`, `:major-field:`, `:major:`) are what make the batch and the incremental runs identical.
 */
function buildOfflineField(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[],
  options: OfflineMajorOptions
) {
  const lineupKey = players.map((player) => player.id).join('|');
  const user = calculateUserTeamPower(players, style, lineup, seed);
  let mapContext: MapSimulationContext | undefined;
  const selectedMaps = options.selectedMaps ?? [];
  if (isValidLineupMapSelection(selectedMaps, players, teams)) {
    const strategies: MapSimulationContext['strategies'] = new Map();
    strategies.set(user.id, createUserMapStrategy(user.id, selectedMaps, players, teams));
    for (const team of teams) strategies.set(team.id, createBotMapStrategy(team));
    mapContext = { mode: options.mode ?? 'premier', seed: `${seed}:offline-maps`, strategies };
  }
  const rosters = new Map<string, Roster>();
  rosters.set(user.id, { players, roles: new Map(lineup.map((selected) => [selected.playerId, selected.selectedSlotRole])) });
  for (const team of teams) rosters.set(team.id, { players: allPlayers.filter((player) => (team.players ?? []).includes(player.id)) });
  if (mapContext) mapContext.rosters = rosters;
  const fieldRng = createSeededRng(`${seed}:major-field:${lineupKey}:${style}`);
  const field: TournamentOrganization[] = teams.map((team) => {
    const combat = calculateHistoricalTeamPower(team, allPlayers);
    return { id: team.id, name: combat.name, seed: 0, team: combat, human: false, sourceTeamId: team.id };
  });
  for (let index = field.length - 1; index > 0; index -= 1) {
    const target = Math.floor(fieldRng() * (index + 1));
    [field[index], field[target]] = [field[target], field[index]];
  }
  return { user, field, mapContext, engineSeed: `${seed}:major:${lineupKey}:${style}` };
}

export function createOfflineMajor(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[] = [],
  options: OfflineMajorOptions = {}
): OfflineMajorState {
  const rules = getOfflineDecisionRules(options.mode ?? 'premier');
  const { user, field, mapContext, engineSeed } = buildOfflineField(players, style, teams, allPlayers, seed, lineup, options);
  const engine = createTournamentEngine({
    organizations: [{ id: user.id, name: user.name, seed: 1, team: user, human: true }],
    botPool: field,
    entryStage: 'stage3',
    seed: engineSeed,
    mapContext,
    // 13a0: every offline series is BO3 except the BO5 final.
    swissBestOf: 3,
    controllerFor: options.autopilot ? () => 'bot' : (organization) => (organization.human ? 'human' : 'bot'),
    // The user vetoes against bots too (like the Sandbox); the online mode only does it human vs human.
    interactiveVeto: options.autopilot ? () => false : (left, right) => rules.veto && (left.human || right.human),
    humanDecisions: { side: rules.side, 'eco-call': rules.ecoCall }
  });
  const state: OfflineMajorState = { engine, rules, userId: user.id, log: { version: 1, series: [] } };
  settleOfflineMajor(state);
  return state;
}

const involvesUser = (state: OfflineMajorState, series: LiveSeriesState) =>
  series.config.teamA.id === state.userId || series.config.teamB.id === state.userId;

const confirmedIds = (state: OfflineMajorState) => new Set(state.log.series.filter((entry) => entry.confirmed).map((entry) => entry.seriesId));

const userSeriesOf = (state: OfflineMajorState): LiveSeriesState | null => {
  const round = currentRound(state.engine);
  return round?.series.find((series) => involvesUser(state, series)) ?? null;
};

/** The user's series still on screen (running or finished but not confirmed yet), or null. */
export function currentOfflineSeries(state: OfflineMajorState): LiveSeriesState | null {
  const series = userSeriesOf(state);
  return series && !confirmedIds(state).has(series.config.id) ? series : null;
}

/** Number of user series the user already confirmed (the page's `completedSeries`). */
export const offlineCompletedSeries = (state: OfflineMajorState) => confirmedIds(state).size;

/**
 * Starts rounds as they become available, plays every bot-only series to the end and stops at the user's live series.
 * Rounds without the user (after an early elimination or qualification) run through in one go.
 */
export function settleOfflineMajor(state: OfflineMajorState): OfflineMajorState {
  const { engine } = state;
  const confirmed = confirmedIds(state);
  for (;;) {
    if (engine.finished) break;
    if (canStartNextRound(engine)) startNextRound(engine);
    const round = currentRound(engine)!;
    for (const series of round.series) {
      if (!involvesUser(state, series)) runSeriesToEnd(series);
    }
    const user = userSeriesOf(state);
    if (user && !confirmed.has(user.config.id)) break;
    if (isRoundComplete(round)) completeRound(engine);
    else break;
  }
  return state;
}

function seriesLog(state: OfflineMajorState, seriesId: string): OfflineSeriesLog {
  let entry = state.log.series.find((item) => item.seriesId === seriesId);
  if (!entry) {
    entry = { seriesId, events: [], confirmed: false };
    state.log.series.push(entry);
  }
  return entry;
}

function logEvent(state: OfflineMajorState, seriesId: string, event: OfflineSeriesEvent) {
  const entry = seriesLog(state, seriesId);
  const last = entry.events.at(-1);
  if (event.kind === 'step' && last?.kind === 'step') {
    last.count += event.count;
    return;
  }
  entry.events.push(event);
}

const toEvent = (input: SeriesDecisionInput): OfflineSeriesEvent =>
  input.kind === 'veto' ? { kind: 'veto', action: input.action, mapId: input.mapId }
    : input.kind === 'side' ? { kind: 'side', side: input.side }
      : { kind: 'eco-call', call: input.call };

const toInput = (event: OfflineSeriesEvent, teamId: string): SeriesDecisionInput | null =>
  event.kind === 'veto' ? { kind: 'veto', teamId, action: event.action, mapId: event.mapId }
    : event.kind === 'side' ? { kind: 'side', teamId, side: event.side }
      : event.kind === 'eco-call' ? { kind: 'eco-call', teamId, call: event.call }
        : null;

export function pendingOfflineDecision(state: OfflineMajorState): PendingSeriesDecision | null {
  const live = currentOfflineSeries(state);
  return live ? pendingSeriesDecision(live) : null;
}

/** Applies one of the user's decisions. Throws `LiveSeriesError` when it is not pending or invalid. */
export function applyOfflineDecision(state: OfflineMajorState, input: SeriesDecisionInput): OfflineMajorState {
  const live = currentOfflineSeries(state);
  if (!live) return state;
  applySeriesDecision(live, input);
  logEvent(state, live.config.id, toEvent(input));
  return state;
}

export const applyOfflineVeto = (state: OfflineMajorState, action: 'ban' | 'pick', mapId: MapId) =>
  applyOfflineDecision(state, { kind: 'veto', teamId: state.userId, action, mapId });
export const applyOfflineSide = (state: OfflineMajorState, side: MapSide) =>
  applyOfflineDecision(state, { kind: 'side', teamId: state.userId, side });
export const applyOfflineEcoCall = (state: OfflineMajorState, call: 'force' | 'eco') =>
  applyOfflineDecision(state, { kind: 'eco-call', teamId: state.userId, call });

/** Settles the user's pending decision with the bot policy (logged so a replay takes the same choice). */
export function autoOfflineDecision(state: OfflineMajorState): OfflineMajorState {
  const live = currentOfflineSeries(state);
  if (!live || !pendingSeriesDecision(live)) return state;
  autoDecide(live);
  logEvent(state, live.config.id, { kind: 'auto' });
  return state;
}

/** Calls a tactical timeout for the user. Throws `LiveSeriesError` when none is available. */
export function requestOfflineTimeout(state: OfflineMajorState): OfflineMajorState {
  const live = currentOfflineSeries(state);
  if (!live) return state;
  requestSeriesTimeout(live, state.userId);
  logEvent(state, live.config.id, { kind: 'timeout' });
  return state;
}

/** One step of the user's live series (a round, a map start or a map end). 'decision' means nothing happened. */
export function stepOfflineSeries(state: OfflineMajorState): SeriesStepOutcome {
  const live = currentOfflineSeries(state);
  if (!live) return 'finished';
  if (live.phase === 'finished') return 'finished';
  if (pendingSeriesDecision(live)) return 'decision';
  const outcome = stepSeries(live);
  if (outcome !== 'decision') logEvent(state, live.config.id, { kind: 'step', count: 1 });
  return outcome;
}

/** Plays the current map of the user's live series to its end, stopping early only for a decision of the user. */
export function skipOfflineMap(state: OfflineMajorState): OfflineMajorState {
  const live = currentOfflineSeries(state);
  if (!live || live.phase === 'finished') return state;
  for (;;) {
    if (pendingSeriesDecision(live)) break;
    if (stepOfflineSeries(state) !== 'round') break;
  }
  return state;
}

/** Marks the user's finished series as seen and moves the tournament on. Returns false while the series is running. */
export function confirmOfflineSeries(state: OfflineMajorState): boolean {
  const live = currentOfflineSeries(state);
  if (!live || live.phase !== 'finished') return false;
  seriesLog(state, live.config.id).confirmed = true;
  settleOfflineMajor(state);
  return true;
}

/**
 * Rebuilds the engine from the same draft and a replay log: every logged series is driven again with exactly the same
 * steps, timeouts and decisions. Stops at the first event the rebuilt engine cannot accept (a log from another draft).
 */
export function restoreOfflineMajor(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[],
  options: OfflineMajorOptions,
  log: OfflineDecisionLog | null
): OfflineMajorState {
  const state = createOfflineMajor(players, style, teams, allPlayers, seed, lineup, options);
  for (const entry of log?.series ?? []) {
    const live = currentOfflineSeries(state);
    if (!live || live.config.id !== entry.seriesId) break;
    try {
      for (const event of entry.events) {
        if (event.kind === 'step') {
          for (let index = 0; index < event.count; index += 1) stepOfflineSeries(state);
        } else if (event.kind === 'timeout') requestOfflineTimeout(state);
        else if (event.kind === 'auto') autoOfflineDecision(state);
        else {
          const input = toInput(event, state.userId);
          if (input) applyOfflineDecision(state, input);
        }
      }
    } catch {
      break;
    }
    if (entry.confirmed && !confirmOfflineSeries(state)) break;
  }
  return state;
}

/** What the viewer needs to render the user's live series (null when no user series is on screen). */
export function getOfflineLiveView(state: OfflineMajorState): OfflineLiveView | null {
  const live = currentOfflineSeries(state);
  if (!live) return null;
  const result = toSeriesResult(live);
  const pending = pendingSeriesDecision(live);
  const userIsA = live.config.teamA.id === state.userId;
  const timeouts = seriesTimeouts(live);
  const sideA = seriesSideA(live);
  return {
    seriesId: live.config.id,
    phase: live.phase,
    activeMap: live.current ? live.current.index : Math.max(0, result.maps.length - 1),
    visibleRounds: result.maps.at(-1)?.rounds.length ?? 0,
    started: result.maps.length > 0,
    finished: live.phase === 'finished',
    timeoutsLeft: userIsA ? timeouts.a : timeouts.b,
    userSide: sideA ? (userIsA ? sideA : sideA === 'ct' ? 't' : 'ct') : null,
    veto: live.veto
      ? { available: [...live.veto.available], steps: [...live.veto.steps], turnTeamId: pending?.kind === 'veto' ? pending.teamId : null, action: pending?.kind === 'veto' ? pending.action : null }
      : null
  };
}

/**
 * Presentation snapshot in the shape `buildMajorRun` returns: the user's series (the live one included, with
 * `winnerId` empty) oriented with the user as team A, and the whole field with non-user kill feeds stripped.
 */
export function toMajorRun(state: OfflineMajorState): MajorRun {
  const { engine, userId } = state;
  const result = toResult(engine);
  const userSeries = result.rounds.flatMap((round) => round.series).filter((series) => series.userMatch).map((series) => orientSeriesToTeam(series, userId));
  const stage3Matches = userSeries.filter((series) => series.phase === 'stage3');
  const wins = stage3Matches.filter((series) => series.winnerId === userId).length;
  const losses = stage3Matches.filter((series) => series.winnerId && series.winnerId !== userId).length;
  const qualified = wins === 3;
  const champion = result.championId === userId;
  const placement = result.campaigns.find((campaign) => campaign.organizationId === userId)?.placement ?? 'placementStage3';
  const strip = (series: SeriesResult) => (series.userMatch ? series : stripSeriesDetails(series));
  // Awards look at the whole field, so they are computed from the full kill feeds once the champion is known.
  if (engine.finished && state.awards === undefined) state.awards = computeMajorAwards(result.rounds, result.championId);
  const playoffs: PlayoffsResult | undefined = qualified
    ? {
      championId: result.championId ?? '',
      placement,
      userMatches: userSeries.filter((series) => series.phase !== 'stage3'),
      allMatches: result.rounds.filter((round) => round.phase !== 'swiss').flatMap((round) => round.series.map(strip))
    }
    : undefined;
  return {
    stage3: { wins, losses, qualified, matches: stage3Matches },
    playoffs,
    matches: userSeries,
    champion,
    placement,
    tournament: {
      rounds: result.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map(strip) })),
      standings: result.standings,
      championId: result.championId,
      ...(engine.finished ? { awards: state.awards ?? null } : {})
    }
  };
}

export const isOfflineMajorFinished = (state: OfflineMajorState) => state.engine.finished && currentOfflineSeries(state) === null;

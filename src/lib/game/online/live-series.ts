import { buildVetoPlan, chooseMap, getStrategyMapBonus, getVetoAvailableMaps, type MapStrategy, type VetoPlanStep } from '../map-veto';
import {
  MapDecisionError,
  applyDecision,
  autoDecide as autoDecideMap,
  createMapState,
  getCurrentSideA,
  getTimeoutsRemaining,
  pendingDecision as pendingMapDecision,
  playNextRound,
  requestTimeout,
  toMapResult,
  type Controller,
  type MapState
} from '../rounds';
import { createSeededRng, getMatchDayPower, type SeededRng } from '../simulation';
import type { CombatTeam, GameMode, MapId, MapResult, MapSide, MapVetoStep, Roster, SeriesDecision, SeriesResult, TeamSide } from '../types';

export type { Controller } from '../rounds';

export type LiveSeriesPhase = 'veto' | 'intermission' | 'side-pick' | 'live' | 'finished';

export interface LiveSeriesConfig {
  id: string;
  phase: SeriesResult['phase'];
  bestOf: 1 | 3 | 5;
  teamA: CombatTeam;
  teamB: CombatTeam;
  /** Drives every roll of the series (match day, knife rounds, maps). */
  seed: string;
  /** Drives the automatic veto choices; defaults to `${seed}:veto`. */
  vetoSeed?: string;
  mode: GameMode;
  /** Without strategies the series is played on numbered maps and has no veto. */
  strategies: { a: MapStrategy; b: MapStrategy } | null;
  rosters?: { a?: Roster; b?: Roster };
  controllers: { a: Controller; b: Controller };
  /** When true the veto waits for `applySeriesDecision`; otherwise it is resolved at creation with the bot policy. */
  interactiveVeto: boolean;
}

export interface VetoBoard {
  available: MapId[];
  plan: VetoPlanStep[];
  cursor: number;
  steps: MapVetoStep[];
}

export type PendingSeriesDecision =
  | { kind: 'veto'; teamId: string; action: 'ban' | 'pick'; step: number; available: MapId[] }
  | { kind: 'side'; teamId: string; mapIndex: number; mapId: MapId | null }
  | { kind: 'eco-call'; teamId: string; mapIndex: number; roundNumber: number; money: number };

export type SeriesDecisionInput =
  | { kind: 'veto'; teamId: string; action: 'ban' | 'pick'; mapId: MapId }
  | { kind: 'side'; teamId: string; side: MapSide }
  | { kind: 'eco-call'; teamId: string; call: 'force' | 'eco' };

export interface LiveSeriesState {
  config: LiveSeriesConfig;
  phase: LiveSeriesPhase;
  adjustedA: CombatTeam;
  adjustedB: CombatTeam;
  veto: VetoBoard | null;
  playedMaps: Array<{ mapId: MapId | undefined; pickedBy: string | null }>;
  maps: MapResult[];
  current: { index: number; state: MapState } | null;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  vetoDecisions: SeriesDecision[];
}

export type LiveSeriesErrorCode = 'NOT_YOUR_TURN' | 'DECISION_NOT_PENDING' | 'INVALID_MAP' | 'TIMEOUT_UNAVAILABLE' | 'SERIES_FINISHED';

export class LiveSeriesError extends Error {
  constructor(public readonly code: LiveSeriesErrorCode, message: string) {
    super(message);
    this.name = 'LiveSeriesError';
  }
}

export type SeriesStepOutcome = 'decision' | 'round' | 'map-start' | 'map-complete' | 'finished';

const sideOf = (state: LiveSeriesState, teamId: string): TeamSide | null =>
  state.config.teamA.id === teamId ? 'a' : state.config.teamB.id === teamId ? 'b' : null;

const teamOf = (state: LiveSeriesState, side: TeamSide) => (side === 'a' ? state.config.teamA : state.config.teamB);

const vetoSeedOf = (config: LiveSeriesConfig) => config.vetoSeed ?? `${config.seed}:veto`;

export function createLiveSeries(config: LiveSeriesConfig): LiveSeriesState {
  const matchDay = createSeededRng(`${config.seed}:matchday`);
  const pressureA = config.phase === 'final' ? (config.teamA.experience + config.teamA.mental) / 180 : 1;
  const pressureB = config.phase === 'final' ? (config.teamB.experience + config.teamB.mental) / 180 : 1;
  const state: LiveSeriesState = {
    config,
    phase: config.strategies ? 'veto' : 'intermission',
    adjustedA: { ...config.teamA, power: getMatchDayPower(config.teamA, matchDay) + pressureA },
    adjustedB: { ...config.teamB, power: getMatchDayPower(config.teamB, matchDay) + pressureB },
    veto: null,
    playedMaps: [],
    maps: [],
    current: null,
    scoreA: 0,
    scoreB: 0,
    winnerId: '',
    vetoDecisions: []
  };
  if (config.strategies) {
    const available = getVetoAvailableMaps(config.strategies.a, config.strategies.b);
    state.veto = { available, plan: buildVetoPlan(config.bestOf, available.length), cursor: 0, steps: [] };
    if (!config.interactiveVeto) while (state.phase === 'veto') resolvePending(state);
  } else {
    state.playedMaps = Array.from({ length: config.bestOf }, () => ({ mapId: undefined, pickedBy: null }));
  }
  settleBots(state);
  return state;
}

/** Bots never wait: any decision that falls to a bot is taken immediately with the bot policy. */
function settleBots(state: LiveSeriesState): void {
  for (;;) {
    const pending = rawPendingDecision(state);
    if (!pending || controllerOf(state, pending.teamId) !== 'bot') return;
    resolvePending(state);
  }
}

export const controllerOf = (state: LiveSeriesState, teamId: string): Controller => {
  const side = sideOf(state, teamId);
  return side ? state.config.controllers[side] : 'bot';
};

/** The decision a human has to take right now, if any (bot decisions are never left pending). */
export function pendingSeriesDecision(state: LiveSeriesState): PendingSeriesDecision | null {
  const pending = rawPendingDecision(state);
  return pending && controllerOf(state, pending.teamId) === 'human' ? pending : null;
}

function rawPendingDecision(state: LiveSeriesState): PendingSeriesDecision | null {
  if (state.phase === 'finished') return null;
  if (state.phase === 'veto' && state.veto) {
    const step = state.veto.plan[state.veto.cursor];
    if (!step) return null;
    return { kind: 'veto', teamId: teamOf(state, step.actor).id, action: step.action, step: state.veto.cursor, available: [...state.veto.available] };
  }
  if (!state.current) return null;
  const pending = pendingMapDecision(state.current.state);
  if (!pending) return null;
  if (pending.type === 'side') return { kind: 'side', teamId: pending.teamId, mapIndex: state.current.index, mapId: state.current.state.mapId ?? null };
  return { kind: 'eco-call', teamId: pending.teamId, mapIndex: state.current.index, roundNumber: pending.roundNumber, money: pending.money };
}

function completeVeto(state: LiveSeriesState) {
  const board = state.veto!;
  board.steps.push({ order: board.steps.length + 1, action: 'decider', teamId: null, mapId: board.available[0] });
  state.playedMaps = board.steps
    .filter((step) => step.action !== 'ban')
    .map((step) => ({ mapId: step.mapId, pickedBy: step.action === 'pick' ? step.teamId : null }));
  state.phase = 'intermission';
}

export function applySeriesDecision(state: LiveSeriesState, decision: SeriesDecisionInput, auto = false): void {
  if (state.phase === 'finished') throw new LiveSeriesError('SERIES_FINISHED', 'The series is over');
  const pending = rawPendingDecision(state);
  if (!pending || pending.kind !== decision.kind) throw new LiveSeriesError('DECISION_NOT_PENDING', `No ${decision.kind} decision is pending`);
  if (pending.teamId !== decision.teamId) throw new LiveSeriesError('NOT_YOUR_TURN', 'It is not this team\'s turn');

  if (decision.kind === 'veto' && pending.kind === 'veto') {
    if (decision.action !== pending.action) throw new LiveSeriesError('DECISION_NOT_PENDING', `The current step is a ${pending.action}`);
    const board = state.veto!;
    if (!board.available.includes(decision.mapId)) throw new LiveSeriesError('INVALID_MAP', `${decision.mapId} is not available`);
    board.available.splice(board.available.indexOf(decision.mapId), 1);
    board.steps.push({ order: board.steps.length + 1, action: decision.action, teamId: decision.teamId, mapId: decision.mapId });
    board.cursor += 1;
    state.vetoDecisions.push({ kind: 'veto', teamId: decision.teamId, action: decision.action, mapId: decision.mapId, auto });
    if (board.cursor >= board.plan.length) completeVeto(state);
    if (!auto) settleBots(state);
    return;
  }
  if (!state.current) throw new LiveSeriesError('DECISION_NOT_PENDING', 'No map is live');
  try {
    if (decision.kind === 'side') {
      applyDecision(state.current.state, { type: 'side', side: decision.side }, auto);
      state.phase = 'live';
    } else if (decision.kind === 'eco-call') {
      applyDecision(state.current.state, { type: 'eco-call', call: decision.call }, auto);
    }
  } catch (error) {
    if (error instanceof MapDecisionError) throw new LiveSeriesError(error.code === 'INVALID_DECISION' ? 'INVALID_MAP' : 'DECISION_NOT_PENDING', error.message);
    throw error;
  }
  if (!auto) settleBots(state);
}

/** Resolves the human decision that is pending with the bot policy (used when a timer expires). */
export function autoDecide(state: LiveSeriesState): void {
  resolvePending(state);
  settleBots(state);
}

function resolvePending(state: LiveSeriesState): void {
  const pending = rawPendingDecision(state);
  if (!pending) return;
  if (pending.kind === 'veto') {
    const strategies = state.config.strategies!;
    const side = sideOf(state, pending.teamId)!;
    const actor = side === 'a' ? strategies.a : strategies.b;
    const opponent = side === 'a' ? strategies.b : strategies.a;
    const mapId = chooseMap(vetoSeedOf(state.config), pending.step, pending.action, actor, opponent, pending.available);
    applySeriesDecision(state, { kind: 'veto', teamId: pending.teamId, action: pending.action, mapId }, true);
    return;
  }
  if (!state.current) return;
  autoDecideMap(state.current.state);
  if (state.phase === 'side-pick') state.phase = 'live';
}

export function requestSeriesTimeout(state: LiveSeriesState, teamId: string): void {
  if (state.phase !== 'live' || !state.current) throw new LiveSeriesError('TIMEOUT_UNAVAILABLE', 'No map is live');
  if (!sideOf(state, teamId)) throw new LiveSeriesError('NOT_YOUR_TURN', 'Unknown team');
  let granted = false;
  try {
    granted = requestTimeout(state.current.state, teamId);
  } catch (error) {
    if (error instanceof MapDecisionError) throw new LiveSeriesError('TIMEOUT_UNAVAILABLE', error.message);
    throw error;
  }
  if (!granted) throw new LiveSeriesError('TIMEOUT_UNAVAILABLE', 'No tactical timeout left in this half');
}

function startMap(state: LiveSeriesState): void {
  const index = state.maps.length;
  const played = state.playedMaps[index];
  const pickedBy = played?.pickedBy ?? null;
  const mapId = played?.mapId;
  // Whoever did not pick the map chooses the side; the decider (and numbered maps) go to a knife round.
  const knife = createSeededRng(`${state.config.seed}:knife:${index}`)() < 0.5 ? state.config.teamA.id : state.config.teamB.id;
  const sidePickerTeamId = pickedBy === state.config.teamA.id ? state.config.teamB.id : pickedBy === state.config.teamB.id ? state.config.teamA.id : knife;
  const strategies = state.config.strategies;
  const mapState = createMapState(state.adjustedA, state.adjustedB, {
    rng: createSeededRng(`${state.config.seed}:map:${index}:${mapId ?? 'numbered'}`),
    mapNumber: index + 1,
    mapId,
    pickedBy,
    sidePickerTeamId,
    rosterA: state.config.rosters?.a,
    rosterB: state.config.rosters?.b,
    controllers: state.config.controllers,
    powerBonusA: strategies && mapId ? getStrategyMapBonus(strategies.a, mapId, state.config.mode) : 0,
    powerBonusB: strategies && mapId ? getStrategyMapBonus(strategies.b, mapId, state.config.mode) : 0
  });
  state.current = { index, state: mapState };
  state.phase = pendingMapDecision(mapState) ? 'side-pick' : 'live';
  settleBots(state);
}

/** Makes exactly one unit of progress. Returns 'decision' (and does nothing) while a decision is pending. */
export function stepSeries(state: LiveSeriesState): SeriesStepOutcome {
  if (state.phase === 'finished') return 'finished';
  if (pendingSeriesDecision(state)) return 'decision';
  if (state.phase === 'intermission') {
    startMap(state);
    return 'map-start';
  }
  if (state.phase === 'side-pick') {
    state.phase = 'live';
    return 'round';
  }
  if (state.phase !== 'live' || !state.current) return 'decision';
  playNextRound(state.current.state);
  if (!state.current.state.finished) {
    settleBots(state);
    return 'round';
  }
  const result = toMapResult(state.current.state);
  state.maps.push(result);
  state.current = null;
  if (result.winnerId === state.config.teamA.id) state.scoreA += 1;
  else state.scoreB += 1;
  const needed = Math.ceil(state.config.bestOf / 2);
  if (state.scoreA >= needed || state.scoreB >= needed) {
    state.phase = 'finished';
    state.winnerId = state.scoreA > state.scoreB ? state.config.teamA.id : state.config.teamB.id;
    return 'finished';
  }
  state.phase = 'intermission';
  return 'map-complete';
}

export function runSeriesToEnd(state: LiveSeriesState): void {
  while (state.phase !== 'finished') {
    if (pendingSeriesDecision(state)) autoDecide(state);
    else stepSeries(state);
  }
}

export const isSeriesFinished = (state: LiveSeriesState) => state.phase === 'finished';

export function seriesTimeouts(state: LiveSeriesState): { a: number; b: number } {
  if (!state.current) return { a: 1, b: 1 };
  return { a: getTimeoutsRemaining(state.current.state, state.config.teamA.id), b: getTimeoutsRemaining(state.current.state, state.config.teamB.id) };
}

export const seriesSideA = (state: LiveSeriesState): MapSide | null => (state.current ? getCurrentSideA(state.current.state) : null);

/** Snapshot of the series so far: the live map (if any) is included with `winnerId` empty. */
export function toSeriesResult(state: LiveSeriesState): SeriesResult {
  const maps = state.current ? [...state.maps, toMapResult(state.current.state)] : [...state.maps];
  return {
    id: state.config.id,
    phase: state.config.phase,
    bestOf: state.config.bestOf,
    teamA: state.config.teamA,
    teamB: state.config.teamB,
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    winnerId: state.winnerId,
    maps,
    ...(state.veto ? { veto: [...state.veto.steps] } : {}),
    decisions: [...state.vetoDecisions, ...maps.flatMap((map) => map.decisions ?? [])],
    userMatch: Boolean(state.config.teamA.isUser || state.config.teamB.isUser)
  };
}

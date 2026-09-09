import { advanceIncrementalMap, createIncrementalMap, getHalfId, getLegalBuys, recommendRoundDecision, type IncrementalMapState } from './match-engine';
import { advanceIncrementalMapVeto, createIncrementalMapVeto, getCurrentVetoAction, getStrategyMapBonus, type IncrementalMapVetoState, type MapSimulationContext } from './map-veto';
import type { CombatTeam, MapId, RoundDecision, SeriesResult } from './types';

export interface StrategicAutomationPreferences {
  autoMapPicksAndVetos: boolean;
  autoPause: boolean;
  autoEconomy: boolean;
}
export const DEFAULT_STRATEGIC_AUTOMATION: StrategicAutomationPreferences = {
  autoMapPicksAndVetos: true, autoPause: true, autoEconomy: true
};
export interface StrategicSeriesState {
  version: 1;
  seed: string;
  result: SeriesResult;
  veto: IncrementalMapVetoState;
  map: IncrementalMapState | null;
  mode: MapSimulationContext['mode'];
  queuedPauses?: string[];
  economyWindows?: Record<string, string[]>;
}
export type StrategicSeriesBook = Record<string, StrategicSeriesState>;

export function createStrategicSeries(teamA: CombatTeam, teamB: CombatTeam, bestOf: 1 | 3 | 5, phase: SeriesResult['phase'], id: string, context: MapSimulationContext): StrategicSeriesState {
  const a = context.strategies.get(teamA.id);
  const b = context.strategies.get(teamB.id);
  if (!a || !b) throw new Error('Missing map strategy');
  return { version: 1, seed: `${context.seed}:${id}`, mode: context.mode, map: null,
    veto: createIncrementalMapVeto({ teamA: a, teamB: b, bestOf, seed: `${context.seed}:${id}:veto` }),
    result: { id, teamA, teamB, bestOf, phase, scoreA: 0, scoreB: 0, winnerId: '', maps: [], veto: [], userMatch: Boolean(teamA.isUser || teamB.isUser) }
  };
}

export function applyStrategicVeto(source: StrategicSeriesState, mapId?: MapId): StrategicSeriesState {
  const state = structuredClone(source);
  state.veto = advanceIncrementalMapVeto(state.veto, mapId);
  state.result.veto = [...state.veto.steps];
  return state;
}

export function prepareStrategicMap(source: StrategicSeriesState): StrategicSeriesState {
  if (!source.veto.finished || source.result.winnerId || (source.map && !source.map.finished)) return source;
  const state = structuredClone(source);
  const index = state.result.maps.length;
  const mapId = state.veto.steps.filter(step => step.action !== 'ban')[index]?.mapId;
  if (!mapId) throw new Error('Missing decided map');
  state.map = createIncrementalMap({ teamA: state.result.teamA, teamB: state.result.teamB, seed: `${state.seed}:map:${index}`, map: index + 1, mapId,
    powerBonusA: getStrategyMapBonus(state.veto.teamA, mapId, state.mode),
    powerBonusB: getStrategyMapBonus(state.veto.teamB, mapId, state.mode) });
  return state;
}

export function strategicRoundContext(state: StrategicSeriesState, side: 'a' | 'b') {
  const map = state.map;
  if (!map || map.finished) throw new Error('No active round');
  const own = side === 'a' ? map.stateA : map.stateB;
  const overtimeReset = map.round >= 24 && (map.round - 24) % 3 === 0;
  const money = map.round === 12 ? 800 : overtimeReset ? 10_000 : own.money;
  const context = { team: side === 'a' ? map.teamA : map.teamB, money,
    score: side === 'a' ? map.scoreA : map.scoreB, opponentScore: side === 'a' ? map.scoreB : map.scoreA,
    opponentRoundStreak: own.opponentRoundStreak, pauseAvailable: map.round !== 0 && map.round !== 12 && own.pauseHalf !== getHalfId(map.round),
    strongMap: side === 'a' ? map.strongMapA : map.strongMapB,
    pistolRound: map.round === 0 || map.round === 12, seed: `${map.seed}:${map.round}:${side}` };
  return { ...context, legalBuys: getLegalBuys(money, context.pistolRound), recommendation: recommendRoundDecision(context) };
}

export function advanceStrategicRound(source: StrategicSeriesState, decisions: Partial<Record<'a' | 'b', RoundDecision>> = {}): StrategicSeriesState {
  const state = structuredClone(prepareStrategicMap(source));
  if (!state.map || state.result.winnerId) throw new Error('Series is not ready');
  for (const side of ['a', 'b'] as const) {
    const window = economyDecisionWindow(state, side);
    if (window) {
      const id = side === 'a' ? state.result.teamA.id : state.result.teamB.id;
      state.economyWindows ??= {};
      state.economyWindows[id] = [...(state.economyWindows[id] ?? []), window];
    }
    const decision = decisions[side];
    const context = strategicRoundContext(state, side);
    if (decision && (!context.legalBuys.includes(decision.buy) || (decision.tacticalPause && !context.pauseAvailable))) throw new Error('Illegal round decision');
  }
  state.map = advanceIncrementalMap(state.map, decisions);
  state.queuedPauses = [];
  const m = state.map;
  const result = { map: m.map, mapId: m.mapId, scoreA: m.scoreA, scoreB: m.scoreB, winnerId: m.winnerId, rounds: m.rounds, overtime: m.overtime, events: m.events };
  state.result.maps[m.map - 1] = result;
  state.result.scoreA = state.result.maps.filter(map => map.winnerId === state.result.teamA.id).length;
  state.result.scoreB = state.result.maps.filter(map => map.winnerId === state.result.teamB.id).length;
  if (Math.max(state.result.scoreA, state.result.scoreB) >= Math.ceil(state.result.bestOf / 2)) state.result.winnerId = state.result.scoreA > state.result.scoreB ? state.result.teamA.id : state.result.teamB.id;
  return state;
}

/** At most a lost-pistol decision plus one consequential economic decision per half. */
export function economyDecisionWindow(state: StrategicSeriesState, side: 'a' | 'b'): string | null {
  const map = state.map;
  if (!map || map.finished) return null;
  const context = strategicRoundContext(state, side);
  if (context.legalBuys.length < 2 || context.pistolRound) return null;
  const id = side === 'a' ? state.result.teamA.id : state.result.teamB.id;
  const half = getHalfId(map.round);
  const prefix = `${map.map}:${half}`;
  const used = state.economyWindows?.[id] ?? [];
  const lastLost = map.events.at(-1)?.winner !== side;
  if ((map.round === 1 || map.round === 13) && lastLost && !used.includes(`${prefix}:pistol`)) return `${prefix}:pistol`;
  if (used.includes(`${prefix}:key`)) return null;
  const roundInHalf = map.round < 24 ? map.round % 12 : (map.round - 24) % 3;
  const crisis = context.opponentScore >= 9 && context.opponentScore - context.score >= 6;
  const matchPoint = context.opponentScore >= 12 && context.opponentScore > context.score;
  const contestedEconomy = lastLost && context.money < 4700 && roundInHalf >= 4;
  return context.opponentRoundStreak >= 3 || crisis || matchPoint || contestedEconomy ? `${prefix}:key` : null;
}

export function resolveAutomaticVetos(source: StrategicSeriesState, preferences: Record<string, StrategicAutomationPreferences>): StrategicSeriesState {
  let state = source;
  while (!state.veto.finished) {
    const action = getCurrentVetoAction(state.veto)!;
    if (preferences[action.actorId]?.autoMapPicksAndVetos === false) break;
    state = applyStrategicVeto(state);
  }
  return prepareStrategicMap(state);
}

export function completeStrategicSeries(source: StrategicSeriesState): StrategicSeriesState {
  let state = source;
  for (let guard = 0; guard < 1000 && !state.result.winnerId; guard++) {
    state = advanceStrategicRound(resolveAutomaticVetos(state, {}));
  }
  if (!state.result.winnerId) throw new Error('Series exceeded round limit');
  return state;
}

import {
  MAP_POOL,
  getActiveDutyMapsForYear,
  getLineupMapAffinities,
  getLineupMapContributors,
  getMapFamiliarity,
  getSelectedMapPowerBonus,
  getTeamMapPreferences
} from './maps';
import type { GameMode, HistoricalTeam, MapAffinity, MapId, MapVetoStep, Player } from './types';

export interface MapStrategy {
  teamId: string;
  selectedMaps: [MapId, MapId, MapId];
  affinities: Record<MapId, MapAffinity>;
  familiarity: Record<MapId, number>;
  bot: boolean;
}

export interface MapSimulationContext {
  mode: GameMode;
  seed: string;
  strategies: Map<string, MapStrategy>;
}

export interface MapVetoResult {
  steps: MapVetoStep[];
  playedMaps: MapId[];
}

export interface IncrementalMapVetoState {
  bestOf: 1 | 3 | 5;
  seed: string;
  teamA: MapStrategy;
  teamB: MapStrategy;
  available: MapId[];
  sequence: Array<{ action: 'ban' | 'pick'; actorId: string }>;
  cursor: number;
  steps: MapVetoStep[];
  finished: boolean;
}

const affinityScore: Record<MapAffinity, number> = { EVEN: 0, '+': 1, '++': 2, '+++': 3 };

const hashUnit = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

const strategyStrength = (strategy: MapStrategy, mapId: MapId) => {
  const selectedIndex = strategy.selectedMaps.indexOf(mapId);
  const selectionScore = selectedIndex < 0 ? 0 : 3 + (2 - selectedIndex) * 0.75;
  return affinityScore[strategy.affinities[mapId]] * 4 + selectionScore;
};

export function chooseAutomaticVetoMap(
  seed: string,
  step: number,
  action: 'ban' | 'pick',
  actor: MapStrategy,
  opponent: MapStrategy,
  available: MapId[]
): MapId {
  return [...available].sort((left, right) => {
    const score = (mapId: MapId) => {
      const own = strategyStrength(actor, mapId);
      const enemy = strategyStrength(opponent, mapId);
      const tactical = action === 'pick' ? own - enemy * 0.3 : enemy - own * 0.25;
      const jitterRange = actor.bot ? 1.8 : 0.45;
      const jitter = (hashUnit(`${seed}:${step}:${action}:${actor.teamId}:${mapId}`) - 0.5) * jitterRange;
      return tactical + jitter;
    };
    return score(right) - score(left) || left.localeCompare(right);
  })[0];
}

const vetoSequence = (bestOf: 1 | 3 | 5, teamA: string, teamB: string): Array<{ action: 'ban' | 'pick'; actorId: string }> => {
  const actions: Array<'ban' | 'pick'> = bestOf === 1
    ? ['ban', 'ban', 'ban', 'ban', 'ban', 'ban']
    : bestOf === 3 ? ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'] : ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'];
  return actions.map((action, index) => ({ action, actorId: index % 2 === 0 ? teamA : teamB }));
};

export function createIncrementalMapVeto(options: {
  bestOf: 1 | 3 | 5;
  teamA: MapStrategy;
  teamB: MapStrategy;
  seed: string;
}): IncrementalMapVetoState {
  const available = MAP_POOL.filter((mapId) => options.teamA.familiarity[mapId] > 0 || options.teamB.familiarity[mapId] > 0);
  if (available.length < 7) throw new Error('A map veto requires at least seven maps known by one of the lineups');
  const steps: MapVetoStep[] = [];
  let preliminaryStep = 0;
  while (available.length > 7) {
    const actor = preliminaryStep % 2 === 0 ? options.teamA : options.teamB;
    const opponent = actor === options.teamA ? options.teamB : options.teamA;
    const mapId = chooseAutomaticVetoMap(options.seed, preliminaryStep, 'ban', actor, opponent, available);
    available.splice(available.indexOf(mapId), 1);
    steps.push({ order: steps.length + 1, action: 'ban', teamId: actor.teamId, mapId });
    preliminaryStep += 1;
  }
  return {
    ...options,
    available,
    sequence: vetoSequence(options.bestOf, options.teamA.teamId, options.teamB.teamId),
    cursor: 0,
    steps,
    finished: false
  };
}

export function getCurrentVetoAction(state: IncrementalMapVetoState) {
  return state.sequence[state.cursor] ?? null;
}

export function recommendVetoMap(state: IncrementalMapVetoState): MapId {
  const item = getCurrentVetoAction(state);
  if (!item) {
    if (state.available.length !== 1) throw new Error('Veto has no active action');
    return state.available[0];
  }
  const actor = item.actorId === state.teamA.teamId ? state.teamA : state.teamB;
  const opponent = actor === state.teamA ? state.teamB : state.teamA;
  return chooseAutomaticVetoMap(state.seed, state.steps.length, item.action, actor, opponent, state.available);
}

export function advanceIncrementalMapVeto(source: IncrementalMapVetoState, mapId = recommendVetoMap(source)): IncrementalMapVetoState {
  if (source.finished) return source;
  const state: IncrementalMapVetoState = { ...source, available: [...source.available], steps: [...source.steps] };
  const item = getCurrentVetoAction(state);
  if (!item || !state.available.includes(mapId)) throw new Error('Map is not legal for the current veto action');
  state.available.splice(state.available.indexOf(mapId), 1);
  state.steps.push({ order: state.steps.length + 1, action: item.action, teamId: item.actorId, mapId });
  state.cursor += 1;
  if (state.cursor >= state.sequence.length) {
    if (state.available.length !== 1) throw new Error('Veto did not leave exactly one decider');
    state.steps.push({ order: state.steps.length + 1, action: 'decider', teamId: null, mapId: state.available[0] });
    state.finished = true;
  }
  return state;
}

export function resolveMapVeto(options: {
  bestOf: 1 | 3 | 5;
  teamA: MapStrategy;
  teamB: MapStrategy;
  seed: string;
}): MapVetoResult {
  let state = createIncrementalMapVeto(options);
  while (!state.finished) state = advanceIncrementalMapVeto(state);

  return {
    steps: state.steps,
    playedMaps: state.steps.filter((step) => step.action !== 'ban').map((step) => step.mapId)
  };
}

export function createUserMapStrategy(
  teamId: string,
  selectedMaps: [MapId, MapId, MapId],
  players: Player[],
  teams: HistoricalTeam[]
): MapStrategy {
  const contributors = getLineupMapContributors(players, teams);
  const familiarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, getMapFamiliarity(contributors[mapId].length)])) as Record<MapId, number>;
  return { teamId, selectedMaps, affinities: getLineupMapAffinities(players, teams), familiarity, bot: false };
}

export function createBotMapStrategy(team: HistoricalTeam): MapStrategy {
  const selectedMaps = getTeamMapPreferences(team) as [MapId, MapId, MapId];
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  const activeMaps = getActiveDutyMapsForYear(team.year);
  const familiarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, activeMaps.includes(mapId) ? 100 : 0])) as Record<MapId, number>;
  for (const mapId of activeMaps) affinities[mapId] = '+++';
  return { teamId: team.id, selectedMaps, affinities, familiarity, bot: true };
}

export function getStrategyMapBonus(strategy: MapStrategy, mapId: MapId, mode: GameMode): number {
  if (!strategy.selectedMaps.includes(mapId)) return 0;
  return getSelectedMapPowerBonus(mode, strategy.affinities[mapId]);
}

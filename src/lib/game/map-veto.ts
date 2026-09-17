import {
  MAP_POOL,
  getActiveDutyMapsForYear,
  getLineupMapAffinities,
  getLineupMapContributors,
  getMapFamiliarity,
  getSelectedMapPowerBonus,
  getTeamMapPreferences
} from './maps';
import type { HistoricalTeam, MapAffinity, MapId, MapVetoStep, OnlineGameMode, Player, Roster } from './types';

export interface MapStrategy {
  teamId: string;
  selectedMaps: [MapId, MapId, MapId];
  affinities: Record<MapId, MapAffinity>;
  familiarity: Record<MapId, number>;
  bot: boolean;
}

export interface MapSimulationContext {
  mode: OnlineGameMode;
  seed: string;
  strategies: Map<string, MapStrategy>;
  /** Lineups by team id, used to generate the kill feed of every round. */
  rosters?: Map<string, Roster>;
}

export interface MapVetoResult {
  steps: MapVetoStep[];
  playedMaps: MapId[];
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
  // Familiarity matters on top of the declared affinity so a lineup bans what it has never played.
  return affinityScore[strategy.affinities[mapId]] * 4 + selectionScore + strategy.familiarity[mapId] / 50;
};

export function chooseMap(
  seed: string,
  step: number,
  action: 'ban' | 'pick',
  actor: MapStrategy,
  opponent: MapStrategy,
  available: readonly MapId[]
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

export const VETO_POOL_SIZE = 7;

/** Absolute floor: a BO3/BO5 decider needs at least this many maps (2 picks + 1 decider) to make sense. */
const MIN_VETO_POOL_SIZE = 3;

/**
 * The maps a veto is played on, like the active-duty pool of a real Major — normally seven, like the pool from 2016
 * on. Eras with a smaller real map pool (2013 had only five confirmed Active-Duty-equivalent maps — no Active Duty
 * group existed yet; see data/research/map-pools-2013-2015.json in cs13a0-management) play the veto on whatever
 * fewer maps both/either lineup actually knows, instead of padding with maps nobody from that year ever touched;
 * `buildVetoPlan` shrinks its ban sequence to match. Maps both lineups know come first, the most familiar ones when
 * more than seven are shared; a map only one side has ever played is added only when it is needed to reach seven.
 */
export function getVetoAvailableMaps(teamA: MapStrategy, teamB: MapStrategy): MapId[] {
  const combined = (mapId: MapId) => teamA.familiarity[mapId] + teamB.familiarity[mapId];
  const byFamiliarity = (left: MapId, right: MapId) => combined(right) - combined(left) || MAP_POOL.indexOf(left) - MAP_POOL.indexOf(right);
  const shared = MAP_POOL.filter((mapId) => teamA.familiarity[mapId] > 0 && teamB.familiarity[mapId] > 0);
  const oneSided = MAP_POOL
    .filter((mapId) => !shared.includes(mapId) && (teamA.familiarity[mapId] > 0 || teamB.familiarity[mapId] > 0))
    .sort(byFamiliarity);
  const available = shared.length >= VETO_POOL_SIZE
    ? [...shared].sort(byFamiliarity).slice(0, VETO_POOL_SIZE)
    : [...shared, ...oneSided.slice(0, VETO_POOL_SIZE - shared.length)];
  if (available.length < MIN_VETO_POOL_SIZE) throw new Error(`A map veto requires at least ${MIN_VETO_POOL_SIZE} maps known by one of the lineups`);
  return MAP_POOL.filter((mapId) => available.includes(mapId));
}

export interface VetoPlanStep {
  action: 'ban' | 'pick';
  actor: 'a' | 'b';
}

/**
 * The official sequence for the format on a seven-map pool: BO1 six alternating bans, BO3 ban/ban/pick/pick/ban/ban,
 * BO5 ban/ban/pick/pick/pick/pick; the last map is always the decider. Pools larger than seven get alternating
 * preliminary bans first, keeping the turn order continuous. Pools smaller than seven (early eras with a thinner
 * real map pool — see `getVetoAvailableMaps`) drop bans from the end of the sequence first, one at a time, never
 * touching a pick: a BO3 on five maps plays ban/ban/pick/pick/[decider] instead of inventing two bans nobody has a
 * map left to make.
 */
export function buildVetoPlan(bestOf: 1 | 3 | 5, availableCount: number): VetoPlanStep[] {
  const plan: VetoPlanStep[] = [];
  const push = (action: 'ban' | 'pick') => plan.push({ action, actor: plan.length % 2 === 0 ? 'a' : 'b' });
  for (let remaining = availableCount; remaining > VETO_POOL_SIZE; remaining -= 1) push('ban');
  const sequence: Array<'ban' | 'pick'> = bestOf === 1
    ? ['ban', 'ban', 'ban', 'ban', 'ban', 'ban']
    : bestOf === 3
      ? ['ban', 'ban', 'pick', 'pick', 'ban', 'ban']
      : ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'];
  const shrinkBy = Math.max(0, VETO_POOL_SIZE - availableCount);
  const trimmed = [...sequence];
  for (let removed = 0; removed < shrinkBy; removed += 1) {
    const lastBanIndex = trimmed.lastIndexOf('ban');
    if (lastBanIndex === -1) break; // no bans left to drop; the picks + decider already fit availableCount
    trimmed.splice(lastBanIndex, 1);
  }
  trimmed.forEach(push);
  return plan;
}

export function resolveMapVeto(options: {
  bestOf: 1 | 3 | 5;
  teamA: MapStrategy;
  teamB: MapStrategy;
  seed: string;
}): MapVetoResult {
  const available = getVetoAvailableMaps(options.teamA, options.teamB);
  const plan = buildVetoPlan(options.bestOf, available.length);
  const steps: MapVetoStep[] = [];
  plan.forEach((item, index) => {
    const actor = item.actor === 'a' ? options.teamA : options.teamB;
    const opponent = item.actor === 'a' ? options.teamB : options.teamA;
    const mapId = chooseMap(options.seed, index, item.action, actor, opponent, available);
    available.splice(available.indexOf(mapId), 1);
    steps.push({ order: steps.length + 1, action: item.action, teamId: actor.teamId, mapId });
  });
  steps.push({ order: steps.length + 1, action: 'decider', teamId: null, mapId: available[0] });

  return {
    steps,
    playedMaps: steps.filter((step) => step.action !== 'ban').map((step) => step.mapId)
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

export function getStrategyMapBonus(strategy: MapStrategy, mapId: MapId, mode: OnlineGameMode): number {
  if (!strategy.selectedMaps.includes(mapId)) return 0;
  return getSelectedMapPowerBonus(mode, strategy.affinities[mapId]);
}

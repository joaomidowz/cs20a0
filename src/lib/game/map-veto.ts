import { MAP_POOL, getLineupMapAffinities, getSelectedMapPowerBonus, getTeamMapPreferences } from './maps';
import type { GameMode, HistoricalTeam, MapAffinity, MapId, MapVetoStep, Player } from './types';

export interface MapStrategy {
  teamId: string;
  selectedMaps: [MapId, MapId, MapId];
  affinities: Record<MapId, MapAffinity>;
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

function chooseMap(
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

export function resolveMapVeto(options: {
  bestOf: 1 | 3 | 5;
  teamA: MapStrategy;
  teamB: MapStrategy;
  seed: string;
}): MapVetoResult {
  const sequence: Array<{ action: 'ban' | 'pick'; actor: MapStrategy; opponent: MapStrategy }> = options.bestOf === 1
    ? [
      { action: 'ban', actor: options.teamA, opponent: options.teamB },
      { action: 'ban', actor: options.teamB, opponent: options.teamA },
      { action: 'ban', actor: options.teamA, opponent: options.teamB },
      { action: 'ban', actor: options.teamB, opponent: options.teamA },
      { action: 'ban', actor: options.teamA, opponent: options.teamB },
      { action: 'ban', actor: options.teamB, opponent: options.teamA }
    ]
    : options.bestOf === 3
      ? [
        { action: 'ban', actor: options.teamA, opponent: options.teamB },
        { action: 'ban', actor: options.teamB, opponent: options.teamA },
        { action: 'pick', actor: options.teamA, opponent: options.teamB },
        { action: 'pick', actor: options.teamB, opponent: options.teamA },
        { action: 'ban', actor: options.teamA, opponent: options.teamB },
        { action: 'ban', actor: options.teamB, opponent: options.teamA }
      ]
      : [
        { action: 'ban', actor: options.teamA, opponent: options.teamB },
        { action: 'ban', actor: options.teamB, opponent: options.teamA },
        { action: 'pick', actor: options.teamA, opponent: options.teamB },
        { action: 'pick', actor: options.teamB, opponent: options.teamA },
        { action: 'pick', actor: options.teamA, opponent: options.teamB },
        { action: 'pick', actor: options.teamB, opponent: options.teamA }
      ];

  const available = [...MAP_POOL];
  const steps: MapVetoStep[] = [];
  for (const [index, item] of sequence.entries()) {
    const mapId = chooseMap(options.seed, index, item.action, item.actor, item.opponent, available);
    available.splice(available.indexOf(mapId), 1);
    steps.push({ order: index + 1, action: item.action, teamId: item.actor.teamId, mapId });
  }
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
  return { teamId, selectedMaps, affinities: getLineupMapAffinities(players, teams), bot: false };
}

export function createBotMapStrategy(team: HistoricalTeam): MapStrategy {
  const selectedMaps = getTeamMapPreferences(team) as [MapId, MapId, MapId];
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  affinities[selectedMaps[0]] = '++';
  affinities[selectedMaps[1]] = '+';
  affinities[selectedMaps[2]] = '+';
  return { teamId: team.id, selectedMaps, affinities, bot: true };
}

export function getStrategyMapBonus(strategy: MapStrategy, mapId: MapId, mode: GameMode): number {
  if (!strategy.selectedMaps.includes(mapId)) return 0;
  return getSelectedMapPowerBonus(mode, strategy.affinities[mapId]);
}

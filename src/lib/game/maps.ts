import type {
  GameMode,
  HistoricalMapRecord,
  HistoricalTeam,
  MapAffinity,
  MapId,
  MapPreference,
  Player,
  TeamMapProfile
} from './types';

export const MAP_POOL_VERSION = 'cs13a0-map-pool-v1';
export const MAP_POOL: readonly MapId[] = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke'];

export const MAP_NAMES: Record<MapId, string> = {
  ancient: 'Ancient',
  anubis: 'Anubis',
  cache: 'Cache',
  dust2: 'Dust II',
  inferno: 'Inferno',
  mirage: 'Mirage',
  nuke: 'Nuke'
};

const MAP_IDS = new Set<string>(MAP_POOL);

export const isMapId = (value: unknown): value is MapId => typeof value === 'string' && MAP_IDS.has(value);

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const fallbackOrder = (teamId: string, poolVersion = MAP_POOL_VERSION): MapId[] =>
  [...MAP_POOL].sort((left, right) =>
    stableHash(`${teamId}:${poolVersion}:${left}`) - stableHash(`${teamId}:${poolVersion}:${right}`) ||
    left.localeCompare(right)
  );

export function getFallbackMapPreferences(teamId: string, poolVersion = MAP_POOL_VERSION): [MapPreference, MapPreference, MapPreference] {
  const [first, second, third] = fallbackOrder(teamId, poolVersion);
  return [first, second, third].map((mapId) => ({ mapId, source: 'fallback' as const })) as [MapPreference, MapPreference, MapPreference];
}

const isEligibleRecord = (record: HistoricalMapRecord) =>
  isMapId(record.mapId) &&
  Number.isFinite(record.matches) &&
  record.matches >= 5 &&
  Number.isFinite(record.winRate);

const recordOrder = (left: HistoricalMapRecord, right: HistoricalMapRecord) =>
  Number(right.winRate) - Number(left.winRate) ||
  right.matches - left.matches ||
  left.mapId.localeCompare(right.mapId);

export function getTeamMapProfile(team: Pick<HistoricalTeam, 'id' | 'mapProfile'>): TeamMapProfile {
  const poolVersion = team.mapProfile?.poolVersion || MAP_POOL_VERSION;
  const records = (team.mapProfile?.records ?? [])
    .filter(isEligibleRecord)
    .sort(recordOrder);
  const preferences: MapPreference[] = [];

  for (const record of records) {
    if (!preferences.some((preference) => preference.mapId === record.mapId)) {
      preferences.push({ mapId: record.mapId, source: 'observed' });
    }
    if (preferences.length >= 3) break;
  }

  for (const preference of team.mapProfile?.preferences ?? []) {
    const observedIsEligible = preference.source !== 'observed' || records.some((record) => record.mapId === preference.mapId);
    if (observedIsEligible && isMapId(preference.mapId) && !preferences.some((item) => item.mapId === preference.mapId)) {
      preferences.push({ mapId: preference.mapId, source: preference.source === 'observed' ? 'observed' : 'fallback' });
    }
    if (preferences.length >= 3) break;
  }

  for (const fallback of getFallbackMapPreferences(team.id, poolVersion)) {
    if (preferences.length >= 3) break;
    if (!preferences.some((preference) => preference.mapId === fallback.mapId)) preferences.push(fallback);
  }

  return {
    poolVersion,
    records,
    preferences: preferences as [MapPreference, MapPreference, MapPreference]
  };
}

export const getTeamMapPreferences = (team: Pick<HistoricalTeam, 'id' | 'mapProfile'>): MapId[] =>
  getTeamMapProfile(team).preferences.map((preference) => preference.mapId);

export function getLineupMapContributors(players: Player[], teams: HistoricalTeam[]): Record<MapId, Player[]> {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const contributors: Record<MapId, Player[]> = {
    ancient: [],
    anubis: [],
    cache: [],
    dust2: [],
    inferno: [],
    mirage: [],
    nuke: []
  };

  for (const player of players) {
    if (!player.teamId) continue;
    const team = teamById.get(player.teamId);
    if (!team) continue;
    for (const mapId of getTeamMapPreferences(team)) contributors[mapId].push(player);
  }

  return contributors;
}

export function getMapAffinity(contributorCount: number): MapAffinity {
  if (contributorCount >= 4) return '+++';
  if (contributorCount === 3) return '++';
  if (contributorCount === 2) return '+';
  return 'EVEN';
}

export function getLineupMapAffinities(players: Player[], teams: HistoricalTeam[]): Record<MapId, MapAffinity> {
  const contributors = getLineupMapContributors(players, teams);
  return Object.fromEntries(MAP_POOL.map((mapId) => [mapId, getMapAffinity(contributors[mapId].length)])) as Record<MapId, MapAffinity>;
}

export function getDefaultMapSelection(players: Player[], teams: HistoricalTeam[]): [MapId, MapId, MapId] {
  const contributors = getLineupMapContributors(players, teams);
  return [...MAP_POOL]
    .sort((left, right) => contributors[right].length - contributors[left].length || left.localeCompare(right))
    .slice(0, 3) as [MapId, MapId, MapId];
}

export const isValidMapSelection = (maps: readonly unknown[]): maps is [MapId, MapId, MapId] =>
  maps.length === 3 && maps.every(isMapId) && new Set(maps).size === 3;

export function getSelectedMapPowerBonus(mode: GameMode, affinity: MapAffinity): number {
  if (affinity === 'EVEN') return 0;
  const strong = mode === 'faceit' || mode === 'pro';
  if (affinity === '+') return strong ? 1.5 : 0.5;
  if (affinity === '++') return strong ? 3 : 1;
  return strong ? 4.5 : 1.5;
}

export const getMapName = (mapId: MapId | undefined, fallbackNumber?: number, fallbackLabel = 'Mapa') =>
  mapId ? MAP_NAMES[mapId] : fallbackNumber === undefined ? '' : `${fallbackLabel} ${fallbackNumber}`;

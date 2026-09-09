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

export const MAP_POOL_VERSION = 'cs13a0-historical-active-duty-v2';

export const ACTIVE_DUTY_MAPS: readonly MapId[] = [
  'ancient', 'anubis', 'cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'
];

// Static yearly unions derived from Valve's published pool changes:
// 2016 https://blog.counter-strike.net/2016/04/14014/ · 2017 https://blog.counter-strike.net/2017/02/17867/
// 2018 https://blog.counter-strike.net/2018/04/20344/ · 2019 https://blog.counter-strike.net/2019/03/23717/
// 2021 https://blog.counter-strike.net/2021/05/34057/ · 2022 https://blog.counter-strike.net/2022/11/40368/
// 2025 https://www.counter-strike.net/newsentry/529852487375519749 · 2026 https://www.counter-strike.net/newsentry/511855214544814590
export const ACTIVE_DUTY_POOLS_BY_YEAR: Readonly<Record<number, readonly MapId[]>> = {
  2016: ['cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train'],
  2017: ['cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train'],
  2018: ['cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train'],
  2019: ['cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'],
  2020: ['dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'],
  2021: ['ancient', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'],
  2022: ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'vertigo'],
  2023: ['ancient', 'anubis', 'inferno', 'mirage', 'nuke', 'overpass', 'vertigo'],
  2024: ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'vertigo'],
  2025: ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo'],
  2026: ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train']
};

/** Public alias retained for simulation and presentation consumers. */
export const MAP_POOL = ACTIVE_DUTY_MAPS;

export const MAP_NAMES: Record<MapId, string> = {
  ancient: 'Ancient', anubis: 'Anubis', cache: 'Cache', cobblestone: 'Cobblestone', dust2: 'Dust II', inferno: 'Inferno',
  mirage: 'Mirage', nuke: 'Nuke', overpass: 'Overpass', train: 'Train', vertigo: 'Vertigo'
};

const MAP_IDS = new Set<string>(ACTIVE_DUTY_MAPS);
export const isMapId = (value: unknown): value is MapId => typeof value === 'string' && MAP_IDS.has(value);
export const getActiveDutyMapsForYear = (year: number | null | undefined): readonly MapId[] =>
  year === null || year === undefined ? [] : ACTIVE_DUTY_POOLS_BY_YEAR[year] ?? [];

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const fallbackOrder = (teamId: string, poolVersion = MAP_POOL_VERSION, candidates: readonly MapId[] = ACTIVE_DUTY_MAPS): MapId[] =>
  [...candidates].sort((left, right) => stableHash(`${teamId}:${poolVersion}:${left}`) - stableHash(`${teamId}:${poolVersion}:${right}`) || left.localeCompare(right));

export function getFallbackMapPreferences(
  teamId: string,
  poolVersion = MAP_POOL_VERSION,
  candidates: readonly MapId[] = ACTIVE_DUTY_MAPS
): [MapPreference, MapPreference, MapPreference] {
  const [first, second, third] = fallbackOrder(teamId, poolVersion, candidates);
  return [first, second, third].map((mapId) => ({ mapId, source: 'fallback' as const })) as [MapPreference, MapPreference, MapPreference];
}

const isEligibleRecord = (record: HistoricalMapRecord) =>
  isMapId(record.mapId) && Number.isFinite(record.matches) && record.matches >= 5 && Number.isFinite(record.winRate);
const recordOrder = (left: HistoricalMapRecord, right: HistoricalMapRecord) =>
  Number(right.winRate) - Number(left.winRate) || right.matches - left.matches || left.mapId.localeCompare(right.mapId);

export function getTeamMapProfile(team: Pick<HistoricalTeam, 'id' | 'year' | 'mapProfile'>): TeamMapProfile {
  const poolVersion = team.mapProfile?.poolVersion || MAP_POOL_VERSION;
  const yearPool = getActiveDutyMapsForYear(team.year);
  const candidates = yearPool.length ? yearPool : ACTIVE_DUTY_MAPS;
  const candidateSet = new Set(candidates);
  const records = (team.mapProfile?.records ?? []).filter((record) => candidateSet.has(record.mapId) && isEligibleRecord(record)).sort(recordOrder);
  const preferences: MapPreference[] = [];
  for (const record of records) {
    if (!preferences.some((preference) => preference.mapId === record.mapId)) preferences.push({ mapId: record.mapId, source: 'observed' });
    if (preferences.length >= 3) break;
  }
  for (const preference of team.mapProfile?.preferences ?? []) {
    const observedIsEligible = preference.source !== 'observed' || records.some((record) => record.mapId === preference.mapId);
    if (observedIsEligible && candidateSet.has(preference.mapId) && !preferences.some((item) => item.mapId === preference.mapId)) {
      preferences.push({ mapId: preference.mapId, source: preference.source === 'observed' ? 'observed' : 'fallback' });
    }
    if (preferences.length >= 3) break;
  }
  for (const fallback of getFallbackMapPreferences(team.id, poolVersion, candidates)) {
    if (preferences.length >= 3) break;
    if (!preferences.some((preference) => preference.mapId === fallback.mapId)) preferences.push(fallback);
  }
  return { poolVersion, records, preferences: preferences as [MapPreference, MapPreference, MapPreference] };
}

export const getTeamMapPreferences = (team: Pick<HistoricalTeam, 'id' | 'year' | 'mapProfile'>): MapId[] =>
  getTeamMapProfile(team).preferences.map((preference) => preference.mapId);

const emptyMapRecord = <Value>(create: () => Value): Record<MapId, Value> =>
  Object.fromEntries(ACTIVE_DUTY_MAPS.map((mapId) => [mapId, create()])) as Record<MapId, Value>;

export function getLineupMapContributors(players: Player[], teams: HistoricalTeam[]): Record<MapId, Player[]> {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const contributors = emptyMapRecord<Player[]>(() => []);
  for (const player of players) {
    const originYear = (player.teamId ? teamById.get(player.teamId)?.year : null) ?? player.year;
    for (const mapId of getActiveDutyMapsForYear(originYear)) contributors[mapId].push(player);
  }
  return contributors;
}

export function getLineupMapYears(players: Player[], teams: HistoricalTeam[]): Record<MapId, number[]> {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const years = emptyMapRecord<number[]>(() => []);
  for (const player of players) {
    const originYear = (player.teamId ? teamById.get(player.teamId)?.year : null) ?? player.year;
    if (originYear === null || originYear === undefined) continue;
    for (const mapId of getActiveDutyMapsForYear(originYear)) if (!years[mapId].includes(originYear)) years[mapId].push(originYear);
  }
  for (const mapId of ACTIVE_DUTY_MAPS) years[mapId].sort((left, right) => left - right);
  return years;
}

export const getMapFamiliarity = (contributorCount: number) => Math.max(0, Math.min(5, contributorCount)) * 20;

export function getMapAffinity(contributorCount: number): MapAffinity {
  if (contributorCount >= 4) return '+++';
  if (contributorCount >= 3) return '++';
  if (contributorCount >= 2) return '+';
  return 'EVEN';
}

export function getLineupMapAffinities(players: Player[], teams: HistoricalTeam[]): Record<MapId, MapAffinity> {
  const contributors = getLineupMapContributors(players, teams);
  return Object.fromEntries(ACTIVE_DUTY_MAPS.map((mapId) => [mapId, getMapAffinity(contributors[mapId].length)])) as Record<MapId, MapAffinity>;
}

export function getDefaultMapSelection(players: Player[], teams: HistoricalTeam[]): [MapId, MapId, MapId] {
  const contributors = getLineupMapContributors(players, teams);
  const lineupSeed = players.map((player) => player.id).sort().join('|');
  const maxOverall = (mapId: MapId) => Math.max(...contributors[mapId].map((player) => Number(player.overall) || 0), 0);
  return [...ACTIVE_DUTY_MAPS]
    .filter((mapId) => contributors[mapId].length > 0)
    .sort((left, right) => contributors[right].length - contributors[left].length || maxOverall(right) - maxOverall(left) ||
      stableHash(`${lineupSeed}:${left}`) - stableHash(`${lineupSeed}:${right}`) || left.localeCompare(right))
    .slice(0, 3) as [MapId, MapId, MapId];
}

export const isValidMapSelection = (maps: readonly unknown[]): maps is [MapId, MapId, MapId] =>
  maps.length === 3 && maps.every(isMapId) && new Set(maps).size === 3;

export const isValidLineupMapSelection = (maps: readonly unknown[], players: Player[], teams: HistoricalTeam[]): maps is [MapId, MapId, MapId] => {
  if (!isValidMapSelection(maps)) return false;
  const contributors = getLineupMapContributors(players, teams);
  return maps.every((mapId) => contributors[mapId].length > 0);
};

export function getSelectedMapPowerBonus(mode: GameMode, affinity: MapAffinity): number {
  if (affinity === 'EVEN') return 0;
  const level = affinity === '+' ? 1 : affinity === '++' ? 2 : 3;
  return level * (mode === 'faceit' || mode === 'pro' ? 1.5 : 0.5);
}

export const getMapName = (mapId: MapId | undefined, fallbackNumber?: number, fallbackLabel = 'Mapa') =>
  mapId ? MAP_NAMES[mapId] : fallbackNumber === undefined ? '' : `${fallbackLabel} ${fallbackNumber}`;

/**
 * How much each map favours the CT side per round (positive = CT-sided). Small on purpose: sides tilt a round,
 * they do not decide it. Values follow community win-rate splits of the active-duty era each map belongs to.
 */
export const MAP_SIDE_BIAS: Record<MapId, number> = {
  nuke: 0.06,
  train: 0.05,
  overpass: 0.03,
  ancient: 0.03,
  inferno: 0.02,
  mirage: 0.02,
  vertigo: 0.02,
  anubis: 0,
  dust2: -0.01,
  cache: -0.01,
  cobblestone: -0.02
};

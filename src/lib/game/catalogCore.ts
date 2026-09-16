import {
  coachById as coreCoachById,
  coachByTeamId as coreCoachByTeamId,
  coaches as coreCoaches,
  getTeamPlayers as coreGetTeamPlayers,
  playerById as corePlayerById,
  players as corePlayers,
  teamById as coreTeamById,
  teams as coreTeams
} from './data';
import type { CatalogVersion, Coach, HistoricalTeam, Player } from './types';

/**
 * Pure part of the versioned historical catalog: types, version helpers, `buildCatalog` and the memoized `core`
 * catalog built on the exact `data.ts` references. This module never imports the expansion files, so the components
 * shared with `/online` (through `catalogContext.ts`) can depend on it without pulling the expansion into the online
 * bundle; `tests/catalogGuards.test.ts` walks the online import graph to enforce that. `catalog.ts` adds the expansion.
 */
export const CURRENT_CATALOG_VERSION: CatalogVersion = 'x1';
export const CATALOG_VERSIONS: readonly CatalogVersion[] = ['core', 'x1'];

export const isCatalogVersion = (value: unknown): value is CatalogVersion =>
  typeof value === 'string' && (CATALOG_VERSIONS as readonly string[]).includes(value);

/** Version of a save or a shared link; anything missing or unknown replays on `core`. */
export const parseCatalogVersion = (value: unknown): CatalogVersion => (isCatalogVersion(value) ? value : 'core');

/** Raw data of one catalog layer (core or expansion). */
export interface CatalogSource {
  teams: HistoricalTeam[];
  players: Player[];
  coaches: Coach[];
}

export interface Catalog {
  version: CatalogVersion;
  /** Every team-year, core first. Includes qualifier and retired entries. */
  teams: HistoricalTeam[];
  /** Every player card, core first. Includes retired cards. */
  players: Player[];
  coaches: Coach[];
  teamById: Map<string, HistoricalTeam>;
  playerById: Map<string, Player>;
  coachById: Map<string, Coach>;
  coachByTeamId: Map<string, Coach>;
  /** Roster of every team in `team.players` order (only ids that resolve). */
  rosterByTeamId: Map<string, Player[]>;
  /** Team-years the offline draft rolls from: main event, not retired, five resolvable players. */
  draftTeams: HistoricalTeam[];
  /** Team-years the offline Major and circuit fields draw opponents from (same rule as the draft). */
  botTeams: HistoricalTeam[];
  /** Roster of a team (a fresh array each call, like `data.getTeamPlayers`). */
  getTeamPlayers: (team: HistoricalTeam | null) => Player[];
}

export const isMainEventTeam = (team: HistoricalTeam) => (team.eventLevel ?? 'main') === 'main';
export const isRetired = (entry: { retired?: boolean }) => entry.retired === true;

const byYearThenId = <T extends { id: string; year?: number | null }>(left: T, right: T) =>
  (left.year ?? 0) - (right.year ?? 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

const sortedByYearThenId = <T extends { id: string; year?: number | null }>(entries: T[]) => [...entries].sort(byYearThenId);

/** Roster in `team.players` order, exactly like `csData.getPlayersByTeam` (the ids that fail to resolve are dropped). */
const rosterOf = (team: HistoricalTeam, playerById: Map<string, Player>, players: Player[]) => {
  if (team.players?.length) return team.players.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
  return players.filter((player) => player.teamId === team.id);
};

const isDraftable = (team: HistoricalTeam, rosterByTeamId: Map<string, Player[]>) =>
  isMainEventTeam(team) && !isRetired(team) && (team.players ?? []).length === 5 && rosterByTeamId.get(team.id)?.length === 5;

interface CatalogMaps {
  teamById: Map<string, HistoricalTeam>;
  playerById: Map<string, Player>;
  coachById: Map<string, Coach>;
  coachByTeamId: Map<string, Coach>;
}

const assemble = (version: CatalogVersion, source: CatalogSource, maps: CatalogMaps): Catalog => {
  const rosterByTeamId = new Map(source.teams.map((team) => [team.id, rosterOf(team, maps.playerById, source.players)]));
  const eligible = source.teams.filter((team) => isDraftable(team, rosterByTeamId));
  return {
    version,
    teams: source.teams,
    players: source.players,
    coaches: source.coaches,
    ...maps,
    rosterByTeamId,
    draftTeams: eligible,
    botTeams: [...eligible],
    getTeamPlayers: (team) => (team ? [...(rosterByTeamId.get(team.id) ?? [])] : [])
  };
};

/**
 * Pure: core followed by the expansion (each expansion layer sorted by year then id), with the draft and bot pools
 * filtered by event level, retirement and roster size. Ids must be unique across the two layers
 * (`tests/catalogIntegrity.test.ts` checks the real files); on a clash the core entry wins the lookup.
 */
export function buildCatalog(core: CatalogSource, expansion: CatalogSource, version: CatalogVersion = 'x1'): Catalog {
  const teams = [...core.teams, ...sortedByYearThenId(expansion.teams)];
  const players = [...core.players, ...sortedByYearThenId(expansion.players)];
  const coaches = [...core.coaches, ...sortedByYearThenId(expansion.coaches)];
  const firstById = <T extends { id: string }>(entries: T[]) => {
    const map = new Map<string, T>();
    for (const entry of entries) if (!map.has(entry.id)) map.set(entry.id, entry);
    return map;
  };
  const coachByTeamId = new Map<string, Coach>();
  for (const coach of coaches) if (!coachByTeamId.has(coach.teamId)) coachByTeamId.set(coach.teamId, coach);
  return assemble(version, { teams, players, coaches }, {
    teamById: firstById(teams),
    playerById: firstById(players),
    coachById: firstById(coaches),
    coachByTeamId
  });
}

export const CORE_SOURCE: CatalogSource = { teams: coreTeams, players: corePlayers, coaches: coreCoaches };

let coreCatalog: Catalog | null = null;

/** `core` reuses the arrays and maps of `data.ts` as they are (same references, same order, secret players included in `playerById`). */
export function getCoreCatalog(): Catalog {
  if (coreCatalog) return coreCatalog;
  const catalog = assemble('core', CORE_SOURCE, {
    teamById: coreTeamById,
    playerById: corePlayerById,
    coachById: coreCoachById,
    coachByTeamId: coreCoachByTeamId
  });
  coreCatalog = { ...catalog, getTeamPlayers: coreGetTeamPlayers };
  return coreCatalog;
}

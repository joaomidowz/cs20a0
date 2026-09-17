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
import { normalizeFlagCode } from './visuals/flags';

/**
 * Pure part of the versioned historical catalog: types, version helpers, `buildCatalog` and the memoized `core`
 * catalog built on the exact `data.ts` references. This module never imports the expansion files, so the components
 * shared with `/online` (through `catalogContext.ts`) can depend on it without pulling the expansion into the online
 * bundle; `tests/catalogGuards.test.ts` walks the online import graph to enforce that. `catalog.ts` adds the expansion.
 */
export const CURRENT_CATALOG_VERSION: CatalogVersion = 'x1';

/**
 * Identity layer of the expansion (`identities.game.json`): countries as flag-icons codes (ISO 3166-1 alpha-2,
 * lowercase) keyed by player base id and by organization id, and the organization of each team-year. `core` never
 * carries one (every lookup answers null), so `/online` shows no flags and never bundles the file.
 */
export interface CatalogIdentities {
  players: Record<string, { country?: string | null }>;
  orgs: Record<string, { country?: string | null; name?: string | null }>;
  teamOrg: Record<string, string>;
}

export const EMPTY_IDENTITIES: CatalogIdentities = { players: {}, orgs: {}, teamOrg: {} };
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
  /** Organization id of a team-year in the identity layer, or null when unknown (`core`: always null). */
  teamOrgId: (team: Pick<HistoricalTeam, 'id'> | null | undefined) => string | null;
  /** Flag code of the organization of a team-year, or null when unknown (`core`: always null). */
  teamCountry: (team: Pick<HistoricalTeam, 'id'> | null | undefined) => string | null;
  /**
   * Flag code of a player card of THIS catalog (looked up by base id), or null. Cards outside the catalog (career
   * world players, whose ids are never in `playerById`) always answer null, so the career screens show no flags.
   */
  playerCountry: (player: Pick<Player, 'id'> | null | undefined) => string | null;
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

const assemble = (version: CatalogVersion, source: CatalogSource, maps: CatalogMaps, identities: CatalogIdentities): Catalog => {
  const rosterByTeamId = new Map(source.teams.map((team) => [team.id, rosterOf(team, maps.playerById, source.players)]));
  const eligible = source.teams.filter((team) => isDraftable(team, rosterByTeamId));
  const teamOrgId: Catalog['teamOrgId'] = (team) => (team ? (identities.teamOrg[team.id] ?? null) : null);
  return {
    version,
    teams: source.teams,
    players: source.players,
    coaches: source.coaches,
    ...maps,
    rosterByTeamId,
    draftTeams: eligible,
    botTeams: [...eligible],
    getTeamPlayers: (team) => (team ? [...(rosterByTeamId.get(team.id) ?? [])] : []),
    teamOrgId,
    teamCountry: (team) => {
      const orgId = teamOrgId(team);
      return orgId ? normalizeFlagCode(identities.orgs[orgId]?.country) : null;
    },
    playerCountry: (player) => {
      const card = player ? maps.playerById.get(player.id) : undefined;
      return card?.baseId ? normalizeFlagCode(identities.players[card.baseId]?.country) : null;
    }
  };
};

/**
 * Pure: core followed by the expansion (each expansion layer sorted by year then id), with the draft and bot pools
 * filtered by event level, retirement and roster size. Ids must be unique across the two layers
 * (`tests/catalogIntegrity.test.ts` checks the real files); on a clash the core entry wins the lookup.
 * `identities` feeds the country and organization lookups; omitted, every lookup answers null.
 */
export function buildCatalog(
  core: CatalogSource,
  expansion: CatalogSource,
  version: CatalogVersion = 'x1',
  identities: CatalogIdentities = EMPTY_IDENTITIES
): Catalog {
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
  return assemble(
    version,
    { teams, players, coaches },
    {
      teamById: firstById(teams),
      playerById: firstById(players),
      coachById: firstById(coaches),
      coachByTeamId
    },
    identities
  );
}

export const CORE_SOURCE: CatalogSource = { teams: coreTeams, players: corePlayers, coaches: coreCoaches };

let coreCatalog: Catalog | null = null;

/** `core` reuses the arrays and maps of `data.ts` as they are (same references, same order, secret players included in `playerById`). */
export function getCoreCatalog(): Catalog {
  if (coreCatalog) return coreCatalog;
  const catalog = assemble(
    'core',
    CORE_SOURCE,
    {
      teamById: coreTeamById,
      playerById: corePlayerById,
      coachById: coreCoachById,
      coachByTeamId: coreCoachByTeamId
    },
    EMPTY_IDENTITIES
  );
  coreCatalog = { ...catalog, getTeamPlayers: coreGetTeamPlayers };
  return coreCatalog;
}

import coachesExpansionJson from '$lib/data/cs/coaches.expansion.game.json';
import playersExpansionJson from '$lib/data/cs/players.expansion.game.json';
import teamsExpansionJson from '$lib/data/cs/teams.expansion.game.json';
import { readable, type Readable } from 'svelte/store';
import { buildCatalog, CORE_SOURCE, getCoreCatalog, type Catalog, type CatalogSource } from './catalogCore';
import type { CatalogVersion, Coach, HistoricalTeam, Player } from './types';

/**
 * Versioned historical catalog of the OFFLINE modes.
 *
 * `core` is the v1 dataset (`data.ts`), the one the online mode is frozen on until its coordinated deploy: it reuses
 * the exact arrays and maps of `data.ts`, so anything built on it is byte-identical to today. `x1` is core followed by
 * the expansion (Majors 2013–2026 main events and official qualifiers), appended after core sorted by year then id, so
 * every core index is stable and expansion ids are append-only. Only main-event, non-retired team-years with a full
 * roster enter the draft (`draftTeams`) and the bot opponent field (`botTeams`); qualifier and retired team-years stay
 * resolvable by id for `/teams`, the sandbox and old saves.
 *
 * This is the only module that imports the expansion files. Nothing inside the online boundary (`src/routes/online`,
 * `src/lib/game/online`, `server`) may reach it, directly or through shared components: `tests/catalogGuards.test.ts`
 * walks the online import graph to enforce it. The pure part lives in `catalogCore.ts` and is re-exported here.
 */
export * from './catalogCore';
export { playerTitle } from './data';

export const EXPANSION_SOURCE: CatalogSource = {
  teams: teamsExpansionJson as HistoricalTeam[],
  players: playersExpansionJson as Player[],
  coaches: coachesExpansionJson as Coach[]
};

const catalogs = new Map<CatalogVersion, Catalog>();

export function getCatalog(version: CatalogVersion): Catalog {
  if (version === 'core') return getCoreCatalog();
  const cached = catalogs.get(version);
  if (cached) return cached;
  const built = buildCatalog(CORE_SOURCE, EXPANSION_SOURCE, version);
  catalogs.set(version, built);
  return built;
}

/** Store of the catalog stamped on a run; only emits when the version actually changes (catalogs are memoized). */
export function catalogStoreOf(source: Readable<{ catalogVersion?: CatalogVersion }>): Readable<Catalog> {
  return readable<Catalog>(undefined as unknown as Catalog, (set) => {
    let current: Catalog | null = null;
    return source.subscribe((state) => {
      const next = getCatalog(state.catalogVersion ?? 'core');
      if (next === current) return;
      current = next;
      set(next);
    });
  });
}

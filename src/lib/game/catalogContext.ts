import { getContext, setContext } from 'svelte';
import { readable, type Readable } from 'svelte/store';
import { getCoreCatalog, type Catalog } from './catalogCore';

/**
 * Svelte context of the catalog a page runs on, for the components shared between the offline screens and `/online`
 * (DraftHud, RunStatsGrid, TeamRosterModal, TeamCard). Offline pages set it; `/online` never does, so those components
 * fall back to `core` there and keep exactly today's behavior without touching the online boundary.
 *
 * Depends only on `catalogCore.ts`: the expansion files must never reach the online bundle through these components.
 */
const CATALOG_CONTEXT = Symbol('catalog');

let coreFallback: Readable<Catalog> | null = null;

/** Must run during component initialization, like any `setContext`. Returns the store for convenience. */
export function setCatalogContext(catalog: Readable<Catalog>): Readable<Catalog> {
  setContext(CATALOG_CONTEXT, catalog);
  return catalog;
}

/** The page's catalog store, or a static `core` store when no page set one (the `/online` case). */
export function getCatalogContext(): Readable<Catalog> {
  const store = getContext<Readable<Catalog> | undefined>(CATALOG_CONTEXT);
  if (store) return store;
  coreFallback ??= readable(getCoreCatalog());
  return coreFallback;
}

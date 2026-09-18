import type { LineupSlotRole, OrgStyle } from '../types';
import { authFetch } from './account';
import type { PackTier } from './collection-rules';

export interface CollectionState {
  wallet: number;
  count: number;
  players: Array<{ playerId: string; acquiredAt: string }>;
  packsToday: { granted: number; opened: number };
  lineup: SavedLineup | null;
}

export interface SavedLineup {
  playerIds: string[];
  roles: LineupSlotRole[];
  starPlayerId: string | null;
  coachId: string | null;
  style: OrgStyle;
  starEffective: boolean;
}

export interface PackOpened {
  tier: PackTier;
  seed: string;
  players: string[];
  duplicates: string[];
  coinsFromDupes: number;
  wallet: number;
}

export const fetchCollection = (serverUrl: string) => authFetch<CollectionState>(serverUrl, '/collection');
export const openDailyPack = (serverUrl: string) => authFetch<PackOpened>(serverUrl, '/packs/open', { body: {} });
export const buyPack = (serverUrl: string, tier: Exclude<PackTier, 'basic'>, year?: number) => authFetch<PackOpened>(serverUrl, '/packs/buy', { body: { tier, ...(year ? { year } : {}) } });
export const sellCard = (serverUrl: string, playerId: string) => authFetch<{ coins: number; wallet: number }>(serverUrl, '/collection/sell', { body: { playerId } });
export const saveLineup = (serverUrl: string, lineup: Omit<SavedLineup, 'starEffective'>) => authFetch<{ lineup: SavedLineup }>(serverUrl, '/lineup', { method: 'PUT', body: lineup });

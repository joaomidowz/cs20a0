import type { LineupSlotRole, MapId, OrgStyle } from '../types';
import { authFetch } from './account';
import type { PackTier, PromoTier } from './collection-rules';

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
  mapPreferences?: MapId[] | null;
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

export interface MissionState {
  id: string;
  scope: 'daily' | 'weekly' | 'season' | 'solo';
  target: number;
  progress: number;
  coins: number;
  packs: number;
  claimed: boolean;
  resetsAt: string;
}

export const fetchMissions = (serverUrl: string) => authFetch<{ missions: MissionState[]; soloStreak: { current: number; best: number } }>(serverUrl, '/missions');
export const claimMission = (serverUrl: string, missionId: string) => authFetch<{ coins: number; packs: number; wallet: number }>(serverUrl, `/missions/${missionId}/claim`, { body: {} });
export const startSolo = (serverUrl: string, field: 'random' | 'champions') => authFetch<{ roomCode: string; lineupTicket: string }>(serverUrl, '/solo', { body: { field } });

export interface UpgradeOutcome {
  won: boolean;
  chance: number;
  roll: number;
  seed: string;
  target: string;
  returned: string | null;
}

export const upgradeCards = (serverUrl: string, stake: string[], target: string) => authFetch<UpgradeOutcome>(serverUrl, '/upgrader', { body: { stake, target } });

export interface PromoOffer {
  tier: PromoTier;
  price: number;
  bought: boolean;
}

export const fetchPromos = (serverUrl: string) => authFetch<{ day: string; endsAt: string; promos: PromoOffer[] }>(serverUrl, '/promos');
export const buyPromo = (serverUrl: string, tier: PromoTier) => authFetch<PackOpened>(serverUrl, '/promos/buy', { body: { tier } });

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export interface TradeItem {
  id: string;
  direction: 'sent' | 'received';
  partner: string;
  offeredCard: string;
  requestedCard: string;
  coins: number;
  status: TradeStatus;
  createdAt: string;
  expiresAt: string;
}

export const fetchTrades = (serverUrl: string) => authFetch<{ received: TradeItem[]; sent: TradeItem[] }>(serverUrl, '/trades');
export const fetchTradePartner = (serverUrl: string, teamName: string) => authFetch<{ teamName: string; cards: string[] }>(serverUrl, `/trades/partner?teamName=${encodeURIComponent(teamName)}`);
export const proposeTrade = (serverUrl: string, input: { teamName: string; offeredCard: string; requestedCard: string; coins: number }) => authFetch<{ id: string }>(serverUrl, '/trades', { body: input });
export const answerTrade = (serverUrl: string, id: string, action: 'accept' | 'decline' | 'cancel') => authFetch<{ wallet?: number }>(serverUrl, `/trades/${encodeURIComponent(id)}/${action}`, { body: {} });

import type { CollectionSlotRole } from './collection-lineup';
import type { LineupSlotRole, MapId, OrgStyle } from '../types';
import { authFetch } from './account';
import { patchWalletCoins, setWalletFromCollection } from './wallet';

/** Every response that carries the new balance also updates the shared wallet bar. */
const withWallet = <T extends { wallet: number }>(request: Promise<T>) => request.then((result) => { patchWalletCoins(result.wallet); return result; });
import type { FreePackTier, PackTier, PromoTier } from './collection-rules';

export interface CollectionState {
  wallet: number;
  count: number;
  players: Array<{ playerId: string; acquiredAt: string }>;
  packsToday: { granted: number; opened: number };
  /** Free Prata (weekly) and Ouro (monthly) packs still available; missing on an older server. */
  freePacks?: Record<FreePackTier, boolean>;
  /** Sealed Major crates (one per ranked run) and the oldest one's tier; missing on an older server. */
  majorPacks?: number;
  majorPackTier?: PackTier | null;
  /** The ACTIVE lineup: the one that plays (kept for older servers). */
  lineup: SavedLineup | null;
  /** Every saved lineup by slot, how many slots are unlocked and which one plays; missing on an older server. */
  lineups?: SavedLineup[];
  unlockedSlots?: number;
  activeSlot?: number;
}

export interface SavedLineup {
  /** Which lineup slot this team occupies (absent on an older server: the single slot, 0). */
  slotIndex?: number;
  playerIds: string[];
  roles: CollectionSlotRole[];
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

/** Cards fielded on ANY saved lineup (the five players and the coach of every slot): the server refuses to stake, trade or sell them, so the store hides them all — not just the active slot. */
export const lineupLockedIds = (state: CollectionState | null | undefined): string[] =>
  (state?.lineups ?? (state?.lineup ? [state.lineup] : [])).flatMap((lineup) => [...lineup.playerIds, ...(lineup.coachId ? [lineup.coachId] : [])]);

export const fetchCollection = (serverUrl: string) => authFetch<CollectionState>(serverUrl, '/collection').then((state) => { setWalletFromCollection(state); return state; });
export const openDailyPack = (serverUrl: string) => withWallet(authFetch<PackOpened>(serverUrl, '/packs/open', { body: {} }));
export const openFreePack = (serverUrl: string, tier: FreePackTier) => withWallet(authFetch<PackOpened>(serverUrl, '/packs/free', { body: { tier } }));
/** Opens the oldest sealed Major crate; the server picks the tier from that run's placement. */
export const openMajorPack = (serverUrl: string) => withWallet(authFetch<PackOpened & { roomCode: string }>(serverUrl, '/packs/major', { body: {} }));
export const buyPack = (serverUrl: string, tier: Exclude<PackTier, 'basic'>, year?: number, role?: LineupSlotRole, organization?: string) => withWallet(authFetch<PackOpened>(serverUrl, '/packs/buy', { body: { tier, ...(year ? { year } : {}), ...(role ? { role } : {}), ...(organization ? { organization } : {}) } }));
export const sellCard = (serverUrl: string, playerId: string) => withWallet(authFetch<{ coins: number; wallet: number }>(serverUrl, '/collection/sell', { body: { playerId } }));
export const saveLineup = (serverUrl: string, lineup: Omit<SavedLineup, 'starEffective'>, slot?: number) => authFetch<{ lineup: SavedLineup }>(serverUrl, '/lineup', { method: 'PUT', body: slot === undefined ? lineup : { ...lineup, slot } });
/** Switches which lineup slot plays (queue, solo and rooms use the active one). */
export const setActiveLineup = (serverUrl: string, slot: number) => authFetch<{ activeSlot: number }>(serverUrl, '/lineup/active', { body: { slot } });
/** Buys the next locked lineup slot (up to five); the charge is one-off per slot. */
export const buyLineupSlot = (serverUrl: string) => withWallet(authFetch<{ slotIndex: number; unlockedSlots: number; wallet: number }>(serverUrl, '/lineup/slots/buy', { body: {} }));

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
export const claimMission = (serverUrl: string, missionId: string) => withWallet(authFetch<{ coins: number; packs: number; wallet: number }>(serverUrl, `/missions/${missionId}/claim`, { body: {} }));
export const startSolo = (serverUrl: string, field: 'random' | 'champions') => authFetch<{ roomCode: string; lineupTicket: string }>(serverUrl, '/solo', { body: { field } });

/** Boost de farm: store consumable — each item resolves 10 instant solo majors (coins at the solo rate, zero points). */
export interface BoostState {
  stock: number;
  runsToday: number;
  dailyCap: number;
  price: number;
  runsPerItem: number;
}
export const fetchBoost = (serverUrl: string) => authFetch<BoostState>(serverUrl, '/boost');
export const activateBoost = (serverUrl: string, field: 'random' | 'champions') => withWallet(authFetch<BoostState & { wallet: number; runs: number; coins: number; titles: number; best: string }>(serverUrl, '/boost/run', { body: { field } }));
export const buyBoostItems = (serverUrl: string, quantity: number) => withWallet(authFetch<{ stock: number; wallet: number }>(serverUrl, '/boost/buy', { body: { quantity } }));

export interface UpgraderFair {
  serverSeedHash: string;
  nonce: number;
}

export interface UpgradeOutcome {
  won: boolean;
  chance: number;
  roll: number;
  target: string;
  stake: string[];
  /** On a loss: the downgraded card handed out (never one of the staked cards). */
  consolation: string | null;
  consolationKind: 'common' | 'value' | 'coins' | null;
  /** Loss with only Commons staked: coins paid instead of a card. */
  consolationCoins: number;
  /** The consolation card was already owned: it turned into `duplicateCoins` coins. */
  duplicate: boolean;
  duplicateCoins: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  next: UpgraderFair;
}

export const fetchUpgraderFair = (serverUrl: string) => authFetch<UpgraderFair>(serverUrl, '/upgrader/fair');
export const upgradeCards = (serverUrl: string, stake: string[], target: string, clientSeed: string) => authFetch<UpgradeOutcome>(serverUrl, '/upgrader', { body: { stake, target, clientSeed } });

export interface PromoOffer {
  tier: PromoTier;
  cardId: string;
  originalPrice: number;
  price: number;
  discount: number;
  bought: boolean;
  owned: boolean;
}

export const fetchPromos = (serverUrl: string) => authFetch<{ day: string; endsAt: string; promos: PromoOffer[] }>(serverUrl, '/promos');
export const buyPromo = (serverUrl: string, tier: PromoTier) => withWallet(authFetch<{ tier: PromoTier; cardId: string; price: number; wallet: number }>(serverUrl, '/promos/buy', { body: { tier } }));

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
export const answerTrade = (serverUrl: string, id: string, action: 'accept' | 'decline' | 'cancel') => authFetch<{ wallet?: number }>(serverUrl, `/trades/${encodeURIComponent(id)}/${action}`, { body: {} }).then((result) => { if (typeof result.wallet === 'number') patchWalletCoins(result.wallet); return result; });

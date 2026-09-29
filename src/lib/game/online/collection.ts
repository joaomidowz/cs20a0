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
  players: Array<{ playerId: string; acquiredAt: string; quantity: number }>;
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

/** Cards used on any saved lineup; callers reserve one copy and can still offer extras. */
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
export const startSolo = (
  serverUrl: string,
  field: 'random' | 'champions',
  preferences: { simulationMode: 'automatic' | 'manual'; simulationSpeed: 'normal' | 'fast' | 'ultra' } = { simulationMode: 'automatic', simulationSpeed: 'ultra' }
) => authFetch<{ roomCode: string; lineupTicket: string }>(serverUrl, '/solo', { body: { field, ...preferences } });

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
  /** The consolation card was already owned and its quantity increased by one. */
  duplicate: boolean;
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

// ——— Contratos de cartas repetidas: escada de evolução e Lendas ———

export interface ContractFair {
  serverSeedHash: string;
  nonce: number;
}

export interface ContractCardCount {
  playerId: string;
  count: number;
}

export interface ContractsState {
  /** Excess card copies available for contracts; the stack preserves cards reserved in a saved lineup. */
  cards: ContractCardCount[];
  /** Progresso de cada Lenda por id; ausente = não começou. */
  progress: Record<string, number>;
  fair: ContractFair;
}

export interface TradeUpOutcome {
  contractId: 'tradeup';
  inputs: string[];
  /** A carta entregue. */
  result: string;
  resultTier: string;
  inputTier: string;
  /** Degrau sorteado da tabela visível (down/same/up/double). */
  step: 'down' | 'same' | 'up' | 'double';
  /** De qual pool saiu: a coleção sorteada, o país, ou o pool geral. */
  scope: 'org' | 'country' | 'any';
  /** Qual das 5 entregas deu o peso (0..4). */
  sourceIndex: number;
  /** O resultado já era possuído: a quantidade aumentou em uma cópia. */
  duplicate: boolean;
  roll: number;
  sourceRoll: number;
  pickRoll: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  next: ContractFair;
  /** Estado fresco de cartas repetidas e Lendas, já com o consumo da rodada. */
  cards?: ContractCardCount[];
  progress?: Record<string, number>;
}

export interface ContractDelivery {
  delivery: { progress: number; target: number; complete: boolean; delivered: number };
  cards: ContractCardCount[];
  progress: Record<string, number>;
}

export interface ContractClaim {
  targetId: string;
  cards: ContractCardCount[];
  progress: Record<string, number>;
}

export const fetchContracts = (serverUrl: string) => authFetch<ContractsState>(serverUrl, '/contracts');
export const fetchContractFair = (serverUrl: string) => authFetch<ContractFair>(serverUrl, '/contracts/fair');
export const runTradeUp = (serverUrl: string, inputs: string[], clientSeed: string) => authFetch<TradeUpOutcome>(serverUrl, '/contracts/tradeup', { body: { inputs, clientSeed } });
export const deliverContract = (serverUrl: string, contractId: string, donors: string[]) => authFetch<ContractDelivery>(serverUrl, '/contracts/deliver', { body: { contractId, donors } });
export const claimContract = (serverUrl: string, contractId: string) => authFetch<ContractClaim>(serverUrl, '/contracts/claim', { body: { contractId } });

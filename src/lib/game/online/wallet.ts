import { writable } from 'svelte/store';
import { authFetch } from './account';

/** What the wallet bar shows: coins, today's basic packs and the collection size, shared by every online page. */
export interface WalletSummary {
  coins: number;
  packsLeft: number;
  packsGranted: number;
  cards: number;
}

type CollectionLike = { wallet: number; count: number; packsToday: { granted: number; opened: number } };

export const walletSummary = writable<WalletSummary | null>(null);

/** Called with every fresh `GET /collection`, so any page that reloads the collection also updates the bar. */
export function setWalletFromCollection(state: CollectionLike) {
  walletSummary.set({ coins: state.wallet, packsLeft: Math.max(0, state.packsToday.granted - state.packsToday.opened), packsGranted: state.packsToday.granted, cards: state.count });
}

/** A response that already carries the new balance (sell, mission, promo…): updates the coins without a new request. */
export function patchWalletCoins(coins: number) {
  walletSummary.update((current) => (current ? { ...current, coins } : current));
}

export const clearWallet = () => walletSummary.set(null);

let inflight: Promise<void> | null = null;
/** Reloads the bar from the server; concurrent calls share one request. Errors keep the last known values. */
export function refreshWallet(serverUrl: string): Promise<void> {
  inflight ??= authFetch<CollectionLike>(serverUrl, '/collection')
    .then(setWalletFromCollection)
    .catch(() => undefined)
    .finally(() => { inflight = null; });
  return inflight;
}

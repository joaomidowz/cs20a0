import { writable } from 'svelte/store';
import { authFetch } from './account';
import { patchWalletCoins } from './wallet';

/** Boost de farm: store consumable — each item resolves 10 instant solo majors (coins at the solo rate, zero points). */
export interface BoostState {
  stock: number;
  runsToday: number;
  dailyCap: number;
  price: number;
  runsPerItem: number;
}

/** Shared by the hub switch and the store card: buying in one updates the other on the spot. */
export const boostStore = writable<BoostState | null>(null);

export const refreshBoost = async (serverUrl: string): Promise<BoostState | null> => {
  try {
    const state = await authFetch<BoostState>(serverUrl, '/boost');
    boostStore.set(state);
    return state;
  } catch { return null; }
};

/** Consumes 1 item: resolves 10 instant solo majors; the server answers with the fresh state, wallet included. */
export const activateBoost = async (serverUrl: string, field: 'random' | 'champions') => {
  const result = await authFetch<BoostState & { wallet: number; runs: number; coins: number; titles: number; best: string }>(serverUrl, '/boost/run', { body: { field } });
  patchWalletCoins(result.wallet);
  boostStore.set({ stock: result.stock, runsToday: result.runsToday, dailyCap: result.dailyCap, price: result.price, runsPerItem: result.runsPerItem });
  return result;
};

/** Buys consumable items into the stock (free quantity, the daily cap is on usage). */
export const buyBoostItems = async (serverUrl: string, quantity: number) => {
  const result = await authFetch<{ stock: number; wallet: number }>(serverUrl, '/boost/buy', { body: { quantity } });
  patchWalletCoins(result.wallet);
  boostStore.update((current) => (current ? { ...current, stock: result.stock } : current));
  return result;
};

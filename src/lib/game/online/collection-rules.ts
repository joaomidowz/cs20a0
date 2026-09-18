import type { Player } from '../types';

/**
 * Pack and coin rules of the online collection, shared by the server (source of truth) and the client (previews and
 * odds shown in the shop). Pure: no data imports, so it stays inside the online boundary.
 */
export type PackTier = 'basic' | 'prata' | 'ouro' | 'era';
export type Rarity = 'common' | 'rare' | 'elite' | 'superstar' | 'legend' | 'goat';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'elite', 'superstar', 'legend', 'goat'];
export const PACK_TIERS: readonly PackTier[] = ['basic', 'prata', 'ouro', 'era'];
export const CARDS_PER_PACK = 3;
export const DAILY_BASIC_PACKS = 2;

/** Odds per rarity, in percent; each row sums to 100. `era` uses the prata odds restricted to one year. */
export const PACK_ODDS: Readonly<Record<PackTier, Readonly<Record<Rarity, number>>>> = {
  basic: { common: 62, rare: 24, elite: 9, superstar: 3, legend: 1.5, goat: 0.5 },
  prata: { common: 38, rare: 30, elite: 18, superstar: 8, legend: 4, goat: 2 },
  ouro: { common: 12, rare: 24, elite: 30, superstar: 16, legend: 11, goat: 7 },
  era: { common: 38, rare: 30, elite: 18, superstar: 8, legend: 4, goat: 2 }
};

/** Coins; the basic pack is the daily grant and cannot be bought. */
export const PACK_PRICES: Readonly<Record<PackTier, number>> = { basic: 0, prata: 1200, ouro: 3500, era: 2000 };

export const SELL_RATIO = 0.6;
const VALUE_STEP = 5;
const VALUE_FLOOR = 30;
const VALUE_CAP = 2500;
const RARITY_MULTIPLIER: Readonly<Record<string, number>> = { common: 1, rare: 1.05, elite: 1.12, legend: 1.2, superstar: 1.3, goat: 1.45 };

export const rarityOf = (player: Pick<Player, 'rarity'>): Rarity => {
  const value = (player.rarity ?? 'common').toLowerCase();
  return (RARITIES as readonly string[]).includes(value) ? (value as Rarity) : 'common';
};

/** Coin value of a card: the Dynasty market curve (dollars) scaled to coins. Duplicates pay this; selling pays SELL_RATIO of it. */
export function coinValue(player: Pick<Player, 'overall' | 'rarity' | 'role' | 'badges'>): number {
  const overall = Math.min(99, Math.max(60, player.overall ?? 70));
  const base = 50 * 1.09 ** (overall - 60);
  const rarity = RARITY_MULTIPLIER[rarityOf(player)] ?? 1;
  const role = (player.role ?? '').toLowerCase();
  const position = role.includes('awp') ? 1.15 : role.includes('igl') ? 1.1 : 1;
  const titles = 1 + 0.08 * Math.min(2, (player.badges ?? []).filter((badge) => badge === 'major-champion').length);
  const rounded = Math.round((base * rarity * position * titles) / VALUE_STEP) * VALUE_STEP;
  return Math.min(VALUE_CAP, Math.max(VALUE_FLOOR, rounded));
}

export const sellValue = (player: Pick<Player, 'overall' | 'rarity' | 'role' | 'badges'>) => Math.floor(coinValue(player) * SELL_RATIO);

/** Coins for finishing a run with the collection lineup; halved when the lobby was not ranked. */
export function matchReward(placement: string, ranked: boolean): number {
  const base = placement === 'placementChampion' ? 300 : placement === 'placementRunnerUp' || placement === 'placement3to4' ? 150 : 50;
  return ranked ? base : Math.floor(base / 2);
}

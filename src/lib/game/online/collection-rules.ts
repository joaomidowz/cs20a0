import type { Coach, Player } from '../types';

/**
 * Pack and coin rules of the online collection, shared by the server (source of truth) and the client (previews and
 * odds shown in the shop). Pure: no data imports, so it stays inside the online boundary.
 */
export type PackTier = 'basic' | 'prata' | 'ouro' | 'era' | 'diamante' | 'icone';
export type Rarity = 'common' | 'rare' | 'elite' | 'superstar' | 'legend' | 'goat';
export type RarityOdds = Readonly<Record<Rarity, number>>;

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'elite', 'superstar', 'legend', 'goat'];
export const PACK_TIERS: readonly PackTier[] = ['basic', 'prata', 'ouro', 'era', 'diamante', 'icone'];
/** Packs sold for coins, in shop order (the basic pack is the daily grant). */
export const BUYABLE_TIERS: readonly Exclude<PackTier, 'basic'>[] = ['prata', 'era', 'ouro', 'diamante', 'icone'];
export const CARDS_PER_PACK = 3;
export const DAILY_BASIC_PACKS = 2;

const odds = (common: number, rare: number, elite: number, superstar: number, legend: number, goat: number): RarityOdds => ({ common, rare, elite, superstar, legend, goat });
const same = (row: RarityOdds): RarityOdds[] => Array.from({ length: CARDS_PER_PACK }, () => row);
/** The two "filler" cards of the premium packs: never common, rarely a legend, never a GOAT. */
const PREMIUM_FILLER = odds(0, 35, 45, 17, 3, 0);

/**
 * Odds per rarity for each card of a pack, in percent (each row sums to 100). Premium packs guarantee their first
 * card: Diamante a Legend (10% of it a GOAT), Ícone a GOAT. GOAT stays rare everywhere else.
 */
export const PACK_SLOTS: Readonly<Record<PackTier, readonly RarityOdds[]>> = {
  basic: same(odds(64, 24, 8.5, 2.5, 0.8, 0.2)),
  prata: same(odds(40, 31, 18, 7.5, 3, 0.5)),
  era: same(odds(40, 31, 18, 7.5, 3, 0.5)),
  ouro: same(odds(14, 26, 33, 16, 9, 2)),
  diamante: [odds(0, 0, 0, 0, 90, 10), PREMIUM_FILLER, PREMIUM_FILLER],
  icone: [odds(0, 0, 0, 0, 0, 100), PREMIUM_FILLER, PREMIUM_FILLER]
};

/** Coins; the basic pack is the daily grant and cannot be bought. */
export const PACK_PRICES: Readonly<Record<PackTier, number>> = { basic: 0, prata: 1200, era: 2000, ouro: 3500, diamante: 10000, icone: 30000 };

/** Chance of at least one card of `rarities` in a pack (for the shop). */
export function packChance(tier: PackTier, rarities: readonly Rarity[]): number {
  const miss = PACK_SLOTS[tier].reduce((product, row) => product * (1 - rarities.reduce((sum, rarity) => sum + row[rarity], 0) / 100), 1);
  return 1 - miss;
}

export const SELL_RATIO = 0.6;
const VALUE_STEP = 5;
const VALUE_FLOOR = 30;
const VALUE_CAP = 2500;
const RARITY_MULTIPLIER: Readonly<Record<string, number>> = { common: 1, rare: 1.05, elite: 1.12, legend: 1.2, superstar: 1.3, goat: 1.45 };

export const rarityOf = (player: Pick<Player, 'rarity'>): Rarity => {
  const value = (player.rarity ?? 'common').toLowerCase();
  return (RARITIES as readonly string[]).includes(value) ? (value as Rarity) : 'common';
};

/** Coin value of a card: the Dynasty market curve (dollars) scaled to coins. Selling and duplicates pay SELL_RATIO of it. */
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

/** Coins for finishing a run with the collection lineup, by placement in the 16-team field. */
export const PLACEMENT_COINS: Readonly<Record<string, number>> = { placementChampion: 1200, placementRunnerUp: 750, placement3to4: 500, placement5to8: 300 };
/** Everyone knocked out before the playoffs (Swiss stage or earlier). */
export const ELIMINATED_COINS = 150;

/** Coins for finishing a run with the collection lineup; halved when the run did not count for the season. */
export function matchReward(placement: string, ranked: boolean): number {
  const base = PLACEMENT_COINS[placement] ?? ELIMINATED_COINS;
  return ranked ? base : Math.floor(base / 2);
}

/** Season points by placement with four or more humans in the run. */
export const PLACEMENT_POINTS: Readonly<Record<string, number>> = { placementChampion: 10, placementRunnerUp: 7, placement3to4: 5, placement5to8: 3 };
export const ELIMINATED_POINTS = 1;
/** Humans in the run for full points; three score half (rounded up), two a third (rounded), one alone scores nothing. */
export const FULL_POINTS_LOBBY = 4;
/** Runs per day (Brasília) that score season points; later runs still pay coins. */
export const COUNTED_RUNS_PER_DAY = 3;

export function seasonPoints(placement: string, lobbySize: number): number {
  const full = PLACEMENT_POINTS[placement] ?? ELIMINATED_POINTS;
  if (lobbySize >= FULL_POINTS_LOBBY) return full;
  if (lobbySize === 3) return Math.ceil(full / 2);
  if (lobbySize === 2) return Math.round(full / 3);
  return 0;
}

/** A repeated card pays this share of its value, like selling it (paying 100% let cheap packs print coins). */
export const DUPLICATE_RATIO = 0.6;

/** Chance that one of the three cards of a pack is a coach instead of a player. */
export const COACH_CHANCE: Readonly<Record<PackTier, number>> = { basic: 0.08, prata: 0.12, ouro: 0.18, era: 0.12, diamante: 0.15, icone: 0.2 };

/** New accounts start with this; paid once on the first verified login. */
export const WELCOME_COINS = 10_000;

/** Coin value of a coach card: the Dynasty coach market curve scaled to coins, with the same rarity multiplier as players. */
export function coachCoinValue(coach: Pick<Coach, 'overall' | 'rarity'>): number {
  const base = 20 * 1.08 ** (Math.max(60, coach.overall) - 60);
  const rarity = RARITY_MULTIPLIER[rarityOf(coach)] ?? 1;
  const rounded = Math.round((base * rarity * 1.4) / VALUE_STEP) * VALUE_STEP;
  return Math.min(VALUE_CAP, Math.max(VALUE_FLOOR, rounded));
}

export const coachSellValue = (coach: Pick<Coach, 'overall' | 'rarity'>) => Math.floor(coachCoinValue(coach) * SELL_RATIO);

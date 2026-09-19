import type { Coach, Player } from '../types';

/**
 * Pack and coin rules of the online collection, shared by the server (source of truth) and the client (previews and
 * odds shown in the shop). Pure: no data imports, so it stays inside the online boundary.
 */
export type PackTier = 'basic' | 'prata' | 'ouro' | 'era' | 'diamante' | 'icone';
/** Daily promotion: four fixed cards of the day, the same for every account, each sold once per account at a discount. */
export type PromoTier = 'promo_elite' | 'promo_superstar' | 'promo_legend' | 'promo_coach';
export type Rarity = 'common' | 'rare' | 'elite' | 'superstar' | 'legend' | 'goat';
export type RarityOdds = Readonly<Record<Rarity, number>>;

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'elite', 'superstar', 'legend', 'goat'];
export const PACK_TIERS: readonly PackTier[] = ['basic', 'prata', 'ouro', 'era', 'diamante', 'icone'];
export const PROMO_TIERS: readonly PromoTier[] = ['promo_elite', 'promo_superstar', 'promo_legend', 'promo_coach'];
/** Discount of each daily offer, in whole percent over the card's coin value. */
export const PROMO_DISCOUNT: Readonly<Record<PromoTier, number>> = { promo_elite: 50, promo_superstar: 60, promo_legend: 60, promo_coach: 50 };
export const isPromoTier = (tier: string): tier is PromoTier => (PROMO_TIERS as readonly string[]).includes(tier);
/** Price of a daily offer: the card value minus the discount, in whole coins (integers only). The server charges exactly this. */
export const promoFinalPrice = (originalPrice: number, tier: PromoTier): number => originalPrice - Math.floor((originalPrice * PROMO_DISCOUNT[tier]) / 100);
/** Packs sold for coins, in shop order (the basic pack is the daily grant). */
export const BUYABLE_TIERS: readonly Exclude<PackTier, 'basic'>[] = ['prata', 'era', 'ouro', 'diamante', 'icone'];
export const CARDS_PER_PACK = 3;
export const DAILY_BASIC_PACKS = 2;

const odds = (common: number, rare: number, elite: number, superstar: number, legend: number, goat: number): RarityOdds => ({ common, rare, elite, superstar, legend, goat });
const same = (row: RarityOdds): RarityOdds[] => Array.from({ length: CARDS_PER_PACK }, () => row);
/**
 * Odds per rarity for each card of a pack, in percent (each row sums to 100). Premium packs guarantee their first
 * card (Diamante a Legend, 10% of it a GOAT; Ícone a GOAT) and their other two cards are Superstar or better.
 */
export const PACK_SLOTS: Readonly<Record<PackTier, readonly RarityOdds[]>> = {
  basic: same(odds(63.4, 24, 8.5, 2.5, 1.2, 0.4)),
  prata: same(odds(38.5, 31, 18, 7.5, 4, 1)),
  era: same(odds(38.5, 31, 18, 7.5, 4, 1)),
  ouro: same(odds(10, 26, 33, 16, 13, 2)),
  diamante: [odds(0, 0, 0, 0, 90, 10), odds(0, 0, 0, 30, 60, 10), odds(0, 0, 0, 30, 60, 10)],
  icone: [odds(0, 0, 0, 0, 0, 100), odds(0, 0, 0, 20, 60, 20), odds(0, 0, 0, 20, 60, 20)]
};

/** Coins; the basic pack is the daily grant and cannot be bought. */
export const PACK_PRICES: Readonly<Record<PackTier, number>> = { basic: 0, prata: 1200, era: 2000, ouro: 3500, diamante: 10000, icone: 30000 };

/** Chance of at least one card of `rarities` in a pack (for the shop). */
export function packChance(tier: PackTier, rarities: readonly Rarity[]): number {
  const miss = PACK_SLOTS[tier].reduce((product, row) => product * (1 - rarities.reduce((sum, rarity) => sum + row[rarity], 0) / 100), 1);
  return 1 - miss;
}

/** A sold card pays this share of its value (see tests/collectionEconomy.test.ts: selling a pack never pays back its price). */
export const SELL_RATIO = 0.04;

/** Coin value of each rarity, the middle of its band: the upgrader and the trades compare cards by it. */
export const RARITY_BASE_VALUE: Readonly<Record<Rarity, number>> = { common: 2000, rare: 3000, elite: 5000, superstar: 10000, legend: 20000, goat: 50000 };
/** Lowest and highest value of each rarity, by overall (common and rare follow the Elite proportion, 90%..120% of the base). */
export const RARITY_VALUE_BAND: Readonly<Record<Rarity, readonly [number, number]>> = {
  common: [1800, 2400], rare: [2700, 3600], elite: [4500, 6000], superstar: [9000, 12000], legend: [18000, 25000], goat: [45000, 60000]
};
/** Overalls each rarity spans in the pool: the lowest gets the band floor, the middle the base, the highest the band top. */
const RARITY_OVERALL_SPAN: Readonly<Record<Rarity, readonly [number, number]>> = { common: [69, 80], rare: [78, 86], elite: [81, 87], superstar: [85, 92], legend: [90, 96], goat: [95, 99] };
const COACH_OVERALL_SPAN: readonly [number, number] = [68, 90];
const RARITY_VALUE_STEP: Readonly<Record<Rarity, number>> = { common: 100, rare: 100, elite: 100, superstar: 250, legend: 500, goat: 1000 };
/** A coach is worth this share of a player of the same rarity. */
export const COACH_VALUE_RATIO = 0.8;

export const rarityOf = (player: Pick<Player, 'rarity'>): Rarity => {
  const value = (player.rarity ?? 'common').toLowerCase();
  return (RARITIES as readonly string[]).includes(value) ? (value as Rarity) : 'common';
};

/** Value inside the rarity band: floor..base over the lower half of the overall span, base..top over the upper half. */
function bandValue(rarity: Rarity, overall: number, span: readonly [number, number], scale = 1): number {
  const [floor, top] = RARITY_VALUE_BAND[rarity];
  const base = RARITY_BASE_VALUE[rarity];
  const position = Math.min(1, Math.max(0, (overall - span[0]) / (span[1] - span[0])));
  const raw = position < 0.5 ? floor + (base - floor) * position * 2 : base + (top - base) * (position - 0.5) * 2;
  const step = RARITY_VALUE_STEP[rarity];
  return Math.round((raw * scale) / step) * step;
}

/** Coin value of a card: its rarity price, varied by overall inside the rarity band. Selling and duplicates pay a small share of it. */
export function coinValue(player: Pick<Player, 'overall' | 'rarity'>): number {
  const rarity = rarityOf(player);
  return bandValue(rarity, player.overall ?? RARITY_OVERALL_SPAN[rarity][0], RARITY_OVERALL_SPAN[rarity]);
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
/** Runs per day (Brasília) that score season points: the day's best ones, so a late title replaces an early bad run. */
export const COUNTED_RUNS_PER_DAY = 10;

/** Match awards repeat inside a Major (several perfect series, several top-10 players): together they add at most this. */
export const AWARD_POINTS_CAP = 3;

export function seasonPoints(placement: string, lobbySize: number): number {
  const full = PLACEMENT_POINTS[placement] ?? ELIMINATED_POINTS;
  if (lobbySize >= FULL_POINTS_LOBBY) return full;
  if (lobbySize === 3) return Math.ceil(full / 2);
  if (lobbySize === 2) return Math.round(full / 3);
  return 0;
}

/** A repeated card pays this share of its value, like selling it (a higher share let cheap packs print coins). */
export const DUPLICATE_RATIO = SELL_RATIO;

/** Chance that one of the three cards of a pack is a coach instead of a player . */
export const COACH_CHANCE: Readonly<Record<PackTier, number>> = { basic: 0.08, prata: 0.12, ouro: 0.18, era: 0.12, diamante: 0.15, icone: 0.2 };

/** New accounts start with this; paid once on the first verified login. */
export const WELCOME_COINS = 10_000;

/** Coin value of a coach card: COACH_VALUE_RATIO of a player of the same rarity, varied by the coach overall. */
export function coachCoinValue(coach: Pick<Coach, 'overall' | 'rarity'>): number {
  return bandValue(rarityOf(coach), coach.overall, COACH_OVERALL_SPAN, COACH_VALUE_RATIO);
}

export const coachSellValue = (coach: Pick<Coach, 'overall' | 'rarity'>) => Math.floor(coachCoinValue(coach) * SELL_RATIO);

/** Upgrader: at most this many cards staked at once. */
export const UPGRADER_MAX_STAKE = 6;
/** Upgrader: the chance never goes above this, however much is staked. */
export const UPGRADER_MAX_CHANCE = 0.75;
/** Upgrader: share of the staked value that turns into chance (the house keeps the rest). */
export const UPGRADER_EDGE = 0.9;

/** Chance (0..0.75) of turning cards worth `stakeValue` coins into one worth `targetValue`. */
export function upgradeChance(stakeValue: number, targetValue: number): number {
  if (targetValue <= 0 || stakeValue <= 0) return 0;
  return Math.min(UPGRADER_MAX_CHANCE, (stakeValue / targetValue) * UPGRADER_EDGE);
}

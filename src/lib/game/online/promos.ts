import { collectionCoaches, collectionPlayers } from './collection-pool';
import { cardCoinValue } from './card-value';
import { PROMO_DISCOUNT, PROMO_TIERS, promoFinalPrice, rarityOf, type PromoTier, type Rarity } from './collection-rules';

/**
 * Daily promotion: four fixed cards drawn from the seed `promo:<day>` (Brasília day), the same for every account.
 * Pure and shared: the server lists and charges exactly what this computes, and the client shows the same numbers.
 */
export interface PromoCard {
  tier: PromoTier;
  cardId: string;
  originalPrice: number;
  price: number;
  discount: number;
}

/** Rarity of each player offer; the coach offer draws from every coach. */
export const PROMO_PLAYER_RARITY: Readonly<Record<Exclude<PromoTier, 'promo_coach'>, Rarity>> = { promo_elite: 'elite', promo_superstar: 'superstar', promo_legend: 'legend' };

export const promoSeed = (day: string) => `promo:${day}`;

/** 0..1 from a string (FNV-1a with a final mix): the same seed always picks the same card. */
function unitHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
const POOLS: Readonly<Record<PromoTier, string[]>> = {
  promo_elite: byId(collectionPlayers.filter((player) => rarityOf(player) === 'elite')).map((player) => player.id),
  promo_superstar: byId(collectionPlayers.filter((player) => rarityOf(player) === 'superstar')).map((player) => player.id),
  promo_legend: byId(collectionPlayers.filter((player) => rarityOf(player) === 'legend')).map((player) => player.id),
  promo_coach: byId(collectionCoaches).map((coach) => coach.id)
};

/** The card of one offer on a day (YYYY-MM-DD). */
export function promoCardId(tier: PromoTier, day: string): string {
  const pool = POOLS[tier];
  return pool[Math.floor(unitHash(`${promoSeed(day)}:${tier}`) * pool.length)];
}

/** The four offers of a day, in shop order, with the original value, the discounted price and the discount. */
export function dailyPromos(day: string): PromoCard[] {
  return PROMO_TIERS.map((tier) => {
    const cardId = promoCardId(tier, day);
    const originalPrice = cardCoinValue(cardId);
    return { tier, cardId, originalPrice, price: promoFinalPrice(originalPrice, tier), discount: PROMO_DISCOUNT[tier] };
  });
}

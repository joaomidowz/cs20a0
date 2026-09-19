import { collectionCoachById, collectionPlayerById } from './collection-pool';
import { coachCoinValue, coinValue, rarityOf, upgradeChance, type Rarity } from './collection-rules';

/** Coin value of any collection card (player or coach); 0 for an unknown id. Same number on the server and the client. */
export function cardCoinValue(id: string): number {
  const coach = collectionCoachById.get(id);
  if (coach) return coachCoinValue(coach);
  const player = collectionPlayerById.get(id);
  return player ? coinValue(player) : 0;
}

/** Rarity of any collection card (a coach has its own); common for an unknown id. */
export function cardRarity(id: string): Rarity {
  const card = collectionCoachById.get(id) ?? collectionPlayerById.get(id);
  return card ? rarityOf(card) : 'common';
}

/** Upgrader chance of staking `stake` for `target`, by card id: the server charges exactly this and the client previews it. */
export function cardUpgradeChance(stake: readonly string[], target: string): number {
  return upgradeChance(stake.reduce((sum, id) => sum + cardCoinValue(id), 0), cardCoinValue(target), cardRarity(target), stake.map(cardRarity));
}

export const isKnownCard = (id: string) => collectionCoachById.has(id) || collectionPlayerById.has(id);

/** Short label for lists: nickname (or coach name), year and overall. */
export function cardLabel(id: string): string {
  const coach = collectionCoachById.get(id);
  if (coach) return `${coach.name} · COACH ${coach.year} · ${coach.overall}`;
  const player = collectionPlayerById.get(id);
  return player ? `${player.nickname ?? player.id} · ${player.year ?? ''} · ${player.overall ?? ''}` : id;
}

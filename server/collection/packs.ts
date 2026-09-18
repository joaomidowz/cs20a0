import { CARDS_PER_PACK, PACK_ODDS, RARITIES, rarityOf, type PackTier, type Rarity } from '../../src/lib/game/online/collection-rules';
import { createSeededRng } from '../../src/lib/game/simulation';
import type { Player } from '../../src/lib/game/types';

export interface RollOptions {
  /** `era` packs: every card from this year. Other tiers draw three distinct years. */
  year?: number;
}

const pickRarity = (tier: PackTier, roll: number): Rarity => {
  let cursor = roll * 100;
  for (const rarity of RARITIES) {
    cursor -= PACK_ODDS[tier][rarity];
    if (cursor < 0) return rarity;
  }
  return 'common';
};

/** Deterministic by seed: the same user, day and pack index always reveal the same three cards. */
export function rollPack(tier: PackTier, seed: string, pool: Player[], options: RollOptions = {}): Player[] {
  const rng = createSeededRng(seed);
  const eligible = options.year ? pool.filter((player) => player.year === options.year) : pool;
  if (!eligible.length) throw new Error('Empty pack pool');
  const byRarity = new Map<Rarity, Player[]>();
  for (const player of eligible) {
    const rarity = rarityOf(player);
    byRarity.set(rarity, [...(byRarity.get(rarity) ?? []), player]);
  }
  for (const list of byRarity.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const cards: Player[] = [];
  const usedYears = new Set<number>();
  const usedIds = new Set<string>();
  for (let index = 0; index < CARDS_PER_PACK; index += 1) {
    const wanted = pickRarity(tier, rng());
    const ladder = [wanted, ...RARITIES.slice(0, RARITIES.indexOf(wanted)).reverse(), ...RARITIES.slice(RARITIES.indexOf(wanted) + 1)];
    let chosen: Player | null = null;
    for (const rarity of ladder) {
      const candidates = (byRarity.get(rarity) ?? []).filter((player) => !usedIds.has(player.id) && (options.year || !usedYears.has(player.year ?? 0)));
      if (candidates.length) { chosen = candidates[Math.floor(rng() * candidates.length)]; break; }
    }
    if (!chosen) {
      const rest = eligible.filter((player) => !usedIds.has(player.id));
      if (!rest.length) break;
      chosen = rest[Math.floor(rng() * rest.length)];
    }
    cards.push(chosen);
    usedIds.add(chosen.id);
    if (chosen.year) usedYears.add(chosen.year);
  }
  return cards;
}

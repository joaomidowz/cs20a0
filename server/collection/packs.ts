import { COACH_CHANCE, PACK_SLOTS, RARITIES, rarityOf, type PackTier, type Rarity, type RarityOdds } from '../../src/lib/game/online/collection-rules';
import { createSeededRng } from '../../src/lib/game/simulation';
import type { Coach, Player } from '../../src/lib/game/types';

export interface RollOptions {
  /** `era` packs: every card from this year. Other tiers draw three distinct years. */
  year?: number;
  /** Cards in the pack; defaults to the tier's slot rows (3). */
  size?: number;
}

const pickRarity = (row: RarityOdds, roll: number): Rarity => {
  let cursor = roll * 100;
  let last: Rarity = 'common';
  for (const rarity of RARITIES) {
    if (!row[rarity]) continue;
    last = rarity;
    cursor -= row[rarity];
    if (cursor < 0) return rarity;
  }
  return last;
};
/** Falls back to the next lower rarity (then higher) only when the wanted one has no card left in the pool. */
const ladderOf = (wanted: Rarity): Rarity[] => [wanted, ...RARITIES.slice(0, RARITIES.indexOf(wanted)).reverse(), ...RARITIES.slice(RARITIES.indexOf(wanted) + 1)];

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
  const size = options.size ?? PACK_SLOTS[tier].length;
  for (let index = 0; index < size; index += 1) {
    const ladder = ladderOf(pickRarity(PACK_SLOTS[tier][index] ?? PACK_SLOTS[tier][PACK_SLOTS[tier].length - 1], rng()));
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

export type PackCard = { kind: 'player'; player: Player } | { kind: 'coach'; coach: Coach };

/**
 * A pack with a chance that its last card is a coach (same seed, same pack); the guaranteed first card is never replaced. Era packs
 * draw the coach from the chosen year.
 */
export function rollPackWithCoaches(tier: PackTier, seed: string, pool: Player[], coaches: Coach[], options: RollOptions = {}): PackCard[] {
  const cards: PackCard[] = rollPack(tier, seed, pool, options).map((player) => ({ kind: 'player', player }));
  const rng = createSeededRng(`${seed}:coach`);
  if (rng() >= COACH_CHANCE[tier]) return cards;
  const eligible = coaches.filter((coach) => !options.year || coach.year === options.year).sort((a, b) => a.id.localeCompare(b.id));
  if (!eligible.length) return cards;
  for (const rarity of ladderOf(pickRarity(PACK_SLOTS[tier][PACK_SLOTS[tier].length - 1], rng()))) {
    const candidates = eligible.filter((coach) => rarityOf(coach) === rarity);
    if (!candidates.length) continue;
    const coach: PackCard = { kind: 'coach', coach: candidates[Math.floor(rng() * candidates.length)] };
    cards[cards.length - 1] = coach;
    break;
  }
  return cards;
}

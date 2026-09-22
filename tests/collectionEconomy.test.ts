// tests/collectionEconomy.test.ts
// Economia da coleção: preço das cartas por raridade, venda direta a 40% e duplicatas baixas para pacotes não
// imprimirem coins, calculadas com as odds reais de PACK_SLOTS e COACH_CHANCE.
import { describe, expect, it } from 'vitest';
import { rollPackWithCoaches } from '../server/collection/packs';
import { collectionCoaches, collectionPlayers } from '../src/lib/game/online/collection-pool';
import {
  BUYABLE_TIERS, COACH_CHANCE, DUPLICATE_RATIO, PACK_PRICES, PACK_SLOTS, RARITIES, RARITY_BASE_VALUE,
  RARITY_VALUE_BAND, SELL_RATIO, coachSellValue, coachCoinValue, coinValue, rarityOf, sellValue, type Rarity, type RarityOdds
} from '../src/lib/game/online/collection-rules';

/** Most a pack may pay back when all its cards are sold, as a share of its price. */
const MAX_PAYBACK = 0.6;

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const byRarity = <T>(items: T[], rarity: (item: T) => Rarity, value: (item: T) => number) =>
  new Map(RARITIES.map((wanted) => [wanted, items.filter((item) => rarity(item) === wanted).map(value)] as const).filter(([, values]) => values.length).map(([wanted, values]) => [wanted, mean(values)]));
/** Same fallback as server/collection/packs.ts: the wanted rarity, then lower ones, then higher. */
const ladderOf = (wanted: Rarity): Rarity[] => [wanted, ...RARITIES.slice(0, RARITIES.indexOf(wanted)).reverse(), ...RARITIES.slice(RARITIES.indexOf(wanted) + 1)];
const expected = (row: RarityOdds, means: Map<Rarity, number>) => RARITIES.reduce((sum, rarity) => sum + (row[rarity] / 100) * (means.get(ladderOf(rarity).find((step) => means.has(step))!) ?? 0), 0);

/** Expected coins from a pack when every card is sold at `ratio` of its value: the last card is a coach COACH_CHANCE of the time. */
function packPayback(tier: (typeof BUYABLE_TIERS)[number], player: Map<Rarity, number>, coach: Map<Rarity, number>): number {
  const rows = PACK_SLOTS[tier];
  const last = rows.length - 1;
  return rows.reduce((sum, row, index) => sum + (index === last ? (1 - COACH_CHANCE[tier]) * expected(row, player) + COACH_CHANCE[tier] * expected(row, coach) : expected(row, player)), 0);
}

describe('preço das cartas', () => {
  it('vende jogadores e coaches a 40% do valor nominal', () => {
    for (const card of collectionPlayers) expect(sellValue(card)).toBe(Math.floor(coinValue(card) * 0.4));
    for (const card of collectionCoaches) expect(coachSellValue(card)).toBe(Math.floor(coachCoinValue(card) * 0.4));
  });

  it.each(['ouro', 'prata'] as const)('%s: abrir e revender tudo retorna menos de 90% do custo médio', (tier) => {
    // Pool e sorteador reais: inclui coaches, restrição de anos e fallback de raridade.
    // Vender tudo antes da próxima compra evita depender do desconto de duplicatas.
    const samples = 2000;
    let returned = 0;
    for (let index = 0; index < samples; index += 1) {
      const cards = rollPackWithCoaches(tier, `audit-gold:${index}`, collectionPlayers, collectionCoaches);
      expect(cards).toHaveLength(3);
      returned += cards.reduce((sum, card) => sum + (card.kind === 'coach' ? coachSellValue(card.coach) : sellValue(card.player)), 0);
    }
    expect(returned / samples).toBeLessThan(PACK_PRICES[tier] * 0.9);
  });

  it('fica na faixa da raridade, cresce com o overall e o coach vale 80%', () => {
    for (const player of collectionPlayers) {
      const [low, high] = RARITY_VALUE_BAND[rarityOf(player)];
      expect(coinValue(player)).toBeGreaterThanOrEqual(low);
      expect(coinValue(player)).toBeLessThanOrEqual(high);
    }
    expect(RARITY_BASE_VALUE).toEqual({ common: 2400, rare: 3600, elite: 6000, superstar: 12000, legend: 24000, goat: 100000 });
    expect(RARITY_VALUE_BAND).toEqual({ common: [2160, 2880], rare: [3240, 4320], elite: [5400, 7200], superstar: [10800, 14400], legend: [21600, 30000], goat: [85000, 110000] });
    expect(coinValue({ overall: 81, rarity: 'elite' })).toBe(5400);
    expect(coinValue({ overall: 84, rarity: 'elite' })).toBe(6000);
    expect(coinValue({ overall: 87, rarity: 'elite' })).toBe(7200);
    expect(coinValue({ overall: 99, rarity: 'goat' })).toBe(110000);
    expect(coinValue({ overall: 95, rarity: 'goat' })).toBe(85000);
    expect(coinValue({ overall: 97, rarity: 'goat' })).toBe(100000);
    expect(coinValue({ overall: 90, rarity: 'legend' })).toBe(21600);
    expect(coinValue({ overall: 96, rarity: 'legend' })).toBe(30000);
    expect(coinValue({ overall: 92, rarity: 'superstar' })).toBeGreaterThan(coinValue({ overall: 86, rarity: 'superstar' }));
    // Same rarity, different overalls: not one flat price.
    for (const rarity of RARITIES) expect(new Set(collectionPlayers.filter((player) => rarityOf(player) === rarity).map(coinValue)).size).toBeGreaterThan(2);
    expect(coachCoinValue({ overall: 79, rarity: 'elite' })).toBe(4800);
    for (const coach of collectionCoaches) {
      const [low, high] = RARITY_VALUE_BAND[rarityOf(coach)];
      expect(coachCoinValue(coach)).toBeGreaterThanOrEqual(low * 0.8 - 100);
      expect(coachCoinValue(coach)).toBeLessThanOrEqual(high * 0.8 + 100);
    }
  });

  it('venda direta paga 40%, mas duplicatas não devolvem 60% do preço do pacote', () => {
    expect(SELL_RATIO).toBe(0.4);
    expect(DUPLICATE_RATIO).toBe(0.035);
    const player = byRarity(collectionPlayers, rarityOf, (card) => Math.floor(coinValue(card) * DUPLICATE_RATIO));
    const coach = byRarity(collectionCoaches, rarityOf, (card) => Math.floor(coachCoinValue(card) * DUPLICATE_RATIO));
    for (const tier of BUYABLE_TIERS) {
      const payback = packPayback(tier, player, coach) / PACK_PRICES[tier];
      expect(payback, `${tier}: ${(payback * 100).toFixed(1)}% do preço`).toBeLessThan(MAX_PAYBACK);
    }
  });
});

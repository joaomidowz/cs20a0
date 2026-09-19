// tests/promos.test.ts
// Promoções diárias: odds puras, rolagem de 4 cartas e compra uma vez por dia contra o Postgres local (pulada sem TEST_DATABASE_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionCoaches, collectionPlayers } from '../src/lib/game/online/collection-pool';
import { COACH_CHANCE, PACK_PRICES, PACK_SLOTS, PROMO_CARDS, PROMO_RARITY, PROMO_TIERS, RARITIES, packChance, rarityOf } from '../src/lib/game/online/collection-rules';
import { rollPackWithCoaches } from '../server/collection/packs';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

describe('regras das promoções', () => {
  it('têm 4 cartas, 25% de coach, preços 45k/70k/120k e GOAT em cerca de 0,5% do pacote', () => {
    expect(PROMO_TIERS.map((tier) => PACK_PRICES[tier])).toEqual([45_000, 70_000, 120_000]);
    for (const tier of PROMO_TIERS) {
      expect(PACK_SLOTS[tier]).toHaveLength(PROMO_CARDS);
      for (const row of PACK_SLOTS[tier]) expect(RARITIES.reduce((sum, rarity) => sum + row[rarity], 0)).toBeCloseTo(100, 6);
      expect(COACH_CHANCE[tier]).toBe(0.25);
      expect(packChance(tier, ['goat'])).toBeCloseTo(0.005, 6);
      // The first card is the promotion's rarity (or better).
      const first = PACK_SLOTS[tier][0];
      const atLeast = RARITIES.slice(RARITIES.indexOf(PROMO_RARITY[tier]));
      expect(atLeast.reduce((sum, rarity) => sum + first[rarity], 0)).toBe(100);
    }
    expect(packChance('promo_elite', ['legend'])).toBeLessThan(packChance('promo_legend', ['legend']));
  });

  it('a rolagem da promoção é a mesma para a mesma seed e tem 4 cartas', () => {
    const one = rollPackWithCoaches('promo_superstar', 'promo:2026-09-19:superstar', collectionPlayers, collectionCoaches);
    const two = rollPackWithCoaches('promo_superstar', 'promo:2026-09-19:superstar', collectionPlayers, collectionCoaches);
    expect(one).toHaveLength(4);
    expect(two).toEqual(one);
    expect(one[0].kind).toBe('player');
    if (one[0].kind === 'player') expect(['superstar', 'legend', 'goat']).toContain(rarityOf(one[0].player));
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('compra de promoção (Postgres)', () => {
  let db: Db;
  let userId = '';
  const now = Date.UTC(2026, 8, 19, 15);

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_promos');
    await runMigrations(db);
    [{ id: userId }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('promo@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id, coins) VALUES ($1, 50000)', [userId]);
  });
  afterAll(async () => { await db?.close(); });

  it('lista as três do dia, cobra uma vez, recusa a segunda compra e sem saldo dá 402', async () => {
    const { buyPromo, listPromos } = await import('../server/collection/service');
    const listed = await listPromos(db, userId, now);
    expect(listed.day).toBe('2026-09-19');
    expect(listed.endsAt).toBe('2026-09-20T03:00:00.000Z');
    expect(listed.promos.map((promo) => promo.tier)).toEqual([...PROMO_TIERS]);
    const bought = await buyPromo(db, userId, 'promo_elite', now);
    expect(bought.players).toEqual(listed.promos[0].cards);
    await expect(buyPromo(db, userId, 'promo_elite', now)).rejects.toMatchObject({ code: 'PROMO_BOUGHT' });
    await expect(buyPromo(db, userId, 'promo_superstar', now)).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect((await listPromos(db, userId, now)).promos.map((promo) => promo.bought)).toEqual([true, false, false]);
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(5_000 + bought.coinsFromDupes);
    // Next day: a new promotion, buyable again.
    expect((await listPromos(db, userId, now + 86_400_000)).promos[0].bought).toBe(false);
  });
});

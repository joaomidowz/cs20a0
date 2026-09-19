// tests/promos.test.ts
// Promoções diárias: odds puras, 1 carta surpresa (mais 1 coach na Legend) e compra uma vez por dia contra o Postgres local (pulada sem TEST_DATABASE_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionCoaches, collectionPlayers } from '../src/lib/game/online/collection-pool';
import { COACH_CHANCE, PACK_PRICES, PACK_SLOTS, PROMO_BONUS_COACH, PROMO_CARDS, PROMO_RARITY, PROMO_TIERS, RARITIES, rarityOf } from '../src/lib/game/online/collection-rules';
import { rollPackWithCoaches } from '../server/collection/packs';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

describe('regras das promoções', () => {
  it('têm 1 carta, preços 45k/70k/120k, Elite e Superstar puras e Legend com cerca de 30% de Legend', () => {
    expect(PROMO_TIERS.map((tier) => PACK_PRICES[tier])).toEqual([45_000, 70_000, 120_000]);
    for (const tier of PROMO_TIERS) {
      expect(PACK_SLOTS[tier]).toHaveLength(PROMO_CARDS);
      expect(PROMO_CARDS).toBe(1);
      for (const row of PACK_SLOTS[tier]) expect(RARITIES.reduce((sum, rarity) => sum + row[rarity], 0)).toBeCloseTo(100, 6);
    }
    expect(PACK_SLOTS.promo_elite[0].elite).toBe(100);
    expect(PACK_SLOTS.promo_superstar[0].superstar).toBe(100);
    expect(PACK_SLOTS.promo_legend[0].legend).toBe(30);
    expect(PACK_SLOTS.promo_legend[0].superstar).toBe(70);
    expect(COACH_CHANCE.promo_elite).toBe(0);
    expect(COACH_CHANCE.promo_superstar).toBe(0);
    expect(COACH_CHANCE.promo_legend).toBe(1);
    expect(PROMO_BONUS_COACH).toEqual(['promo_legend']);
  });

  it('Elite e Superstar dão 1 carta da raridade; Legend dá 1 carta Legend ou Superstar e mais 1 coach', () => {
    let legends = 0;
    const runs = 400;
    for (let index = 0; index < runs; index += 1) {
      for (const tier of ['promo_elite', 'promo_superstar'] as const) {
        const cards = rollPackWithCoaches(tier, `promo:2026-09-19:${PROMO_RARITY[tier]}:user-${index}`, collectionPlayers, collectionCoaches);
        expect(cards).toHaveLength(1);
        expect(cards[0].kind).toBe('player');
        if (cards[0].kind === 'player') expect(rarityOf(cards[0].player)).toBe(PROMO_RARITY[tier]);
      }
      const legend = rollPackWithCoaches('promo_legend', `promo:2026-09-19:legend:user-${index}`, collectionPlayers, collectionCoaches);
      expect(legend).toHaveLength(2);
      expect(legend[0].kind).toBe('player');
      expect(legend[1].kind).toBe('coach');
      if (legend[0].kind === 'player') {
        expect(['superstar', 'legend']).toContain(rarityOf(legend[0].player));
        if (rarityOf(legend[0].player) === 'legend') legends += 1;
      }
    }
    expect(legends / runs).toBeGreaterThan(0.2);
    expect(legends / runs).toBeLessThan(0.4);
  });

  it('a seed é por usuário: a mesma conta repete a carta, outra conta sorteia a sua', () => {
    const seed = (userId: string) => `promo:2026-09-19:superstar:${userId}`;
    const one = rollPackWithCoaches('promo_superstar', seed('a'), collectionPlayers, collectionCoaches);
    expect(rollPackWithCoaches('promo_superstar', seed('a'), collectionPlayers, collectionCoaches)).toEqual(one);
    const others = Array.from({ length: 20 }, (_, index) => rollPackWithCoaches('promo_superstar', seed(`b${index}`), collectionPlayers, collectionCoaches));
    expect(others.some((cards) => JSON.stringify(cards) !== JSON.stringify(one))).toBe(true);
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

  it('Legend entrega a carta e o coach', async () => {
    const { buyPromo } = await import('../server/collection/service');
    const [{ id: rich }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('promo-legend@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id, coins) VALUES ($1, 200000)', [rich]);
    const bought = await buyPromo(db, rich, 'promo_legend', now);
    expect(bought.players).toHaveLength(2);
    expect(collectionCoaches.some((coach) => coach.id === bought.players[1])).toBe(true);
    expect(bought.seed).toBe(`promo:2026-09-19:legend:${rich}`);
  });

  it('lista as três do dia, cobra uma vez, recusa a segunda compra e sem saldo dá 402', async () => {
    const { buyPromo, listPromos } = await import('../server/collection/service');
    const listed = await listPromos(db, userId, now);
    expect(listed.day).toBe('2026-09-19');
    expect(listed.endsAt).toBe('2026-09-20T03:00:00.000Z');
    expect(listed.promos.map((promo) => promo.tier)).toEqual([...PROMO_TIERS]);
    const bought = await buyPromo(db, userId, 'promo_elite', now);
    expect(bought.players).toHaveLength(1);
    expect(bought.seed).toBe(`promo:2026-09-19:elite:${userId}`);
    await expect(buyPromo(db, userId, 'promo_elite', now)).rejects.toMatchObject({ code: 'PROMO_BOUGHT' });
    await expect(buyPromo(db, userId, 'promo_superstar', now)).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect((await listPromos(db, userId, now)).promos.map((promo) => promo.bought)).toEqual([true, false, false]);
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(5_000 + bought.coinsFromDupes);
    // Next day: a new promotion, buyable again.
    expect((await listPromos(db, userId, now + 86_400_000)).promos[0].bought).toBe(false);
  });
});

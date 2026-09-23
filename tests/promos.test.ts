// tests/promos.test.ts
// Promoção diária de 4 cartas fixas (seed `promo:<dia>`, iguais para todas as contas): regra pura de preço e sorteio, e a compra
// contra o Postgres local (pulada sem TEST_DATABASE_URL): uma vez por dia, recusa quem já tem a carta e cobra o preço puro.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionCoachById, collectionPlayerById } from '../src/lib/game/online/collection-pool';
import { cardCoinValue } from '../src/lib/game/online/card-value';
import { PROMO_DISCOUNT, PROMO_TIERS, isPromoTier, promoFinalPrice, rarityOf, sellValue } from '../src/lib/game/online/collection-rules';
import { PROMO_PLAYER_RARITY, dailyPromos, promoCardId, promoSeed } from '../src/lib/game/online/promos';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

const DAY = '2026-09-19';

describe('regras da promoção diária', () => {
  it('tem 4 ofertas com descontos menores e Legend limitada por semana', () => {
    expect(PROMO_TIERS).toEqual(['promo_elite', 'promo_superstar', 'promo_legend', 'promo_coach']);
    expect(PROMO_DISCOUNT).toEqual({ promo_elite: 30, promo_superstar: 25, promo_legend: 25, promo_coach: 30 });
    expect(isPromoTier('promo_coach')).toBe(true);
    expect(isPromoTier('ouro')).toBe(false);
    expect(promoSeed(DAY)).toBe('promo:2026-09-19');
  });

  it('o preço final é inteiro e aplica o desconto sobre o cardCoinValue', () => {
    expect(promoFinalPrice(10_000, 'promo_elite')).toBe(7_000);
    expect(promoFinalPrice(12_250, 'promo_superstar')).toBe(9_188);
    expect(promoFinalPrice(20_500, 'promo_legend')).toBe(15_375);
    expect(promoFinalPrice(4_001, 'promo_coach')).toBe(2_801);
    for (const offer of dailyPromos(DAY)) {
      expect(offer.originalPrice).toBe(cardCoinValue(offer.cardId));
      expect(offer.price).toBe(promoFinalPrice(offer.originalPrice, offer.tier));
      expect(Number.isInteger(offer.price)).toBe(true);
      expect(offer.price).toBeGreaterThan(0);
      expect(offer.price).toBeLessThan(offer.originalPrice);
      expect(offer.discount).toBe(PROMO_DISCOUNT[offer.tier]);
    }
  });

  it('as cartas são da raridade certa, o coach é um coach, e o mesmo dia repete as mesmas cartas', () => {
    const days = Array.from({ length: 30 }, (_, index) => new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10));
    for (const day of days) {
      const offers = dailyPromos(day);
      expect(offers.map((offer) => offer.tier)).toEqual([...PROMO_TIERS]);
      for (const offer of offers) {
        if (offer.tier === 'promo_coach') expect(collectionCoachById.has(offer.cardId)).toBe(true);
        else expect(rarityOf(collectionPlayerById.get(offer.cardId)!)).toBe(PROMO_PLAYER_RARITY[offer.tier]);
      }
      expect(dailyPromos(day)).toEqual(offers);
    }
    // Different days rotate the cards.
    expect(new Set(days.map((day) => promoCardId('promo_legend', day))).size).toBeGreaterThan(5);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('compra da promoção diária (Postgres)', () => {
  let db: Db;
  const now = Date.UTC(2026, 8, 19, 15);
  const offers = dailyPromos(DAY);
  const elite = offers.find((offer) => offer.tier === 'promo_elite')!;
  const legend = offers.find((offer) => offer.tier === 'promo_legend')!;
  const coach = offers.find((offer) => offer.tier === 'promo_coach')!;

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_promos');
    await runMigrations(db);
  });
  afterAll(async () => { await db?.close(); });

  const newUser = async (email: string, coins: number) => {
    const [{ id }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ($1, now()) RETURNING id`, [email]);
    await db.query('INSERT INTO wallets (user_id, coins) VALUES ($1, $2)', [id, coins]);
    return id;
  };

  it('lista as 4 do dia com o preço puro, cobra uma vez, recusa a segunda e sem saldo dá 402', async () => {
    const { buyPromo, listPromos } = await import('../server/collection/service');
    const userId = await newUser('promo@example.com', elite.price + 1_000);
    const listed = await listPromos(db, userId, now);
    expect(listed.day).toBe(DAY);
    expect(listed.endsAt).toBe('2026-09-20T03:00:00.000Z');
    expect(listed.promos.map(({ tier, cardId, originalPrice, price, discount }) => ({ tier, cardId, originalPrice, price, discount }))).toEqual(offers);
    expect(listed.promos.every((promo) => !promo.bought && !promo.owned)).toBe(true);

    const bought = await buyPromo(db, userId, 'promo_elite', now);
    expect(bought).toMatchObject({ tier: 'promo_elite', cardId: elite.cardId, price: elite.price, wallet: 1_000 });
    await expect(buyPromo(db, userId, 'promo_elite', now)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    await expect(buyPromo(db, userId, 'promo_superstar', now)).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    const after = await listPromos(db, userId, now);
    expect(after.promos.map((promo) => promo.bought)).toEqual([true, false, false, false]);
    const [owned] = await db.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, elite.cardId]);
    expect(owned).toBeTruthy();
    // A failed purchase leaves no purchase row behind.
    expect(await db.query('SELECT tier FROM promo_purchases WHERE user_id = $1', [userId])).toEqual([{ tier: 'promo_elite' }]);
    // Next day: new cards, buyable again.
    expect((await listPromos(db, userId, now + 86_400_000)).promos.every((promo) => !promo.bought)).toBe(true);
  });

  it('a mesma oferta não se compra duas vezes no dia, mesmo depois de vender a carta', async () => {
    const { buyPromo, sellPlayer } = await import('../server/collection/service');
    const userId = await newUser('promo-coach@example.com', 200_000);
    await buyPromo(db, userId, 'promo_coach', now);
    await sellPlayer(db, userId, coach.cardId);
    await expect(buyPromo(db, userId, 'promo_coach', now)).rejects.toMatchObject({ code: 'PROMO_BOUGHT' });
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBeLessThan(200_000);
  });

  it('Legend só pode ser comprada uma vez na mesma semana', async () => {
    const { buyPromo, listPromos, sellPlayer } = await import('../server/collection/service');
    const userId = await newUser('promo-legend@example.com', 200_000);
    await buyPromo(db, userId, 'promo_legend', now);
    await sellPlayer(db, userId, legend.cardId);
    const tomorrow = now + 86_400_000;
    expect((await listPromos(db, userId, tomorrow)).promos.find((promo) => promo.tier === 'promo_legend')?.bought).toBe(true);
    await expect(buyPromo(db, userId, 'promo_legend', tomorrow)).rejects.toMatchObject({ code: 'PROMO_BOUGHT' });
  });

  it('quem já tem a carta vê "já tem" e a compra é recusada sem cobrar', async () => {
    const { buyPromo, listPromos } = await import('../server/collection/service');
    const userId = await newUser('promo-owner@example.com', 200_000);
    await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack')`, [userId, elite.cardId]);
    expect((await listPromos(db, userId, now)).promos[0]).toMatchObject({ owned: true, bought: false });
    await expect(buyPromo(db, userId, 'promo_elite', now)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(200_000);
  });

  it('a mesma carta só gera crédito de venda uma vez', async () => {
    const { sellPlayer } = await import('../server/collection/service');
    const player = collectionPlayerById.values().next().value!;
    const userId = await newUser('promo-sell-once@example.com', 25_000);
    await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack')`, [userId, player.id]);

    const sale = await sellPlayer(db, userId, player.id);
    expect(sale).toEqual({ coins: sellValue(player), wallet: 25_000 + sellValue(player) });
    await expect(sellPlayer(db, userId, player.id)).rejects.toMatchObject({ status: 404, code: 'NOT_OWNED' });

    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    const [ledger] = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM ledger WHERE user_id = $1 AND reason = 'sell' AND ref_id = $2", [userId, player.id]);
    expect(wallet.coins).toBe(25_000 + sellValue(player));
    expect(ledger.count).toBe(1);
  });
});

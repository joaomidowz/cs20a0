// tests/trades.test.ts
// Trocas diretas contra o Postgres local: aceite com posse e coins, carta escalada, expiração e recusa. Pulado sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('trocas (Postgres)', () => {
  let db: Db;
  let ana = '';
  let bia = '';
  const now = Date.UTC(2026, 8, 19, 15);
  const [a1, a2, a3, b1, b2, b3] = collectionPlayers.slice(0, 6).map((player) => player.id);
  const cardsOf = async (userId: string) => (await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1 ORDER BY player_id', [userId])).map((row) => row.player_id);
  const coinsOf = async (userId: string) => (await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0].coins;

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_trades');
    await runMigrations(db);
    [{ id: ana }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at, team_name) VALUES ('ana@example.com', now(), 'Time da Ana') RETURNING id`);
    [{ id: bia }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at, team_name) VALUES ('bia@example.com', now(), 'Bia Gaming') RETURNING id`);
    await db.query('INSERT INTO wallets (user_id, coins) VALUES ($1, 1000), ($2, 0)', [ana, bia]);
    for (const [user, card] of [[ana, a1], [ana, a2], [ana, a3], [bia, b1], [bia, b2], [bia, b3]]) await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack')`, [user, card]);
  });
  afterAll(async () => { await db?.close(); });

  it('aceite troca as cartas e move as coins pelo ledger', async () => {
    const { acceptTrade, listTrades, proposeTrade, tradePartner } = await import('../server/collection/trades');
    expect((await tradePartner(db, ana, 'bia gaming')).cards).toEqual([b1, b2, b3].sort());
    const { id } = await proposeTrade(db, ana, { teamName: 'BIA GAMING', offeredCard: a1, requestedCard: b1, coins: 300 }, now);
    const listed = await listTrades(db, bia, now);
    expect(listed.received).toMatchObject([{ id, partner: 'Time da Ana', offeredCard: a1, requestedCard: b1, coins: 300, status: 'pending' }]);
    expect((await listTrades(db, ana, now)).sent).toHaveLength(1);
    await expect(acceptTrade(db, ana, id, now)).rejects.toMatchObject({ code: 'TRADE_NOT_FOUND' });
    expect(await acceptTrade(db, bia, id, now + 1000)).toEqual({ wallet: 300 });
    expect(await cardsOf(ana)).toContain(b1);
    expect(await cardsOf(ana)).not.toContain(a1);
    expect(await cardsOf(bia)).toContain(a1);
    expect(await coinsOf(ana)).toBe(700);
    const ledger = await db.query<{ delta: number; reason: string }>(`SELECT delta, reason FROM ledger WHERE ref_id = $1 ORDER BY delta`, [`trade:${id}`]);
    expect(ledger).toEqual([{ delta: -300, reason: 'trade' }, { delta: 300, reason: 'trade' }]);
    await expect(acceptTrade(db, bia, id, now + 2000)).rejects.toMatchObject({ code: 'TRADE_CLOSED' });
  });

  it('carta escalada não pode ser oferecida nem aceita', async () => {
    const { acceptTrade, proposeTrade } = await import('../server/collection/trades');
    const { id } = await proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a2, requestedCard: b2, coins: 0 }, now);
    await db.query(`INSERT INTO lineup_slots (user_id, slot_index, player_ids, roles) VALUES ($1, 1, $2, $3)`, [ana, [a2, 'x1', 'x2', 'x3', 'x4'], ['rifler', 'rifler', 'rifler', 'rifler', 'rifler']]);
    await expect(proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a2, requestedCard: b3, coins: 0 }, now)).rejects.toMatchObject({ code: 'IN_LINEUP' });
    await expect(acceptTrade(db, bia, id, now)).rejects.toMatchObject({ code: 'IN_LINEUP' });
    expect(await cardsOf(ana)).toContain(a2);
    expect(await cardsOf(bia)).toContain(b2);
    await db.query('DELETE FROM lineup_slots WHERE user_id = $1', [ana]);
  });

  it('expira em 48h, recusa e cancelamento fecham a proposta, e coins sem saldo dão 402', async () => {
    const { acceptTrade, closeTrade, listTrades, proposeTrade } = await import('../server/collection/trades');
    const { id } = await proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a3, requestedCard: b3, coins: 0 }, now);
    await expect(acceptTrade(db, bia, id, now + 48 * 3_600_000)).rejects.toMatchObject({ code: 'TRADE_EXPIRED' });
    expect((await listTrades(db, bia, now + 48 * 3_600_000)).received.find((trade) => trade.id === id)?.status).toBe('expired');
    const declined = await proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a3, requestedCard: b3, coins: 0 }, now);
    await expect(closeTrade(db, ana, declined.id, 'decline', now)).rejects.toMatchObject({ code: 'TRADE_NOT_FOUND' });
    await closeTrade(db, bia, declined.id, 'decline', now);
    const cancelled = await proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a3, requestedCard: b3, coins: 0 }, now);
    await closeTrade(db, ana, cancelled.id, 'cancel', now);
    const statuses = (await listTrades(db, ana, now)).sent.map((trade) => [trade.id, trade.status]);
    expect(statuses).toEqual(expect.arrayContaining([[declined.id, 'declined'], [cancelled.id, 'cancelled']]));
    await expect(proposeTrade(db, ana, { teamName: 'Bia Gaming', offeredCard: a3, requestedCard: b3, coins: 5000 }, now)).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    await expect(proposeTrade(db, ana, { teamName: 'Ninguém', offeredCard: a3, requestedCard: b3, coins: 0 }, now)).rejects.toMatchObject({ code: 'PARTNER_NOT_FOUND' });
  });
});

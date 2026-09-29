import { isKnownCard } from '../../src/lib/game/online/card-value';
import type { Db, Tx } from '../db/client';
import { CollectionError, applyLedger } from './service';
import { lineupCardIds } from './upgrader';

/** A proposal stays open this long. */
export const TRADE_TTL_MS = 48 * 60 * 60_000;
/** Most coins a proposal can add on top of the card. */
export const TRADE_MAX_COINS = 1_000_000;
export type TradeCoinsPayer = 'from_user' | 'to_user';

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface TradeView {
  id: string;
  direction: 'sent' | 'received';
  /** Team name of the other side. */
  partner: string;
  offeredCard: string;
  requestedCard: string;
  coins: number;
  coinsPayer: TradeCoinsPayer;
  status: TradeStatus;
  createdAt: string;
  expiresAt: string;
}

const copiesOf = async (tx: Tx | Db, userId: string, cardId: string) => (await tx.query<{ quantity: number }>('SELECT quantity FROM collection WHERE user_id = $1 AND player_id = $2', [userId, cardId]))[0]?.quantity ?? 0;
const ownsCard = async (tx: Tx | Db, userId: string, cardId: string) => (await copiesOf(tx, userId, cardId)) > 0;

const availableCopies = async (tx: Tx | Db, userId: string, cardId: string, locked: Set<string>) =>
  Math.max(0, await copiesOf(tx, userId, cardId) - (locked.has(cardId) ? 1 : 0));

/** Finds a verified account by its team name (case-insensitive). The only thing shared back is the name and its cards. */
async function findByTeamName(db: Db | Tx, teamName: string): Promise<{ id: string; team_name: string } | null> {
  const rows = await db.query<{ id: string; team_name: string }>('SELECT id, team_name FROM users WHERE lower(team_name) = lower($1) AND verified_at IS NOT NULL ORDER BY created_at LIMIT 2', [teamName.trim()]);
  return rows.length === 1 ? rows[0] : null;
}

/** Cards another player can trade, leaving one copy behind when a card is on any saved team. */
export async function tradePartner(db: Db, userId: string, teamName: string): Promise<{ teamName: string; cards: string[] }> {
  const partner = await findByTeamName(db, teamName);
  if (!partner || partner.id === userId) throw new CollectionError(404, 'PARTNER_NOT_FOUND', 'Nenhum time com esse nome');
  const locked = await lineupCardIds(db, partner.id);
  const rows = await db.query<{ player_id: string; quantity: number }>('SELECT player_id, quantity FROM collection WHERE user_id = $1 ORDER BY player_id', [partner.id]);
  return { teamName: partner.team_name, cards: rows.filter((row) => row.quantity > (locked.has(row.player_id) ? 1 : 0)).map((row) => row.player_id) };
}

export async function proposeTrade(db: Db, userId: string, input: { teamName: string; offeredCard: string; requestedCard: string; coins: number; coinsPayer?: TradeCoinsPayer }, now: number): Promise<{ id: string }> {
  const { offeredCard, requestedCard, coins } = input;
  const coinsPayer = input.coinsPayer ?? 'from_user';
  if (!Number.isInteger(coins) || coins < 0 || coins > TRADE_MAX_COINS) throw new CollectionError(400, 'BAD_COINS', 'Valor de coins inválido');
  if (coinsPayer !== 'from_user' && coinsPayer !== 'to_user') throw new CollectionError(400, 'BAD_COINS_PAYER', 'Quem paga as coins é inválido');
  if (!isKnownCard(offeredCard) || !isKnownCard(requestedCard)) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  if (offeredCard === requestedCard) throw new CollectionError(400, 'SAME_CARD', 'Troque cartas diferentes');
  const partner = await findByTeamName(db, input.teamName);
  if (!partner || partner.id === userId) throw new CollectionError(404, 'PARTNER_NOT_FOUND', 'Nenhum time com esse nome');
  const ownLineup = await lineupCardIds(db, userId);
  const partnerLineup = await lineupCardIds(db, partner.id);
  if (!(await copiesOf(db, userId, offeredCard))) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
  if (!(await availableCopies(db, userId, offeredCard, ownLineup))) throw new CollectionError(409, 'IN_LINEUP', 'Deixe uma cópia no time antes de oferecer a repetida');
  if (!(await copiesOf(db, partner.id, requestedCard))) throw new CollectionError(404, 'PARTNER_NOT_OWNED', 'O outro time não tem essa carta');
  if (await ownsCard(db, userId, requestedCard)) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
  if (!(await availableCopies(db, partner.id, requestedCard, partnerLineup))) throw new CollectionError(409, 'IN_LINEUP', 'O outro time precisa deixar uma cópia escalada');
  if (coins) {
    const payerId = coinsPayer === 'from_user' ? userId : partner.id;
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [payerId]);
    if ((wallet?.coins ?? 0) < coins) throw new CollectionError(402, 'INSUFFICIENT_COINS', 'Quem paga não tem coins suficientes');
  }
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO trades (from_user, to_user, offered_card, requested_card, coins, coins_payer, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text',
    [userId, partner.id, offeredCard, requestedCard, coins, coinsPayer, new Date(now), new Date(now + TRADE_TTL_MS)]
  );
  return { id: row.id };
}

const expireStale = (db: Db | Tx, now: number) =>
  db.query(`UPDATE trades SET status = 'expired', resolved_at = $1 WHERE status = 'pending' AND expires_at <= $1`, [new Date(now)]);

export async function listTrades(db: Db, userId: string, now: number): Promise<{ received: TradeView[]; sent: TradeView[] }> {
  await expireStale(db, now);
  const rows = await db.query<{ id: string; from_user: string; partner: string | null; offered_card: string; requested_card: string; coins: number; coins_payer: TradeCoinsPayer; status: TradeStatus; created_at: Date; expires_at: Date }>(
    `SELECT t.id::text, t.from_user, u.team_name AS partner, t.offered_card, t.requested_card, t.coins, t.coins_payer, t.status, t.created_at, t.expires_at
     FROM trades t JOIN users u ON u.id = CASE WHEN t.from_user = $1 THEN t.to_user ELSE t.from_user END
     WHERE t.from_user = $1 OR t.to_user = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 100`,
    [userId]
  );
  const views = rows.map((row): TradeView => ({
    id: row.id, direction: row.from_user === userId ? 'sent' : 'received', partner: row.partner ?? '?', offeredCard: row.offered_card, requestedCard: row.requested_card,
    coins: row.coins, coinsPayer: row.coins_payer, status: row.status, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString()
  }));
  return { received: views.filter((view) => view.direction === 'received'), sent: views.filter((view) => view.direction === 'sent') };
}

type TradeRow = { id: string; from_user: string; to_user: string; offered_card: string; requested_card: string; coins: number; coins_payer: TradeCoinsPayer; status: TradeStatus; expires_at: Date };

async function lockPending(tx: Tx, tradeId: string, now: number): Promise<TradeRow> {
  const [trade] = await tx.query<TradeRow>('SELECT id::text, from_user, to_user, offered_card, requested_card, coins, coins_payer, status, expires_at FROM trades WHERE id = $1 FOR UPDATE', [tradeId]);
  if (!trade) throw new CollectionError(404, 'TRADE_NOT_FOUND', 'Proposta não encontrada');
  if (trade.status === 'pending' && trade.expires_at.getTime() <= now) {
    await tx.query(`UPDATE trades SET status = 'expired', resolved_at = $2 WHERE id = $1`, [tradeId, new Date(now)]);
    trade.status = 'expired';
  }
  if (trade.status !== 'pending') throw new CollectionError(409, trade.status === 'expired' ? 'TRADE_EXPIRED' : 'TRADE_CLOSED', trade.status === 'expired' ? 'A proposta expirou' : 'A proposta já foi encerrada');
  return trade;
}

/**
 * Accepts a proposal in one transaction: locks and transfers one available copy of each card, keeps lineup reserves,
 * and moves the coins through the ledger. Any failure leaves everything as it was.
 */
export async function acceptTrade(db: Db, userId: string, tradeId: string, now: number): Promise<{ wallet: number }> {
  return db.tx(async (tx) => {
    const trade = await lockPending(tx, tradeId, now);
    if (trade.to_user !== userId) throw new CollectionError(404, 'TRADE_NOT_FOUND', 'Proposta não encontrada');
    const fromLineup = await lineupCardIds(tx, trade.from_user);
    const toLineup = await lineupCardIds(tx, userId);
    const lockedRows = await tx.query<{ user_id: string; player_id: string; quantity: number }>(
      'SELECT user_id, player_id, quantity FROM collection WHERE (user_id = $1 AND player_id = $2) OR (user_id = $3 AND player_id = $4) ORDER BY user_id, player_id FOR UPDATE',
      [trade.from_user, trade.offered_card, userId, trade.requested_card]
    );
    const sourceCards = new Map(lockedRows.map((row) => [`${row.user_id}:${row.player_id}`, row.quantity]));
    const fromQuantity = sourceCards.get(`${trade.from_user}:${trade.offered_card}`) ?? 0;
    const toQuantity = sourceCards.get(`${userId}:${trade.requested_card}`) ?? 0;
    if (!fromQuantity || !toQuantity) throw new CollectionError(409, 'NOT_OWNED', 'Uma das cartas não está mais disponível');
    if (fromQuantity <= (fromLineup.has(trade.offered_card) ? 1 : 0) || toQuantity <= (toLineup.has(trade.requested_card) ? 1 : 0)) throw new CollectionError(409, 'IN_LINEUP', 'Deixe uma cópia das cartas escaladas nos times');
    const consumeCopy = async (ownerId: string, cardId: string, quantity: number) => {
      if (quantity === 1) await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2', [ownerId, cardId]);
      else await tx.query('UPDATE collection SET quantity = quantity - 1 WHERE user_id = $1 AND player_id = $2', [ownerId, cardId]);
    };
    await consumeCopy(trade.from_user, trade.offered_card, fromQuantity);
    await consumeCopy(userId, trade.requested_card, toQuantity);
    const addCopy = async (ownerId: string, cardId: string) => tx.query(
      `INSERT INTO collection (user_id, player_id, source, quantity) VALUES ($1, $2, 'trade', 1)
       ON CONFLICT (user_id, player_id) DO UPDATE SET quantity = collection.quantity + 1`,
      [ownerId, cardId]
    );
    await addCopy(userId, trade.offered_card);
    await addCopy(trade.from_user, trade.requested_card);
    const ref = `trade:${trade.id}`;
    const payerId = trade.coins_payer === 'from_user' ? trade.from_user : userId;
    const receiverId = trade.coins_payer === 'from_user' ? userId : trade.from_user;
    if (trade.coins) {
      await applyLedger(tx, payerId, -trade.coins, 'trade', ref);
      await applyLedger(tx, receiverId, trade.coins, 'trade', ref);
    }
    const wallet = (await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0]?.coins ?? 0;
    await tx.query(`UPDATE trades SET status = 'accepted', resolved_at = $2 WHERE id = $1`, [trade.id, new Date(now)]);
    return { wallet };
  });
}

/** Declined by the receiver or cancelled by the sender. */
export async function closeTrade(db: Db, userId: string, tradeId: string, action: 'decline' | 'cancel', now: number): Promise<void> {
  await db.tx(async (tx) => {
    const trade = await lockPending(tx, tradeId, now);
    const allowed = action === 'decline' ? trade.to_user === userId : trade.from_user === userId;
    if (!allowed) throw new CollectionError(404, 'TRADE_NOT_FOUND', 'Proposta não encontrada');
    await tx.query('UPDATE trades SET status = $2, resolved_at = $3 WHERE id = $1', [trade.id, action === 'decline' ? 'declined' : 'cancelled', new Date(now)]);
  });
}

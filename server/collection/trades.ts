import { isKnownCard } from '../../src/lib/game/online/card-value';
import type { Db, Tx } from '../db/client';
import { CollectionError, applyLedger } from './service';
import { lineupCardIds } from './upgrader';

/** A proposal stays open this long. */
export const TRADE_TTL_MS = 48 * 60 * 60_000;
/** Most coins a proposal can add on top of the card. */
export const TRADE_MAX_COINS = 1_000_000;

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface TradeView {
  id: string;
  direction: 'sent' | 'received';
  /** Team name of the other side. */
  partner: string;
  offeredCard: string;
  requestedCard: string;
  coins: number;
  status: TradeStatus;
  createdAt: string;
  expiresAt: string;
}

const ownsCard = async (tx: Tx | Db, userId: string, cardId: string) => (await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, cardId])).length > 0;

/** Finds a verified account by its team name (case-insensitive). The only thing shared back is the name and its cards. */
async function findByTeamName(db: Db | Tx, teamName: string): Promise<{ id: string; team_name: string } | null> {
  const rows = await db.query<{ id: string; team_name: string }>('SELECT id, team_name FROM users WHERE lower(team_name) = lower($1) AND verified_at IS NOT NULL ORDER BY created_at LIMIT 2', [teamName.trim()]);
  return rows.length === 1 ? rows[0] : null;
}

/** The cards another player could trade: their collection minus the saved team. */
export async function tradePartner(db: Db, userId: string, teamName: string): Promise<{ teamName: string; cards: string[] }> {
  const partner = await findByTeamName(db, teamName);
  if (!partner || partner.id === userId) throw new CollectionError(404, 'PARTNER_NOT_FOUND', 'Nenhum time com esse nome');
  const locked = await lineupCardIds(db, partner.id);
  const rows = await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1 ORDER BY player_id', [partner.id]);
  return { teamName: partner.team_name, cards: rows.map((row) => row.player_id).filter((id) => !locked.has(id)) };
}

export async function proposeTrade(db: Db, userId: string, input: { teamName: string; offeredCard: string; requestedCard: string; coins: number }, now: number): Promise<{ id: string }> {
  const { offeredCard, requestedCard, coins } = input;
  if (!Number.isInteger(coins) || coins < 0 || coins > TRADE_MAX_COINS) throw new CollectionError(400, 'BAD_COINS', 'Valor de coins inválido');
  if (!isKnownCard(offeredCard) || !isKnownCard(requestedCard)) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  if (offeredCard === requestedCard) throw new CollectionError(400, 'SAME_CARD', 'Troque cartas diferentes');
  const partner = await findByTeamName(db, input.teamName);
  if (!partner || partner.id === userId) throw new CollectionError(404, 'PARTNER_NOT_FOUND', 'Nenhum time com esse nome');
  if (!(await ownsCard(db, userId, offeredCard))) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
  if ((await lineupCardIds(db, userId)).has(offeredCard)) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de oferecer');
  if (!(await ownsCard(db, partner.id, requestedCard))) throw new CollectionError(404, 'PARTNER_NOT_OWNED', 'O outro time não tem essa carta');
  if (await ownsCard(db, userId, requestedCard)) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
  if ((await lineupCardIds(db, partner.id)).has(requestedCard)) throw new CollectionError(409, 'IN_LINEUP', 'Essa carta está escalada no outro time');
  if (coins) {
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    if ((wallet?.coins ?? 0) < coins) throw new CollectionError(402, 'INSUFFICIENT_COINS', 'Coins insuficientes');
  }
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO trades (from_user, to_user, offered_card, requested_card, coins, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text',
    [userId, partner.id, offeredCard, requestedCard, coins, new Date(now), new Date(now + TRADE_TTL_MS)]
  );
  return { id: row.id };
}

const expireStale = (db: Db | Tx, now: number) =>
  db.query(`UPDATE trades SET status = 'expired', resolved_at = $1 WHERE status = 'pending' AND expires_at <= $1`, [new Date(now)]);

export async function listTrades(db: Db, userId: string, now: number): Promise<{ received: TradeView[]; sent: TradeView[] }> {
  await expireStale(db, now);
  const rows = await db.query<{ id: string; from_user: string; partner: string | null; offered_card: string; requested_card: string; coins: number; status: TradeStatus; created_at: Date; expires_at: Date }>(
    `SELECT t.id::text, t.from_user, u.team_name AS partner, t.offered_card, t.requested_card, t.coins, t.status, t.created_at, t.expires_at
     FROM trades t JOIN users u ON u.id = CASE WHEN t.from_user = $1 THEN t.to_user ELSE t.from_user END
     WHERE t.from_user = $1 OR t.to_user = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 100`,
    [userId]
  );
  const views = rows.map((row): TradeView => ({
    id: row.id, direction: row.from_user === userId ? 'sent' : 'received', partner: row.partner ?? '?', offeredCard: row.offered_card, requestedCard: row.requested_card,
    coins: row.coins, status: row.status, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString()
  }));
  return { received: views.filter((view) => view.direction === 'received'), sent: views.filter((view) => view.direction === 'sent') };
}

type TradeRow = { id: string; from_user: string; to_user: string; offered_card: string; requested_card: string; coins: number; status: TradeStatus; expires_at: Date };

async function lockPending(tx: Tx, tradeId: string, now: number): Promise<TradeRow> {
  const [trade] = await tx.query<TradeRow>('SELECT id::text, from_user, to_user, offered_card, requested_card, coins, status, expires_at FROM trades WHERE id = $1 FOR UPDATE', [tradeId]);
  if (!trade) throw new CollectionError(404, 'TRADE_NOT_FOUND', 'Proposta não encontrada');
  if (trade.status === 'pending' && trade.expires_at.getTime() <= now) {
    await tx.query(`UPDATE trades SET status = 'expired', resolved_at = $2 WHERE id = $1`, [tradeId, new Date(now)]);
    trade.status = 'expired';
  }
  if (trade.status !== 'pending') throw new CollectionError(409, trade.status === 'expired' ? 'TRADE_EXPIRED' : 'TRADE_CLOSED', trade.status === 'expired' ? 'A proposta expirou' : 'A proposta já foi encerrada');
  return trade;
}

/**
 * Accepts a proposal in one transaction: checks that both cards are still owned and off both teams, swaps them and moves
 * the coins through the ledger. Any failure leaves everything as it was.
 */
export async function acceptTrade(db: Db, userId: string, tradeId: string, now: number): Promise<{ wallet: number }> {
  return db.tx(async (tx) => {
    const trade = await lockPending(tx, tradeId, now);
    if (trade.to_user !== userId) throw new CollectionError(404, 'TRADE_NOT_FOUND', 'Proposta não encontrada');
    if ((await lineupCardIds(tx, trade.from_user)).has(trade.offered_card) || (await lineupCardIds(tx, userId)).has(trade.requested_card)) throw new CollectionError(409, 'IN_LINEUP', 'Uma das cartas está escalada');
    const fromGave = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 RETURNING player_id', [trade.from_user, trade.offered_card]);
    const toGave = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 RETURNING player_id', [userId, trade.requested_card]);
    if (!fromGave.length || !toGave.length) throw new CollectionError(409, 'NOT_OWNED', 'Uma das cartas não está mais disponível');
    const intoTo = await tx.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'trade') ON CONFLICT DO NOTHING RETURNING player_id`, [userId, trade.offered_card]);
    const intoFrom = await tx.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'trade') ON CONFLICT DO NOTHING RETURNING player_id`, [trade.from_user, trade.requested_card]);
    if (!intoTo.length || !intoFrom.length) throw new CollectionError(409, 'ALREADY_OWNED', 'Um dos lados já tem a carta que receberia');
    const ref = `trade:${trade.id}`;
    if (trade.coins) await applyLedger(tx, trade.from_user, -trade.coins, 'trade', ref);
    const wallet = trade.coins ? await applyLedger(tx, userId, trade.coins, 'trade', ref) : (await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0]?.coins ?? 0;
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

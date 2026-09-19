import { CARDS_PER_PACK, DAILY_BASIC_PACKS, DUPLICATE_RATIO, PACK_PRICES, PROMO_RARITY, PROMO_TIERS, type PromoTier, coachCoinValue, coachSellValue, coinValue, sellValue, type PackTier } from '../../src/lib/game/online/collection-rules';
import { collectionCoachById, collectionCoaches, collectionPlayerById as playerById, collectionPlayers as players, collectionTeams } from '../../src/lib/game/online/collection-pool';
import { validateLineup } from '../../src/lib/game/online/collection-lineup';
import { isValidLineupMapSelection } from '../../src/lib/game/maps';
import type { LineupSlotRole, MapId, OrgStyle, Player } from '../../src/lib/game/types';
import type { Db, Tx } from '../db/client';
import { rollPackWithCoaches, type PackCard } from './packs';
import { dayKeyUtcMinus3 } from './time';

export class CollectionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string = code) {
    super(message);
  }
}

export type LedgerReason = 'pack_open' | 'duplicate' | 'sell' | 'buy_pack' | 'match_reward' | 'season_prize' | 'award' | 'purchase' | 'refund' | 'chargeback' | 'welcome' | 'mission_reward' | 'trade';

/** The only writer of `wallets`: every change is a ledger row first. Throws INSUFFICIENT_COINS when the balance would go negative. */
export async function applyLedger(tx: Tx, userId: string, delta: number, reason: LedgerReason, refId: string | null = null): Promise<number> {
  await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
  const [wallet] = await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  if (wallet.coins + delta < 0) throw new CollectionError(402, 'INSUFFICIENT_COINS', 'Coins insuficientes');
  await tx.query('INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, $3, $4)', [userId, delta, reason, refId]);
  const [updated] = await tx.query<{ coins: number }>('UPDATE wallets SET coins = coins + $2, updated_at = now() WHERE user_id = $1 RETURNING coins', [userId, delta]);
  return updated.coins;
}

export interface CollectionView {
  wallet: number;
  count: number;
  players: Array<{ playerId: string; acquiredAt: string }>;
  packsToday: { granted: number; opened: number };
  lineup: LineupView | null;
}

export interface LineupView {
  playerIds: string[];
  roles: LineupSlotRole[];
  starPlayerId: string | null;
  coachId: string | null;
  style: OrgStyle;
  starEffective: boolean;
  /** Three maps chosen for this team; null means the default for the five cards. */
  mapPreferences: MapId[] | null;
}

type LineupRow = { player_ids: string[]; roles: string[]; star_player_id: string | null; coach_id: string | null; style: string; map_preferences: string[] | null };
const LINEUP_COLUMNS = 'player_ids, roles, star_player_id, coach_id, style, map_preferences';

const lineupView = (row: LineupRow | undefined): LineupView | null => {
  if (!row) return null;
  const chosen = row.player_ids.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
  const check = validateLineup({ players: chosen, roles: row.roles as LineupSlotRole[], starPlayerId: row.star_player_id }, (id) => playerById.get(id));
  return { playerIds: row.player_ids, roles: row.roles as LineupSlotRole[], starPlayerId: row.star_player_id, coachId: row.coach_id, style: row.style as OrgStyle, starEffective: check.starEffective,
    // Maps saved for another five (a card sold since) fall back to the default.
    mapPreferences: row.map_preferences && isValidLineupMapSelection(row.map_preferences, chosen, collectionTeams) ? row.map_preferences : null };
};

/** What a repeated card pays: the same share as selling it. */
const duplicateValue = (id: string) => {
  const coach = collectionCoachById.get(id);
  if (coach) return Math.floor(coachCoinValue(coach) * DUPLICATE_RATIO);
  const player = playerById.get(id);
  return player ? Math.floor(coinValue(player) * DUPLICATE_RATIO) : 0;
};
const cardId = (card: PackCard) => (card.kind === 'coach' ? card.coach.id : card.player.id);

export async function getCollection(db: Db, userId: string, now: number): Promise<CollectionView> {
  const day = dayKeyUtcMinus3(now);
  const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
  const rows = await db.query<{ player_id: string; acquired_at: Date }>('SELECT player_id, acquired_at FROM collection WHERE user_id = $1 ORDER BY acquired_at DESC', [userId]);
  const [grant] = await db.query<{ granted: number; opened: number }>('SELECT granted, opened FROM pack_grants WHERE user_id = $1 AND day = $2', [userId, day]);
  const [lineup] = await db.query<LineupRow>(`SELECT ${LINEUP_COLUMNS} FROM lineups WHERE user_id = $1`, [userId]);
  return {
    wallet: wallet?.coins ?? 0,
    count: rows.length,
    players: rows.map((row) => ({ playerId: row.player_id, acquiredAt: row.acquired_at.toISOString() })),
    packsToday: { granted: grant?.granted ?? DAILY_BASIC_PACKS, opened: grant?.opened ?? 0 },
    lineup: lineupView(lineup)
  };
}

export interface PackResult {
  tier: PackTier;
  seed: string;
  players: string[];
  duplicates: string[];
  coinsFromDupes: number;
  wallet: number;
}

async function addCards(tx: Tx, userId: string, cards: PackCard[], seed: string): Promise<{ duplicates: string[]; coinsFromDupes: number; wallet: number }> {
  const duplicates: string[] = [];
  let coinsFromDupes = 0;
  for (const card of cards) {
    const id = cardId(card);
    const inserted = await tx.query<{ player_id: string }>('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING player_id', [userId, id, 'pack']);
    if (!inserted.length) { duplicates.push(id); coinsFromDupes += duplicateValue(id); }
  }
  let wallet = coinsFromDupes ? await applyLedger(tx, userId, coinsFromDupes, 'duplicate', seed) : (await tx.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]))[0]?.coins ?? 0;
  return { duplicates, coinsFromDupes, wallet };
}

/** One of the two daily basic packs; the seed makes the reveal reproducible and the grant row keeps it idempotent. */
export async function openDailyPack(db: Db, userId: string, now: number): Promise<PackResult> {
  const day = dayKeyUtcMinus3(now);
  return db.tx(async (tx) => {
    await tx.query('INSERT INTO pack_grants (user_id, day, granted, opened) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING', [userId, day, DAILY_BASIC_PACKS]);
    const [grant] = await tx.query<{ granted: number; opened: number }>('SELECT granted, opened FROM pack_grants WHERE user_id = $1 AND day = $2 FOR UPDATE', [userId, day]);
    if (grant.opened >= grant.granted) throw new CollectionError(409, 'NO_PACKS_LEFT', 'Sem pacotes hoje');
    const seed = `${userId}:${day}:${grant.opened + 1}`;
    const cards = rollPackWithCoaches('basic', seed, players, collectionCoaches);
    await tx.query('UPDATE pack_grants SET opened = opened + 1 WHERE user_id = $1 AND day = $2', [userId, day]);
    await tx.query('INSERT INTO pack_opens (user_id, tier, seed, player_ids) VALUES ($1, $2, $3, $4)', [userId, 'basic', seed, cards.map(cardId)]);
    await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const added = await addCards(tx, userId, cards, seed);
    await tx.query('UPDATE pack_opens SET coins_from_dupes = $2 WHERE seed = $1', [seed, added.coinsFromDupes]);
    return { tier: 'basic', seed, players: cards.map(cardId), ...added };
  });
}

export async function buyPack(db: Db, userId: string, tier: PackTier, now: number, year?: number): Promise<PackResult> {
  if (tier === 'basic' || (PROMO_TIERS as readonly string[]).includes(tier)) throw new CollectionError(400, 'BAD_TIER', 'Esse pacote não se compra por aqui');
  if (tier === 'era' && (!year || !players.some((player) => player.year === year))) throw new CollectionError(400, 'BAD_YEAR', 'Escolha um ano válido');
  return db.tx(async (tx) => {
    const price = PACK_PRICES[tier];
    await applyLedger(tx, userId, -price, 'buy_pack', tier);
    const [{ id }] = await tx.query<{ id: string }>('SELECT max(id)::text AS id FROM ledger WHERE user_id = $1', [userId]);
    const seed = `${userId}:${new Date(now).toISOString()}:${id}`;
    const cards = rollPackWithCoaches(tier, seed, players, collectionCoaches, tier === 'era' ? { year } : {});
    await tx.query('INSERT INTO pack_opens (user_id, tier, seed, player_ids) VALUES ($1, $2, $3, $4)', [userId, tier, seed, cards.map(cardId)]);
    const added = await addCards(tx, userId, cards, seed);
    await tx.query('UPDATE pack_opens SET coins_from_dupes = $2 WHERE seed = $1', [seed, added.coinsFromDupes]);
    return { tier, seed, players: cards.map(cardId), ...added };
  });
}

export interface PromoView {
  tier: PromoTier;
  price: number;
  /** The day's four cards: the same for everyone, drawn from `promo:<day>:<rarity>`. */
  cards: string[];
  bought: boolean;
}

/** Seed of a daily promotion: everyone sees (and buys) the same four cards that day. */
export const promoSeed = (day: string, tier: PromoTier) => `promo:${day}:${PROMO_RARITY[tier]}`;
const promoCards = (day: string, tier: PromoTier) => rollPackWithCoaches(tier, promoSeed(day, tier), players, collectionCoaches);
/** Next midnight in Brasília (UTC-3), when the promotions turn over. */
const nextDayStart = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1, 3)).toISOString(); };

export async function listPromos(db: Db, userId: string, now: number): Promise<{ day: string; endsAt: string; promos: PromoView[] }> {
  const day = dayKeyUtcMinus3(now);
  const bought = new Set((await db.query<{ tier: string }>('SELECT tier FROM promo_purchases WHERE user_id = $1 AND day = $2', [userId, day])).map((row) => row.tier));
  return { day, endsAt: nextDayStart(day), promos: PROMO_TIERS.map((tier) => ({ tier, price: PACK_PRICES[tier], cards: promoCards(day, tier).map(cardId), bought: bought.has(tier) })) };
}

/** Buys today's promotion of one rarity, once per account per day. */
export async function buyPromo(db: Db, userId: string, tier: PromoTier, now: number): Promise<PackResult> {
  const day = dayKeyUtcMinus3(now);
  const cards = promoCards(day, tier);
  const seed = `${promoSeed(day, tier)}:${userId}`;
  return db.tx(async (tx) => {
    const inserted = await tx.query('INSERT INTO promo_purchases (user_id, day, tier, seed) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING tier', [userId, day, tier, seed]);
    if (!inserted.length) throw new CollectionError(409, 'PROMO_BOUGHT', 'Você já comprou essa promoção hoje');
    await applyLedger(tx, userId, -PACK_PRICES[tier], 'buy_pack', tier);
    await tx.query('INSERT INTO pack_opens (user_id, tier, seed, player_ids) VALUES ($1, $2, $3, $4)', [userId, tier, seed, cards.map(cardId)]);
    const added = await addCards(tx, userId, cards, seed);
    await tx.query('UPDATE pack_opens SET coins_from_dupes = $2 WHERE seed = $1', [seed, added.coinsFromDupes]);
    return { tier, seed, players: cards.map(cardId), ...added };
  });
}

export async function sellPlayer(db: Db, userId: string, playerId: string): Promise<{ coins: number; wallet: number }> {
  const coach = collectionCoachById.get(playerId);
  const player = playerById.get(playerId);
  if (!coach && !player) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  return db.tx(async (tx) => {
    const [lineup] = await tx.query<{ player_ids: string[]; coach_id: string | null }>('SELECT player_ids, coach_id FROM lineups WHERE user_id = $1', [userId]);
    if (lineup?.player_ids.includes(playerId) || lineup?.coach_id === playerId) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de vender');
    const removed = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 RETURNING player_id', [userId, playerId]);
    if (!removed.length) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
    const coins = coach ? coachSellValue(coach) : sellValue(player!);
    const wallet = await applyLedger(tx, userId, coins, 'sell', playerId);
    return { coins, wallet };
  });
}

export interface LineupInput {
  playerIds: string[];
  roles: LineupSlotRole[];
  starPlayerId: string | null;
  coachId: string | null;
  style: OrgStyle;
  mapPreferences?: string[] | null;
}

export async function saveLineup(db: Db, userId: string, input: LineupInput): Promise<LineupView> {
  if (input.playerIds.length !== 5 || input.roles.length !== 5 || new Set(input.playerIds).size !== 5) throw new CollectionError(400, 'LINEUP_SIZE', 'O time tem cinco cartas');
  const chosen = input.playerIds.map((id) => playerById.get(id));
  if (chosen.some((player) => !player)) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Jogador desconhecido');
  if (input.coachId && !collectionCoachById.has(input.coachId)) throw new CollectionError(404, 'UNKNOWN_COACH', 'Coach desconhecido');
  const wanted = input.coachId ? [...input.playerIds, input.coachId] : input.playerIds;
  const owned = await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1 AND player_id = ANY($2)', [userId, wanted]);
  if (owned.length !== wanted.length) throw new CollectionError(403, 'NOT_OWNED', 'Só cartas da sua coleção entram no time');
  const check = validateLineup({ players: chosen as Player[], roles: input.roles, starPlayerId: input.starPlayerId }, (id) => playerById.get(id));
  if (!check.ok) throw new CollectionError(400, 'INVALID_LINEUP', check.problems.join('; '));
  const maps = input.mapPreferences?.length ? input.mapPreferences : null;
  if (maps && !isValidLineupMapSelection(maps, chosen as Player[], collectionTeams)) throw new CollectionError(400, 'INVALID_MAPS', 'Escolha três mapas que o time conhece');
  await db.query(
    `INSERT INTO lineups (user_id, player_ids, roles, star_player_id, style, coach_id, map_preferences) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET player_ids = $2, roles = $3, star_player_id = $4, style = $5, coach_id = $6, map_preferences = $7, updated_at = now()`,
    [userId, input.playerIds, input.roles, input.starPlayerId, input.style, input.coachId, maps]
  );
  return { playerIds: input.playerIds, roles: input.roles, starPlayerId: input.starPlayerId, coachId: input.coachId, style: input.style, starEffective: check.starEffective, mapPreferences: maps as MapId[] | null };
}

export async function getLineup(db: Db, userId: string): Promise<LineupView | null> {
  const [row] = await db.query<LineupRow>(`SELECT ${LINEUP_COLUMNS} FROM lineups WHERE user_id = $1`, [userId]);
  return lineupView(row);
}

export const CARDS = CARDS_PER_PACK;

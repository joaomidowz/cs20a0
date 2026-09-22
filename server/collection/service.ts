import { CARDS_PER_PACK, DAILY_BASIC_PACKS, DUPLICATE_RATIO, FREE_PACK_TIERS, LINEUP_SLOTS_FREE, LINEUP_SLOTS_MAX, LINEUP_SLOT_PRICE, PACK_PRICES, type FreePackTier, type PromoTier, coachCoinValue, coachSellValue, coinValue, sellValue, type PackTier } from '../../src/lib/game/online/collection-rules';
import { collectionCoachById, collectionCoaches, collectionOrganizationByKey, collectionPlayerById as playerById, collectionPlayers as players, collectionTeams } from '../../src/lib/game/online/collection-pool';
import { dailyPromos, promoSeed, type PromoCard } from '../../src/lib/game/online/promos';
import { validateLineup, type CollectionSlotRole } from '../../src/lib/game/online/collection-lineup';
import { isValidLineupMapSelection } from '../../src/lib/game/maps';
import type { LineupSlotRole, MapId, OrgStyle, Player } from '../../src/lib/game/types';
import type { Db, Tx } from '../db/client';
import { rollPackWithCoaches, type PackCard } from './packs';
import { dayKeyUtcMinus3, isoWeekKeyUtcMinus3, monthKeyUtcMinus3 } from './time';

export class CollectionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string = code) {
    super(message);
  }
}

export type LedgerReason = 'pack_open' | 'duplicate' | 'sell' | 'buy_pack' | 'match_reward' | 'season_prize' | 'award' | 'purchase' | 'refund' | 'chargeback' | 'welcome' | 'mission_reward' | 'trade' | 'upgrade_consolation';

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
  /** Free packs still available this period: Prata once per ISO week, Ouro once per month (Brasília). */
  freePacks: Record<FreePackTier, boolean>;
  /** The ACTIVE lineup: the one that plays (kept as `lineup` for older clients). */
  lineup: LineupView | null;
  /** Every saved lineup, by slot; how many slots this account unlocked; which slot plays. */
  lineups: LineupView[];
  unlockedSlots: number;
  activeSlot: number;
}

export interface LineupView {
  /** Which lineup slot this team occupies (0..LINEUP_SLOTS_MAX-1). */
  slotIndex: number;
  playerIds: string[];
  roles: CollectionSlotRole[];
  starPlayerId: string | null;
  coachId: string | null;
  style: OrgStyle;
  starEffective: boolean;
  /** Three maps chosen for this team; null means the default for the five cards. */
  mapPreferences: MapId[] | null;
}

type LineupRow = { slot_index: number; player_ids: string[]; roles: string[]; star_player_id: string | null; coach_id: string | null; style: string; map_preferences: string[] | null };
const LINEUP_COLUMNS = 'slot_index, player_ids, roles, star_player_id, coach_id, style, map_preferences';

const lineupView = (row: LineupRow | undefined): LineupView | null => {
  if (!row) return null;
  const chosen = row.player_ids.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
  const check = validateLineup({ players: chosen, roles: row.roles as CollectionSlotRole[], starPlayerId: row.star_player_id }, (id) => playerById.get(id));
  return { slotIndex: row.slot_index, playerIds: row.player_ids, roles: row.roles as CollectionSlotRole[], starPlayerId: row.star_player_id, coachId: row.coach_id, style: row.style as OrgStyle, starEffective: check.starEffective,
    // Maps saved for another five (a card sold since) fall back to the default.
    mapPreferences: row.map_preferences && isValidLineupMapSelection(row.map_preferences, chosen, collectionTeams) ? row.map_preferences : null };
};

/** How many slots this account unlocked (contiguous from 0; every account starts with the free ones). */
const unlockedSlotCount = async (executor: Db | Tx, userId: string): Promise<number> => {
  const [row] = await executor.query<{ count: number }>('SELECT count(*)::int AS count FROM lineup_slot_unlocks WHERE user_id = $1', [userId]);
  return Math.min(row?.count ?? LINEUP_SLOTS_FREE, LINEUP_SLOTS_MAX);
};

const activeSlotOf = async (executor: Db | Tx, userId: string): Promise<number> => {
  const [row] = await executor.query<{ active_lineup_slot: number }>('SELECT active_lineup_slot FROM users WHERE id = $1', [userId]);
  return row?.active_lineup_slot ?? 0;
};

/** Throws when the slot does not exist for this account (not unlocked or out of range). */
const requireUnlockedSlot = async (executor: Db | Tx, userId: string, slotIndex: number): Promise<void> => {
  const unlocked = await unlockedSlotCount(executor, userId);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= unlocked) throw new CollectionError(403, 'SLOT_LOCKED', 'Essa vaga de lineup ainda está bloqueada');
};

/** What a repeated card pays; intentionally lower than a voluntary direct sale. */
export const duplicateValue = (id: string) => {
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
  const lineups = await getLineups(db, userId);
  const claimed = new Set((await db.query<{ tier: string }>(
    'SELECT tier FROM free_pack_claims WHERE user_id = $1 AND ((tier = $2 AND period_key = $3) OR (tier = $4 AND period_key = $5))',
    [userId, 'prata', freePackPeriod('prata', now), 'ouro', freePackPeriod('ouro', now)]
  )).map((row) => row.tier));
  return {
    wallet: wallet?.coins ?? 0,
    count: rows.length,
    players: rows.map((row) => ({ playerId: row.player_id, acquiredAt: row.acquired_at.toISOString() })),
    packsToday: { granted: Math.max(grant?.granted ?? 0, DAILY_BASIC_PACKS), opened: grant?.opened ?? 0 },
    freePacks: { prata: !claimed.has('prata'), ouro: !claimed.has('ouro') },
    lineup: lineups.lineups.find((lineup) => lineup.slotIndex === lineups.activeSlot) ?? null,
    lineups: lineups.lineups,
    unlockedSlots: lineups.unlockedSlots,
    activeSlot: lineups.activeSlot
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

/** Period a free pack belongs to: the ISO week for Prata, the month for Ouro, both in Brasília time. */
export const freePackPeriod = (tier: FreePackTier, now: number) => (tier === 'prata' ? isoWeekKeyUtcMinus3(now) : monthKeyUtcMinus3(now));

/** One of the daily basic packs; the seed makes the reveal reproducible and the grant row keeps it idempotent. */
export async function openDailyPack(db: Db, userId: string, now: number): Promise<PackResult> {
  const day = dayKeyUtcMinus3(now);
  return db.tx(async (tx) => {
    await tx.query('INSERT INTO pack_grants (user_id, day, granted, opened) VALUES ($1, $2, $3, 0) ON CONFLICT (user_id, day) DO UPDATE SET granted = GREATEST(pack_grants.granted, EXCLUDED.granted)', [userId, day, DAILY_BASIC_PACKS]);
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

/**
 * The free Prata (once per ISO week) or Ouro (once per month) pack of the account: the same roll as a bought pack, no
 * coins charged. The claim row's primary key keeps it to once per period, even with two requests at the same time.
 */
export async function openFreePack(db: Db, userId: string, tier: FreePackTier, now: number): Promise<PackResult> {
  if (!(FREE_PACK_TIERS as readonly string[]).includes(tier)) throw new CollectionError(400, 'BAD_TIER', 'Esse pacote não sai grátis');
  const period = freePackPeriod(tier, now);
  const seed = `${userId}:free:${tier}:${period}`;
  return db.tx(async (tx) => {
    const claimed = await tx.query('INSERT INTO free_pack_claims (user_id, tier, period_key, seed) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING tier', [userId, tier, period, seed]);
    if (!claimed.length) throw new CollectionError(409, 'FREE_PACK_USED', tier === 'prata' ? 'O Prata grátis desta semana já foi aberto' : 'O Ouro grátis deste mês já foi aberto');
    const cards = rollPackWithCoaches(tier, seed, players, collectionCoaches);
    await tx.query('INSERT INTO pack_opens (user_id, tier, seed, player_ids) VALUES ($1, $2, $3, $4)', [userId, tier, seed, cards.map(cardId)]);
    await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const added = await addCards(tx, userId, cards, seed);
    await tx.query('UPDATE pack_opens SET coins_from_dupes = $2 WHERE seed = $1', [seed, added.coinsFromDupes]);
    return { tier, seed, players: cards.map(cardId), ...added };
  });
}

export async function buyPack(db: Db, userId: string, tier: PackTier, now: number, year?: number, role?: LineupSlotRole, organization?: string): Promise<PackResult> {
  if (tier === 'basic' || !(tier in PACK_PRICES)) throw new CollectionError(400, 'BAD_TIER', 'Esse pacote não se compra por aqui');
  if (tier === 'era' && (!year || !players.some((player) => player.year === year))) throw new CollectionError(400, 'BAD_YEAR', 'Escolha um ano válido');
  if (tier === 'funcao' && !role) throw new CollectionError(400, 'BAD_ROLE', 'Escolha uma função válida');
  const selectedOrganization = tier === 'time' ? collectionOrganizationByKey.get(organization ?? '') : undefined;
  if (tier === 'time' && !selectedOrganization) throw new CollectionError(400, 'BAD_TEAM', 'Escolha um time válido');
  return db.tx(async (tx) => {
    const price = tier === 'time' ? selectedOrganization!.price : PACK_PRICES[tier];
    await applyLedger(tx, userId, -price, 'buy_pack', tier);
    const [{ id }] = await tx.query<{ id: string }>('SELECT max(id)::text AS id FROM ledger WHERE user_id = $1', [userId]);
    const seed = `${userId}:${new Date(now).toISOString()}:${id}`;
    const cards = rollPackWithCoaches(tier, seed, players, collectionCoaches,
      tier === 'era' ? { year } : tier === 'funcao' ? { role } : tier === 'time' ? { teamIds: selectedOrganization!.teamIds, distinctYears: false } : {});
    await tx.query('INSERT INTO pack_opens (user_id, tier, seed, player_ids) VALUES ($1, $2, $3, $4)', [userId, tier, seed, cards.map(cardId)]);
    const added = await addCards(tx, userId, cards, seed);
    await tx.query('UPDATE pack_opens SET coins_from_dupes = $2 WHERE seed = $1', [seed, added.coinsFromDupes]);
    return { tier, seed, players: cards.map(cardId), ...added };
  });
}

export interface PromoView extends PromoCard {
  /** This account already bought this offer today. */
  bought: boolean;
  /** This account already has the card (bought elsewhere): the offer cannot be bought. */
  owned: boolean;
}

export interface PromoBought {
  tier: PromoTier;
  cardId: string;
  price: number;
  wallet: number;
}

/** Next midnight in Brasília (UTC-3), when the promotions turn over. */
const nextDayStart = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1, 3)).toISOString(); };

/** Today's four offers (the same cards and prices for everyone), with what this account already bought or owns. */
export async function listPromos(db: Db, userId: string, now: number): Promise<{ day: string; endsAt: string; promos: PromoView[] }> {
  const day = dayKeyUtcMinus3(now);
  const offers = dailyPromos(day);
  const bought = new Set((await db.query<{ tier: string }>('SELECT tier FROM promo_purchases WHERE user_id = $1 AND day = $2', [userId, day])).map((row) => row.tier));
  const [lastLegend] = await db.query<{ day: string }>(`SELECT day::text FROM promo_purchases WHERE user_id = $1 AND tier = 'promo_legend' ORDER BY day DESC LIMIT 1`, [userId]);
  if (lastLegend && isoWeekKeyUtcMinus3(Date.parse(`${lastLegend.day}T12:00:00-03:00`)) === isoWeekKeyUtcMinus3(now)) bought.add('promo_legend');
  const owned = new Set((await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1 AND player_id = ANY($2)', [userId, offers.map((offer) => offer.cardId)])).map((row) => row.player_id));
  return { day, endsAt: nextDayStart(day), promos: offers.map((offer) => ({ ...offer, bought: bought.has(offer.tier), owned: owned.has(offer.cardId) })) };
}

/** Buys one of today's offers, once per account per day, at the price the pure rule computes (the same the client shows). */
export async function buyPromo(db: Db, userId: string, tier: PromoTier, now: number): Promise<PromoBought> {
  const day = dayKeyUtcMinus3(now);
  const offer = dailyPromos(day).find((item) => item.tier === tier);
  if (!offer || offer.price <= 0) throw new CollectionError(400, 'BAD_TIER', 'Promoção desconhecida');
  return db.tx(async (tx) => {
    if (tier === 'promo_legend') {
      const [lastLegend] = await tx.query<{ day: string }>(`SELECT day::text FROM promo_purchases WHERE user_id = $1 AND tier = 'promo_legend' ORDER BY day DESC LIMIT 1`, [userId]);
      if (lastLegend && isoWeekKeyUtcMinus3(Date.parse(`${lastLegend.day}T12:00:00-03:00`)) === isoWeekKeyUtcMinus3(now)) throw new CollectionError(409, 'PROMO_BOUGHT', 'Você já comprou a promoção Legend desta semana');
    }
    const [owned] = await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, offer.cardId]);
    if (owned) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
    const inserted = await tx.query('INSERT INTO promo_purchases (user_id, day, tier, seed, card_id, price) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING tier', [userId, day, tier, promoSeed(day), offer.cardId, offer.price]);
    if (!inserted.length) throw new CollectionError(409, 'PROMO_BOUGHT', 'Você já comprou essa promoção hoje');
    const wallet = await applyLedger(tx, userId, -offer.price, 'buy_pack', tier);
    await tx.query('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, $3)', [userId, offer.cardId, 'pack']);
    return { tier, cardId: offer.cardId, price: offer.price, wallet };
  });
}

export async function sellPlayer(db: Db, userId: string, playerId: string): Promise<{ coins: number; wallet: number }> {
  const coach = collectionCoachById.get(playerId);
  const player = playerById.get(playerId);
  if (!coach && !player) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  return db.tx(async (tx) => {
    // A card used by ANY lineup slot cannot go: lineups are independent teams, and each one holds its own five.
    const [used] = await tx.query('SELECT 1 FROM lineup_slots WHERE user_id = $1 AND (player_ids @> $2::text[] OR coach_id = $3) LIMIT 1', [userId, [playerId], playerId]);
    if (used) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de vender');
    const removed = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 RETURNING player_id', [userId, playerId]);
    if (!removed.length) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
    const coins = coach ? coachSellValue(coach) : sellValue(player!);
    const wallet = await applyLedger(tx, userId, coins, 'sell', playerId);
    return { coins, wallet };
  });
}

export interface LineupInput {
  playerIds: string[];
  roles: CollectionSlotRole[];
  starPlayerId: string | null;
  coachId: string | null;
  style: OrgStyle;
  mapPreferences?: string[] | null;
}

export async function saveLineup(db: Db, userId: string, input: LineupInput, slotIndex?: number): Promise<LineupView> {
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
  const slot = slotIndex ?? await activeSlotOf(db, userId);
  await requireUnlockedSlot(db, userId, slot);
  await db.query(
    `INSERT INTO lineup_slots (user_id, slot_index, player_ids, roles, star_player_id, style, coach_id, map_preferences) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, slot_index) DO UPDATE SET player_ids = $3, roles = $4, star_player_id = $5, style = $6, coach_id = $7, map_preferences = $8, updated_at = now()`,
    [userId, slot, input.playerIds, input.roles, input.starPlayerId, input.style, input.coachId, maps]
  );
  return { slotIndex: slot, playerIds: input.playerIds, roles: input.roles, starPlayerId: input.starPlayerId, coachId: input.coachId, style: input.style, starEffective: check.starEffective, mapPreferences: maps as MapId[] | null };
}

/** Every saved lineup, how many slots the account unlocked and which one plays. */
export async function getLineups(db: Db, userId: string): Promise<{ lineups: LineupView[]; unlockedSlots: number; activeSlot: number }> {
  const rows = await db.query<LineupRow>(`SELECT ${LINEUP_COLUMNS} FROM lineup_slots WHERE user_id = $1 ORDER BY slot_index`, [userId]);
  const [unlocked, activeSlot] = await Promise.all([unlockedSlotCount(db, userId), activeSlotOf(db, userId)]);
  return { lineups: rows.map((row) => lineupView(row)!), unlockedSlots: unlocked, activeSlot };
}

/** The ACTIVE lineup: the one the room and the queue consume. */
export async function getLineup(db: Db, userId: string): Promise<LineupView | null> {
  const [row] = await db.query<LineupRow>(
    `SELECT ${LINEUP_COLUMNS} FROM lineup_slots WHERE user_id = $1 AND slot_index = (SELECT active_lineup_slot FROM users WHERE id = $1)`,
    [userId]
  );
  return lineupView(row);
}

/** Switches which slot plays; the slot itself does not need a saved team yet (room entry still asks for one). */
export async function setActiveLineup(db: Db, userId: string, slotIndex: number): Promise<number> {
  await requireUnlockedSlot(db, userId, slotIndex);
  await db.query('UPDATE users SET active_lineup_slot = $2 WHERE id = $1', [userId, slotIndex]);
  return slotIndex;
}

export interface LineupSlotBought {
  slotIndex: number;
  unlockedSlots: number;
  wallet: number;
}

/**
 * Buys the next lineup slot: one purchase per slot (the primary key is the gate, like the promos), always the next
 * contiguous index, capped at LINEUP_SLOTS_MAX. The unlock row is inserted before the charge, so a rejected payment
 * rolls both back and a double request can never pay twice.
 */
export async function buyLineupSlot(db: Db, userId: string): Promise<LineupSlotBought> {
  return db.tx(async (tx) => {
    const unlocked = await unlockedSlotCount(tx, userId);
    if (unlocked >= LINEUP_SLOTS_MAX) throw new CollectionError(409, 'SLOTS_MAXED', 'Todas as vagas de lineup já estão liberadas');
    const inserted = await tx.query('INSERT INTO lineup_slot_unlocks (user_id, slot_index) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING slot_index', [userId, unlocked]);
    if (!inserted.length) throw new CollectionError(409, 'SLOT_OWNED', 'Essa vaga já está liberada');
    const wallet = await applyLedger(tx, userId, -LINEUP_SLOT_PRICE, 'purchase', `lineup-slot-${unlocked}`);
    return { slotIndex: unlocked, unlockedSlots: unlocked + 1, wallet };
  });
}

export const CARDS = CARDS_PER_PACK;

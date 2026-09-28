import { createHash, createHmac, randomBytes } from 'node:crypto';
import { cardCoinValue, cardUpgradeChance, isKnownCard } from '../../src/lib/game/online/card-value';
import { collectionCoachById } from '../../src/lib/game/online/collection-pool';
import { UPGRADER_MAX_STAKE } from '../../src/lib/game/online/collection-rules';
import { consolationCard, fairMessage, isValidClientSeed, rollFromHex, FAIR_CLIENT_SEED_MAX, type ConsolationKind, type FairSuffix } from '../../src/lib/game/online/fair';
import type { Db, Tx } from '../db/client';
import { applyLedger, CollectionError, duplicateValue, grantFragment } from './service';

/** The seed commitment shown before a spin: the hash of the unused server seed and the nonce it will be used with. */
export interface FairState {
  serverSeedHash: string;
  nonce: number;
}

export interface UpgradeResult {
  won: boolean;
  chance: number;
  /** The draw in [0, 1): a win is any roll below `chance`. */
  roll: number;
  target: string;
  /** The staked cards (all of them are lost on a loss). */
  stake: string[];
  /** On a loss, the downgraded card handed out instead (never one of the staked cards); null on a win or when the loss pays coins. */
  consolation: string | null;
  consolationKind: ConsolationKind | null;
  /** Loss with only Commons staked: coins paid instead of a card (`consolationKind` 'coins'); 0 otherwise. */
  consolationCoins: number;
  /** The consolation card was already in the collection: it turned into `duplicateCoins` coins (coach) or one `duplicateFragment` (player). */
  duplicate: boolean;
  duplicateCoins: number;
  /** A repeated PLAYER consolation became a fragment of that card instead of coins. */
  duplicateFragment: boolean;
  /** Revealed after the spin: SHA-256(serverSeed) is the hash published before it. */
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  /** The next commitment (a fresh server seed). */
  next: FairState;
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const newServerSeed = () => randomBytes(32).toString('hex');

/** Server-side roll: HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}[:suffix]`), first 13 hex over 16^13. */
export const serverRoll = (serverSeed: string, clientSeed: string, nonce: number, suffix: FairSuffix = '') =>
  rollFromHex(createHmac('sha256', serverSeed).update(fairMessage(clientSeed, nonce, suffix)).digest('hex'));

/** Cards the user has on ANY saved lineup (five players and the coach of every slot): they cannot be staked or traded. */
export async function lineupCardIds(tx: Tx | Db, userId: string): Promise<Set<string>> {
  const rows = await tx.query<{ player_ids: string[]; coach_id: string | null }>('SELECT player_ids, coach_id FROM lineup_slots WHERE user_id = $1', [userId]);
  return new Set(rows.flatMap((row) => [...row.player_ids, ...(row.coach_id ? [row.coach_id] : [])]));
}

async function seedRow(tx: Tx | Db, userId: string, lock: boolean): Promise<{ server_seed: string; nonce: number }> {
  await tx.query('INSERT INTO upgrader_seeds (user_id, server_seed) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, newServerSeed()]);
  const [row] = await tx.query<{ server_seed: string; nonce: number }>(`SELECT server_seed, nonce FROM upgrader_seeds WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [userId]);
  return row;
}

/** The current commitment; creates the first server seed (32 random bytes) when the user has none. */
export async function getFairState(db: Db, userId: string): Promise<FairState> {
  const row = await seedRow(db, userId, false);
  return { serverSeedHash: sha256(row.server_seed), nonce: row.nonce };
}

/**
 * Stakes 1 to 6 cards for a pricier one, all in one transaction. The roll comes from the committed server seed and the
 * client seed; the server seed is then revealed and replaced by a fresh one. Win: the staked cards leave and the target
 * comes in. Loss: they all leave and a downgraded consolation card comes in (`consolationCard`, from the ':refund' and
 * ':refund-pick' rolls); if the user already has it, it pays DUPLICATE_RATIO of its value in coins, like a pack duplicate.
 * A stake of only Commons gets no card back, just a few coins.
 */
export async function upgradeCards(db: Db, userId: string, stake: string[], target: string, clientSeed: string): Promise<UpgradeResult> {
  if (!stake.length || stake.length > UPGRADER_MAX_STAKE || new Set(stake).size !== stake.length) throw new CollectionError(400, 'BAD_STAKE', `Aposte de 1 a ${UPGRADER_MAX_STAKE} cartas diferentes`);
  if (!isValidClientSeed(clientSeed)) throw new CollectionError(400, 'BAD_CLIENT_SEED', `A client seed precisa ter de 1 a ${FAIR_CLIENT_SEED_MAX} caracteres`);
  if (!isKnownCard(target) || stake.some((id) => !isKnownCard(id))) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  if (stake.includes(target)) throw new CollectionError(400, 'BAD_TARGET', 'O alvo não pode estar na aposta');
  const stakeValue = stake.reduce((sum, id) => sum + cardCoinValue(id), 0);
  const targetValue = cardCoinValue(target);
  if (targetValue <= stakeValue) throw new CollectionError(400, 'TARGET_TOO_CHEAP', 'O alvo tem que valer mais que a aposta');
  const chance = cardUpgradeChance(stake, target);
  return db.tx(async (tx) => {
    const inLineup = await lineupCardIds(tx, userId);
    if (stake.some((id) => inLineup.has(id))) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de apostar');
    const [already] = await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, target]);
    if (already) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
    const removed = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = ANY($2) RETURNING player_id', [userId, stake]);
    if (removed.length !== stake.length) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
    const { server_seed: serverSeed, nonce } = await seedRow(tx, userId, true);
    const serverSeedHash = sha256(serverSeed);
    const roll = serverRoll(serverSeed, clientSeed, nonce);
    const won = roll < chance;
    const consolation = won ? null : consolationCard(serverRoll(serverSeed, clientSeed, nonce, 'refund'), serverRoll(serverSeed, clientSeed, nonce, 'refund-pick'), stake, target);
    // A loss that pays coins (only Commons staked) hands out no card.
    const received = won ? target : consolation!.card;
    const inserted = received ? await tx.query('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING player_id', [userId, received, 'upgrade']) : [];
    const duplicate = Boolean(received) && !inserted.length;
    // A repetida de jogador vira fragmento (material dos contratos); a de coach segue pagando coins.
    let duplicateCoins = 0;
    let duplicateFragment = false;
    if (duplicate) {
      if (received && !collectionCoachById.has(received)) duplicateFragment = await grantFragment(tx, userId, received);
      else duplicateCoins = duplicateValue(received!);
    }
    if (duplicateCoins) await applyLedger(tx, userId, duplicateCoins, 'duplicate', serverSeedHash);
    const consolationCoins = consolation?.coins ?? 0;
    if (consolationCoins) await applyLedger(tx, userId, consolationCoins, 'upgrade_consolation', serverSeedHash);
    // The `returned` column keeps its name (append-only schema): it now holds the consolation card of a loss.
    await tx.query(
      `INSERT INTO upgrades (user_id, stake, target, stake_value, target_value, chance, seed, roll, won, returned, server_seed, server_seed_hash, client_seed, nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7, $11, $12, $13)`,
      [userId, stake, target, stakeValue, targetValue, chance, serverSeed, roll, won, consolation?.card ?? null, serverSeedHash, clientSeed, nonce]
    );
    const nextSeed = newServerSeed();
    await tx.query('UPDATE upgrader_seeds SET server_seed = $2, nonce = nonce + 1, updated_at = now() WHERE user_id = $1', [userId, nextSeed]);
    return { won, chance, roll, target, stake: [...stake], consolation: consolation?.card ?? null, consolationKind: consolation?.kind ?? null, consolationCoins, duplicate, duplicateCoins, duplicateFragment, serverSeed, serverSeedHash, clientSeed, nonce, next: { serverSeedHash: sha256(nextSeed), nonce: nonce + 1 } };
  });
}

/**
 * Upgrade de Risco (o modelo dos sites de skins, em carta única): sacrifica UMA carta fora do time por um alvo mais
 * caro, com a mesma chance de valor do upgrader (alvo/aposta × 0.9, caps por raridade). Na derrota NADA de carta
 * rebaixada: a sacrificada volta como 1 fragmento dela mesmo — o material dos trade-ups — então a aposta nunca zera.
 * O provably fair é o mesmo compromisso do upgrader (mesma seed e nonce da conta).
 */
export async function riskUpgrade(db: Db, userId: string, cardId: string, target: string, clientSeed: string): Promise<UpgradeResult & { risk: boolean }> {
  if (!isKnownCard(target) || !isKnownCard(cardId)) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  if (cardId === target) throw new CollectionError(400, 'BAD_TARGET', 'O alvo não pode ser a carta sacrificada');
  if (collectionCoachById.has(cardId)) throw new CollectionError(400, 'BAD_STAKE', 'Só jogador vira fragmento — sacrifique um jogador');
  if (!isValidClientSeed(clientSeed)) throw new CollectionError(400, 'BAD_CLIENT_SEED', `A client seed precisa ter de 1 a ${FAIR_CLIENT_SEED_MAX} caracteres`);
  const chance = cardUpgradeChance([cardId], target);
  if (chance <= 0) throw new CollectionError(400, 'TARGET_TOO_CHEAP', 'O alvo tem que valer mais que a carta sacrificada');
  return db.tx(async (tx) => {
    const inLineup = await lineupCardIds(tx, userId);
    if (inLineup.has(cardId)) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de arriscar');
    const [already] = await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, target]);
    if (already) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
    const removed = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 RETURNING player_id', [userId, cardId]);
    if (!removed.length) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
    const { server_seed: serverSeed, nonce } = await seedRow(tx, userId, true);
    const serverSeedHash = sha256(serverSeed);
    const roll = serverRoll(serverSeed, clientSeed, nonce);
    const won = roll < chance;
    let received: string | null = null;
    let duplicate = false;
    let duplicateCoins = 0;
    let duplicateFragment = false;
    if (won) {
      const inserted = await tx.query('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, \'upgrade\') ON CONFLICT DO NOTHING RETURNING player_id', [userId, target]);
      duplicate = !inserted.length;
      received = target;
      if (duplicate) await grantFragment(tx, userId, target);
    } else {
      // A derrota devolve a sacrificada como fragmento: perde a carta, não perde o material.
      await grantFragment(tx, userId, cardId);
    }
    await tx.query(
      `INSERT INTO upgrades (user_id, stake, target, stake_value, target_value, chance, seed, roll, won, returned, server_seed, server_seed_hash, client_seed, nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $7, $10, $11, $12)`,
      [userId, [cardId], target, cardCoinValue(cardId), cardCoinValue(target), chance, serverSeed, roll, won, serverSeedHash, clientSeed, nonce]
    );
    const nextSeed = newServerSeed();
    await tx.query('UPDATE upgrader_seeds SET server_seed = $2, nonce = nonce + 1, updated_at = now() WHERE user_id = $1', [userId, nextSeed]);
    return { won, chance, roll, target, stake: [cardId], consolation: null, consolationKind: null, consolationCoins: 0, duplicate, duplicateCoins, duplicateFragment: !won, risk: true, serverSeed, serverSeedHash, clientSeed, nonce, next: { serverSeedHash: sha256(nextSeed), nonce: nonce + 1 } };
  });
}

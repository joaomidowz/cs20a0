import { createHash, createHmac, randomBytes } from 'node:crypto';
import { cardCoinValue, cardUpgradeChance, isKnownCard } from '../../src/lib/game/online/card-value';
import { UPGRADER_MAX_STAKE } from '../../src/lib/game/online/collection-rules';
import { consolationCard, fairMessage, isValidClientSeed, rollFromHex, FAIR_CLIENT_SEED_MAX, type ConsolationKind, type FairSuffix } from '../../src/lib/game/online/fair';
import type { Db, Tx } from '../db/client';
import { applyLedger, CollectionError, duplicateValue } from './service';

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
  /** On a loss, the downgraded card handed out instead (never one of the staked cards); null on a win. */
  consolation: string | null;
  consolationKind: ConsolationKind | null;
  /** The consolation card was already in the collection: it turned into `duplicateCoins` coins. */
  duplicate: boolean;
  duplicateCoins: number;
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

/** Cards the user has on the saved team (five players and the coach): they cannot be staked or traded. */
export async function lineupCardIds(tx: Tx | Db, userId: string): Promise<Set<string>> {
  const [lineup] = await tx.query<{ player_ids: string[]; coach_id: string | null }>('SELECT player_ids, coach_id FROM lineups WHERE user_id = $1', [userId]);
  return new Set(lineup ? [...lineup.player_ids, ...(lineup.coach_id ? [lineup.coach_id] : [])] : []);
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
    const received = won ? target : consolation!.card;
    const inserted = await tx.query('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING player_id', [userId, received, 'upgrade']);
    const duplicate = !inserted.length;
    const duplicateCoins = duplicate ? duplicateValue(received) : 0;
    if (duplicateCoins) await applyLedger(tx, userId, duplicateCoins, 'duplicate', serverSeedHash);
    // The `returned` column keeps its name (append-only schema): it now holds the consolation card of a loss.
    await tx.query(
      `INSERT INTO upgrades (user_id, stake, target, stake_value, target_value, chance, seed, roll, won, returned, server_seed, server_seed_hash, client_seed, nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7, $11, $12, $13)`,
      [userId, stake, target, stakeValue, targetValue, chance, serverSeed, roll, won, consolation?.card ?? null, serverSeedHash, clientSeed, nonce]
    );
    const nextSeed = newServerSeed();
    await tx.query('UPDATE upgrader_seeds SET server_seed = $2, nonce = nonce + 1, updated_at = now() WHERE user_id = $1', [userId, nextSeed]);
    return { won, chance, roll, target, stake: [...stake], consolation: consolation?.card ?? null, consolationKind: consolation?.kind ?? null, duplicate, duplicateCoins, serverSeed, serverSeedHash, clientSeed, nonce, next: { serverSeedHash: sha256(nextSeed), nonce: nonce + 1 } };
  });
}

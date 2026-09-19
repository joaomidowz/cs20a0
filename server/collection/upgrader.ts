import { randomUUID } from 'node:crypto';
import { cardCoinValue, isKnownCard } from '../../src/lib/game/online/card-value';
import { UPGRADER_MAX_STAKE, upgradeChance } from '../../src/lib/game/online/collection-rules';
import { createSeededRng } from '../../src/lib/game/simulation';
import type { Db, Tx } from '../db/client';
import { CollectionError } from './service';

export interface UpgradeResult {
  won: boolean;
  chance: number;
  /** The draw in [0, 1): a win is any roll below `chance`. */
  roll: number;
  seed: string;
  target: string;
  /** On a loss, the one staked card that comes back. */
  returned: string | null;
}

/** Cards the user has on the saved team (five players and the coach): they cannot be staked or traded. */
export async function lineupCardIds(tx: Tx | Db, userId: string): Promise<Set<string>> {
  const [lineup] = await tx.query<{ player_ids: string[]; coach_id: string | null }>('SELECT player_ids, coach_id FROM lineups WHERE user_id = $1', [userId]);
  return new Set(lineup ? [...lineup.player_ids, ...(lineup.coach_id ? [lineup.coach_id] : [])] : []);
}

/**
 * Stakes 1 to 6 cards for a pricier one. The seed is drawn here and stored with the result; everything happens in one
 * transaction. Win: the staked cards leave and the target comes in. Loss: they leave and one of them, at random, comes back.
 */
export async function upgradeCards(db: Db, userId: string, stake: string[], target: string, seed: string = randomUUID()): Promise<UpgradeResult> {
  if (!stake.length || stake.length > UPGRADER_MAX_STAKE || new Set(stake).size !== stake.length) throw new CollectionError(400, 'BAD_STAKE', `Aposte de 1 a ${UPGRADER_MAX_STAKE} cartas diferentes`);
  if (!isKnownCard(target) || stake.some((id) => !isKnownCard(id))) throw new CollectionError(404, 'UNKNOWN_PLAYER', 'Carta desconhecida');
  if (stake.includes(target)) throw new CollectionError(400, 'BAD_TARGET', 'O alvo não pode estar na aposta');
  const stakeValue = stake.reduce((sum, id) => sum + cardCoinValue(id), 0);
  const targetValue = cardCoinValue(target);
  if (targetValue <= stakeValue) throw new CollectionError(400, 'TARGET_TOO_CHEAP', 'O alvo tem que valer mais que a aposta');
  const chance = upgradeChance(stakeValue, targetValue);
  return db.tx(async (tx) => {
    const inLineup = await lineupCardIds(tx, userId);
    if (stake.some((id) => inLineup.has(id))) throw new CollectionError(409, 'IN_LINEUP', 'Tire a carta do time antes de apostar');
    const [already] = await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, target]);
    if (already) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem essa carta');
    const removed = await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = ANY($2) RETURNING player_id', [userId, stake]);
    if (removed.length !== stake.length) throw new CollectionError(404, 'NOT_OWNED', 'Você não tem essa carta');
    const rng = createSeededRng(seed);
    const roll = rng();
    const won = roll < chance;
    const returned = won ? null : stake[Math.floor(rng() * stake.length)];
    await tx.query('INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, $3)', [userId, won ? target : returned, 'upgrade']);
    await tx.query(
      'INSERT INTO upgrades (user_id, stake, target, stake_value, target_value, chance, seed, roll, won, returned) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [userId, stake, target, stakeValue, targetValue, chance, seed, roll, won, returned]
    );
    return { won, chance, roll, seed, target, returned };
  });
}

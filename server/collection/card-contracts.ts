import { LENDA_TARGET, TRADE_INPUTS, checkLendaDonors, checkTradeInputs, lendaById, pickTradeCard, tradeLadder, tradeSources, tradeTierOf } from '../../src/lib/game/online/card-contracts';
import { FAIR_CLIENT_SEED_MAX, isValidClientSeed } from '../../src/lib/game/online/fair';
import type { Db, Tx } from '../db/client';
import { CollectionError } from './service';
import { newServerSeed, serverRoll, sha256 } from './upgrader';
import { collectionPlayerById } from '../../src/lib/game/online/collection-pool';

/**
 * Trade-Up de cartas e Lendas, lado servidor: a autoridade da rolagem. O cliente só prévia com as MESMAS funções
 * puras; o sorteio acontece nesta transação (linhas da coleção travadas com FOR UPDATE, commit-reveal pela seed da
 * conta, resultado auditado em contract_runs e a seed revelada e trocada). Contratos consomem cópias extras reais.
 */

export interface ContractFair {
  serverSeedHash: string;
  nonce: number;
}

export interface ContractStateView {
  cards: Array<{ playerId: string; count: number }>;
  /** Progresso de cada Lenda, por id (ausente = não começou). */
  progress: Record<string, number>;
  fair: ContractFair;
}

export interface TradeUpResult {
  contractId: 'tradeup';
  inputs: string[];
  /** A carta entregue. */
  result: string;
  resultTier: string;
  inputTier: string;
  /** Degrau sorteado da tabela visível (down/same/up/double). */
  step: string;
  /** De qual pool a carta saiu: a coleção sorteada, o país, ou o pool geral (coleção sem a raridade). */
  scope: 'org' | 'country' | 'any';
  /** Qual das 5 entregas deu o peso (0..4). */
  sourceIndex: number;
  /** O resultado já era possuído: sua quantidade aumentou em uma cópia. */
  duplicate: boolean;
  roll: number;
  sourceRoll: number;
  pickRoll: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  next: ContractFair;
}

async function contractSeedRow(tx: Tx | Db, userId: string, lock: boolean): Promise<{ server_seed: string; nonce: number }> {
  await tx.query('INSERT INTO contract_seeds (user_id, server_seed) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, newServerSeed()]);
  const [row] = await tx.query<{ server_seed: string; nonce: number }>(`SELECT server_seed, nonce FROM contract_seeds WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [userId]);
  return row;
}

/** The current commitment; creates the first server seed (32 random bytes) when the user has none. */
export async function getContractFair(db: Db, userId: string): Promise<ContractFair> {
  const row = await contractSeedRow(db, userId, false);
  return { serverSeedHash: sha256(row.server_seed), nonce: row.nonce };
}

/** Cópias extras disponíveis (só com count > 0), o progresso das Lendas e o compromisso fair da próxima rolagem. */
export async function getContractState(db: Db, userId: string): Promise<ContractStateView> {
  const owned = await db.query<{ player_id: string; quantity: number }>('SELECT player_id, quantity FROM collection WHERE user_id = $1 AND quantity > 0 ORDER BY player_id', [userId]);
  const lineups = await db.query<{ player_ids: string[] }>('SELECT player_ids FROM lineup_slots WHERE user_id = $1', [userId]);
  const locked = new Set(lineups.flatMap((lineup) => lineup.player_ids));
  const cards = owned.map((row) => ({ player_id: row.player_id, count: row.quantity - (locked.has(row.player_id) ? 1 : 0) }))
    .filter((row) => row.count > 0 && collectionPlayerById.has(row.player_id));
  const progressRows = await db.query<{ contract_id: string; progress: number }>('SELECT contract_id, progress FROM card_contract_progress WHERE user_id = $1', [userId]);
  return {
    cards: cards.map((row) => ({ playerId: row.player_id, count: row.count })),
    progress: Object.fromEntries(progressRows.map((row) => [row.contract_id, row.progress])),
    fair: await getContractFair(db, userId)
  };
}

/**
 * Cumpre um trade-up: consome uma cópia real de cada uma das 5 entregas (mesma raridade, qualquer mistura de países) e
 * rola — degrau de raridade pela tabela visível, coleção pela composição da entrega, carta dentro da coleção. Tudo
 * numa transação: as linhas da coleção são travadas antes do consumo, então corridas nunca gastam a mesma cópia.
 */
export async function runTradeUp(db: Db, userId: string, inputs: string[], clientSeed: string): Promise<TradeUpResult> {
  const check = checkTradeInputs(inputs);
  if (check.code === 'BAD_COUNT') throw new CollectionError(400, 'BAD_INPUTS', `Escolha ${TRADE_INPUTS} cópias disponíveis da mesma raridade`);
  if (check.code === 'BAD_DONOR') throw new CollectionError(400, 'BAD_DONOR', 'Carta desconhecida na entrega');
  if (check.code === 'BAD_RARITY') throw new CollectionError(400, 'BAD_RARITY', 'No trade-up as cinco cartas são da mesma raridade');
  if (!isValidClientSeed(clientSeed)) throw new CollectionError(400, 'BAD_CLIENT_SEED', `A client seed precisa ter de 1 a ${FAIR_CLIENT_SEED_MAX} caracteres`);
  return db.tx(async (tx) => {
    // Cada entrada consome uma cópia real; uma carta escalada conserva ao menos uma cópia.
    const requested = new Map<string, number>();
    for (const id of inputs) requested.set(id, (requested.get(id) ?? 0) + 1);
    const rows = await tx.query<{ player_id: string; quantity: number }>('SELECT player_id, quantity FROM collection WHERE user_id = $1 AND player_id = ANY($2) FOR UPDATE', [userId, [...requested.keys()]]);
    if (rows.length !== requested.size || rows.some((row) => row.quantity < (requested.get(row.player_id) ?? 0))) throw new CollectionError(409, 'NO_COPIES', 'Você não tem cópias suficientes dessas cartas');
    const lineupRows = await tx.query<{ player_ids: string[] }>('SELECT player_ids FROM lineup_slots WHERE user_id = $1', [userId]);
    const locked = new Set(lineupRows.flatMap((lineup) => lineup.player_ids));
    if (rows.some((row) => locked.has(row.player_id) && row.quantity <= (requested.get(row.player_id) ?? 0))) throw new CollectionError(409, 'IN_LINEUP', 'Deixe uma cópia de cada carta escalada');
    for (const [id, quantity] of requested) {
      const quantityOwned = rows.find((row) => row.player_id === id)!.quantity;
      if (quantityOwned === quantity) await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2', [userId, id]);
      else await tx.query('UPDATE collection SET quantity = quantity - $3 WHERE user_id = $1 AND player_id = $2', [userId, id, quantity]);
    }
    const { server_seed: serverSeed, nonce } = await contractSeedRow(tx, userId, true);
    const serverSeedHash = sha256(serverSeed);
    const roll = serverRoll(serverSeed, clientSeed, nonce);
    const sourceRoll = serverRoll(serverSeed, clientSeed, nonce, 'aff');
    const pickRoll = serverRoll(serverSeed, clientSeed, nonce, 'pick');
    const ladder = tradeLadder(check.rarity!);
    const step = tradeTierOf(ladder, roll);
    const sourceIndex = Math.min(inputs.length - 1, Math.floor(sourceRoll * inputs.length));
    const owned = new Set((await tx.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1', [userId])).map((row) => row.player_id));
    const sources = tradeSources(inputs);
    const pick = pickTradeCard(sources, step.tier, sourceIndex, pickRoll, owned);
    if (!pick.id) throw new CollectionError(409, 'EMPTY_POOL', 'Nenhuma carta disponível nesse trade-up');
    const inserted = await tx.query<{ player_id: string }>("INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'reward') ON CONFLICT DO NOTHING RETURNING player_id", [userId, pick.id]);
    const duplicate = !inserted.length;
    if (duplicate) await tx.query('UPDATE collection SET quantity = quantity + 1 WHERE user_id = $1 AND player_id = $2', [userId, pick.id]);
    await tx.query(
      `INSERT INTO contract_runs (user_id, contract_id, donors, stake_value, floor_tier, result, result_tier, affinity, jumped, roll, aff_roll, pick_roll, server_seed, server_seed_hash, client_seed, nonce)
       VALUES ($1, 'tradeup', $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [userId, inputs, ladder.inputTier, pick.id, step.tier, pick.scope !== 'any', step.step !== 'down' && step.step !== 'same', roll, sourceRoll, pickRoll, serverSeed, serverSeedHash, clientSeed, nonce]
    );
    const nextSeed = newServerSeed();
    await tx.query('UPDATE contract_seeds SET server_seed = $2, nonce = nonce + 1, updated_at = now() WHERE user_id = $1', [userId, nextSeed]);
    return {
      contractId: 'tradeup', inputs: [...inputs], result: pick.id, resultTier: step.tier, inputTier: ladder.inputTier, step: step.step,
      scope: pick.scope, sourceIndex, duplicate, roll, sourceRoll, pickRoll, serverSeed, serverSeedHash, clientSeed, nonce,
      next: { serverSeedHash: sha256(nextSeed), nonce: nonce + 1 }
    };
  });
}

/** Entrega parcial de uma Lenda: consome as cópias doadas e acumula no progresso (teto no alvo). */
export async function deliverLenda(db: Db, userId: string, contractId: string, donors: string[]): Promise<{ progress: number; target: number; complete: boolean; delivered: number }> {
  const def = lendaById.get(contractId);
  if (!def) throw new CollectionError(404, 'UNKNOWN_CONTRACT', 'Contrato desconhecido');
  if (checkLendaDonors(def, donors) !== 'OK') throw new CollectionError(400, 'BAD_DONOR', 'Todo doador precisa ser um jogador do tema da Lenda');
  return db.tx(async (tx) => {
    // O que passa do teto não é consumido: a entrega volta com `delivered` menor que os doadores enviados.
    const [current] = await tx.query<{ progress: number }>('SELECT progress FROM card_contract_progress WHERE user_id = $1 AND contract_id = $2 FOR UPDATE', [userId, contractId]);
    const progressBefore = Math.min(current?.progress ?? 0, LENDA_TARGET);
    const effective = donors.slice(0, Math.max(0, LENDA_TARGET - progressBefore));
    if (!effective.length) throw new CollectionError(409, 'LENDA_COMPLETE', 'Essa Lenda já está completa — resgate a carta');
    const requested = new Map<string, number>();
    for (const id of effective) requested.set(id, (requested.get(id) ?? 0) + 1);
    const rows = await tx.query<{ player_id: string; quantity: number }>('SELECT player_id, quantity FROM collection WHERE user_id = $1 AND player_id = ANY($2) FOR UPDATE', [userId, [...requested.keys()]]);
    if (rows.length !== requested.size || rows.some((row) => row.quantity < (requested.get(row.player_id) ?? 0))) throw new CollectionError(409, 'NO_COPIES', 'Você não tem cópias suficientes desses doadores');
    const lineupRows = await tx.query<{ player_ids: string[] }>('SELECT player_ids FROM lineup_slots WHERE user_id = $1', [userId]);
    const locked = new Set(lineupRows.flatMap((lineup) => lineup.player_ids));
    if (rows.some((row) => locked.has(row.player_id) && row.quantity <= (requested.get(row.player_id) ?? 0))) throw new CollectionError(409, 'IN_LINEUP', 'Deixe uma cópia de cada carta escalada');
    for (const [id, count] of requested) {
      const quantity = rows.find((row) => row.player_id === id)!.quantity;
      if (quantity === count) await tx.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2', [userId, id]);
      else await tx.query('UPDATE collection SET quantity = quantity - $3 WHERE user_id = $1 AND player_id = $2', [userId, id, count]);
    }
    const [row] = await tx.query<{ progress: number }>(
      `INSERT INTO card_contract_progress (user_id, contract_id, progress) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, contract_id) DO UPDATE SET progress = LEAST(card_contract_progress.progress + $3, $4), updated_at = now()
       RETURNING progress`,
      [userId, contractId, effective.length, LENDA_TARGET]
    );
    return { progress: row.progress, target: LENDA_TARGET, complete: row.progress >= LENDA_TARGET, delivered: effective.length };
  });
}

/**
 * Resgata a carta garantida da Lenda: o progresso precisa estar completo, e a carta-alvo não pode estar na coleção
 * (o dono do pool completo vê o aviso na tela). O progresso é consumido no resgate: vender a carta não devolve o
 * progresso, então não existe ciclo de resgate.
 */
export async function claimLenda(db: Db, userId: string, contractId: string): Promise<{ targetId: string }> {
  const def = lendaById.get(contractId);
  if (!def) throw new CollectionError(404, 'UNKNOWN_CONTRACT', 'Contrato desconhecido');
  return db.tx(async (tx) => {
    const [row] = await tx.query<{ progress: number }>('SELECT progress FROM card_contract_progress WHERE user_id = $1 AND contract_id = $2 FOR UPDATE', [userId, contractId]);
    if (!row || row.progress < LENDA_TARGET) throw new CollectionError(409, 'LENDA_INCOMPLETE', 'A Lenda ainda não está completa');
    const [owned] = await tx.query('SELECT 1 FROM collection WHERE user_id = $1 AND player_id = $2', [userId, def.targetId]);
    if (owned) throw new CollectionError(409, 'ALREADY_OWNED', 'Você já tem a carta-alvo desta Lenda');
    await tx.query("INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'reward')", [userId, def.targetId]);
    await tx.query('DELETE FROM card_contract_progress WHERE user_id = $1 AND contract_id = $2', [userId, contractId]);
    return { targetId: def.targetId };
  });
}

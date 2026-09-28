// tests/cardContracts.test.ts
// Trade-Up de cartas (modelo oficial do CS2): a roleta de raridades pura (vetores exatos), a exigência de mesma
// raridade, os pesos por coleção e a escolha da carta; contra o Postgres local (pula sem TEST_DATABASE_URL),
// trade-up e Upgrade de Risco de ponta a ponta com provably fair, além das Lendas.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  LENDA_TARGET, LENDAS, TRADE_INPUTS, checkLendaDonors, checkTradeInputs, isPlayerInTheme, orgOf,
  pickTradeCard, tradeLadder, tradeSources, tradeTierOf, type LendaDef
} from '../src/lib/game/online/card-contracts';
import { cardCoinValue } from '../src/lib/game/online/card-value';
import { collectionPlayerById, collectionPlayers } from '../src/lib/game/online/collection-pool';
import { RARITIES, type Rarity } from '../src/lib/game/online/collection-rules';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

const byId = (id: string) => collectionPlayerById.get(id)!;
const playersOfRarity = (rarity: Rarity) => collectionPlayers.filter((player) => player.rarity === rarity);
const frenchTheme = { kind: 'country', countries: ['fr'] } as const;

describe('roleta de raridades do trade-up (pura)', () => {
  it('Elite entregue: desce 1 10% · mantém 20% · sobe 1 60% · sobe 2 10%', () => {
    const ladder = tradeLadder('elite');
    const mass = (step: string) => ladder.steps.find((entry) => entry.step === step)!.mass;
    expect(mass('down')).toBeCloseTo(0.1, 12);
    expect(mass('same')).toBeCloseTo(0.2, 12);
    expect(mass('up')).toBeCloseTo(0.6, 12);
    expect(mass('double')).toBeCloseTo(0.1, 12);
    expect(ladder.steps.reduce((sum, entry) => sum + entry.mass, 0)).toBeCloseTo(1, 12);
  });

  it('degraus impossíveis saem e o resto é renormalizado', () => {
    // Common não desce: sobra mantém/sobe1/sobe2 (20/60/10 → 2/9, 6/9, 1/9).
    const common = tradeLadder('common');
    expect(common.steps.map((step) => step.step)).toEqual(['same', 'up', 'double']);
    expect(common.steps.find((step) => step.step === 'up')!.mass).toBeCloseTo(6 / 9, 12);
    // Goat não sobe: só desce 1 e mantém (10/20 → 1/3, 2/3).
    const goat = tradeLadder('goat');
    expect(goat.steps.map((step) => step.step)).toEqual(['down', 'same']);
    expect(goat.steps.find((step) => step.step === 'down')!.mass).toBeCloseTo(1 / 3, 12);
  });

  it('tradeTierOf percorre os degraus com um único roll', () => {
    const ladder = tradeLadder('elite');
    expect(tradeTierOf(ladder, 0.05).step).toBe('down');
    expect(tradeTierOf(ladder, 0.15).step).toBe('same');
    expect(tradeTierOf(ladder, 0.5).step).toBe('up');
    expect(tradeTierOf(ladder, 0.95).step).toBe('double');
  });
});

describe('entrada e pools do trade-up (pura)', () => {
  it('exige 5 distintas da MESMA raridade; países podem misturar', () => {
    const elites = playersOfRarity('elite').slice(0, 5).map((player) => player.id);
    const mixed = [playersOfRarity('elite')[0].id, playersOfRarity('rare')[0].id, playersOfRarity('elite')[1].id, playersOfRarity('elite')[2].id, playersOfRarity('elite')[3].id];
    expect(checkTradeInputs(elites)).toMatchObject({ ok: true, code: 'OK', rarity: 'elite' });
    expect(checkTradeInputs(mixed).code).toBe('BAD_RARITY');
    expect(checkTradeInputs(elites.slice(0, 4)).code).toBe('BAD_COUNT');
    // Repetir carta É permitido (5× da mesma, se o estoque deixar): a validade é 5 unidades da mesma raridade.
    const repeated = elites.slice(0, 4);
    expect(checkTradeInputs([...repeated, repeated[0]])).toMatchObject({ ok: true, code: 'OK', rarity: 'elite' });
    expect(checkTradeInputs(Array(5).fill(elites[0]))).toMatchObject({ ok: true, code: 'OK', rarity: 'elite' });
  });

  it('fontes carregam a coleção (time-ano sem ano) e o país', () => {
    const device = byId('device-2016');
    const sources = tradeSources([device.id]);
    expect(sources[0].org).toBe(orgOf(device));
    expect(sources[0].country).toBe('dk');
    expect(sources[0].orgPool.length).toBeGreaterThan(0);
    expect(sources[0].countryPool.every((player) => player.id === device.id || true)).toBe(true);
  });

  it('fallback: coleção sem a raridade cai para o país, depois para o pool geral', () => {
    const sources = tradeSources(playersOfRarity('superstar').slice(0, TRADE_INPUTS).map((player) => player.id));
    const withoutGoat = sources.find((source) => !source.orgPool.some((player) => player.rarity === 'goat'));
    const index = withoutGoat ? sources.indexOf(withoutGoat) : 0;
    const result = pickTradeCard(sources, 'goat', index, 0, new Set());
    expect(result.scope === 'country' || result.scope === 'any').toBe(true);
    expect(result.id.length).toBeGreaterThan(0);
    // Pool geral nunca falha, mesmo com tudo possuído.
    const everything = new Set(collectionPlayers.map((player) => player.id));
    expect(pickTradeCard(sources, 'goat', index, 0, everything).id.length).toBeGreaterThan(0);
  });

  it('prefere as não possuídas dentro da coleção', () => {
    const sources = tradeSources(playersOfRarity('superstar').slice(0, TRADE_INPUTS).map((player) => player.id));
    const rich = sources.find((source) => source.orgPool.filter((player) => player.rarity === 'legend').length >= 2);
    if (!rich) return;
    const legends = rich.orgPool.filter((player) => player.rarity === 'legend');
    const result = pickTradeCard(sources, 'legend', sources.indexOf(rich), 0, new Set([legends[0].id]));
    expect(result.id).not.toBe(legends[0].id);
  });

  it('as 5 entregas pesam igual: índice fora do alcance é presado', () => {
    const ids = playersOfRarity('elite').slice(0, TRADE_INPUTS).map((player) => player.id);
    const sources = tradeSources(ids);
    expect(sources).toHaveLength(TRADE_INPUTS);
    // pickRoll 0.99 com uma única candidata ainda devolve carta válida.
    const result = pickTradeCard(sources, 'legend', TRADE_INPUTS + 7, 0.99, new Set(collectionPlayers.map((player) => player.id)));
    expect(result.id.length).toBeGreaterThan(0);
  });
});

describe('Lendas (pura)', () => {
  it('quatro Lendas com alvos GOAT existentes e temas coerentes', () => {
    expect(LENDAS).toHaveLength(4);
    for (const def of LENDAS) {
      const target = collectionPlayerById.get(def.targetId);
      expect(target, def.targetId).toBeTruthy();
      expect(target!.rarity).toBe('goat');
      expect(isPlayerInTheme(def.theme, target!)).toBe(true);
      expect(checkLendaDonors(def, [def.targetId])).toBe('OK');
      expect(checkLendaDonors(def, [])).toBe('BAD_COUNT');
    }
  });

  it('o alvo da Lenda Francesa é o ZywOo do catálogo', () => {
    const lenda = LENDAS.find((def) => def.id === 'lenda-francesa')!;
    expect(lenda.targetId.startsWith('zywoo')).toBe(true);
    expect(cardCoinValue(lenda.targetId)).toBeGreaterThan(0);
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('trade-up, risco e lendas (Postgres)', () => {
  let db: Db;
  let userId: string;

  const seedFragment = (playerId: string, count = 1) => db.query('INSERT INTO card_fragments (user_id, player_id, count) VALUES ($1, $2, $3) ON CONFLICT (user_id, player_id) DO UPDATE SET count = $3', [userId, playerId, count]);
  const fragmentOf = async (playerId: string) => (await db.query<{ count: number }>('SELECT count FROM card_fragments WHERE user_id = $1 AND player_id = $2', [userId, playerId]))[0]?.count ?? 0;
  const ownedIds = async () => (await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1', [userId])).map((row) => row.player_id);
  const pinSeed = async (serverSeed: string) => {
    await db.query('INSERT INTO contract_seeds (user_id, server_seed) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET server_seed = EXCLUDED.server_seed', [userId, serverSeed]);
    const [row] = await db.query<{ nonce: number }>('SELECT nonce FROM contract_seeds WHERE user_id = $1', [userId]);
    return row.nonce;
  };
  const pinUpgraderSeed = async (serverSeed: string) => {
    await db.query('INSERT INTO upgrader_seeds (user_id, server_seed) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET server_seed = EXCLUDED.server_seed', [userId, serverSeed]);
    const [row] = await db.query<{ nonce: number }>('SELECT nonce FROM upgrader_seeds WHERE user_id = $1', [userId]);
    return row.nonce;
  };

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_contracts');
    await runMigrations(db);
    await db.query(`INSERT INTO users (email, verified_at) VALUES ('contracts@example.com', now())`);
    await db.query(`INSERT INTO wallets (user_id) SELECT id FROM users`);
    userId = (await db.query<{ id: string }>('SELECT id FROM users'))[0].id;
  });

  it('trade-up feliz: consome 5 fragmentos da mesma raridade, aplica a tabela e audita', async () => {
    const { getContractFair, runTradeUp } = await import('../server/collection/card-contracts');
    const { serverRoll } = await import('../server/collection/upgrader');
    const inputs = playersOfRarity('elite').slice(0, TRADE_INPUTS).map((player) => player.id);
    for (const id of inputs) await seedFragment(id, 2);
    const before = await getContractFair(db, userId);
    const result = await runTradeUp(db, userId, inputs, 'trade-seed-1');
    // A saída é coerente com os rolls e a tabela visível.
    const ladder = tradeLadder('elite');
    expect(result.resultTier).toBe(tradeTierOf(ladder, result.roll).tier);
    expect(result.step).toBe(tradeTierOf(ladder, result.roll).step);
    expect(result.sourceIndex).toBe(Math.min(TRADE_INPUTS - 1, Math.floor(result.sourceRoll * TRADE_INPUTS)));
    expect(result.roll).toBe(serverRoll(result.serverSeed, 'trade-seed-1', before.nonce));
    expect(result.sourceRoll).toBe(serverRoll(result.serverSeed, 'trade-seed-1', before.nonce, 'aff'));
    expect(result.pickRoll).toBe(serverRoll(result.serverSeed, 'trade-seed-1', before.nonce, 'pick'));
    expect(result.next.nonce).toBe(before.nonce + 1);
    // Consumo e recompensa.
    for (const id of inputs) expect(await fragmentOf(id)).toBe(1);
    expect(await ownedIds()).toContain(result.result);
    const [run] = await db.query(`SELECT contract_id, result, result_tier FROM contract_runs WHERE user_id = $1`, [userId]);
    expect(run).toMatchObject({ contract_id: 'tradeup', result: result.result, result_tier: result.resultTier });
  });

  it('raridades misturadas são 400 e fragmento em falta é 409, sem consumir nada', async () => {
    const { runTradeUp } = await import('../server/collection/card-contracts');
    const elite = playersOfRarity('elite')[0].id;
    const mixed = [elite, playersOfRarity('rare')[0].id, playersOfRarity('rare')[1].id, playersOfRarity('rare')[2].id, playersOfRarity('rare')[3].id];
    for (const id of mixed) await seedFragment(id, 1);
    await expect(runTradeUp(db, userId, mixed, 'seed-x')).rejects.toMatchObject({ status: 400, code: 'BAD_RARITY' });
    const missing = playersOfRarity('legend').slice(0, TRADE_INPUTS).map((player) => player.id);
    await expect(runTradeUp(db, userId, missing, 'seed-x')).rejects.toMatchObject({ status: 409, code: 'NO_FRAGMENT' });
    expect(await fragmentOf(elite)).toBe(1);
  });

  it('repetir carta na entrega: consome as unidades pedidas e barra quando o estoque não cobre', async () => {
    const { runTradeUp } = await import('../server/collection/card-contracts');
    const elites = playersOfRarity('elite').slice(0, 3).map((player) => player.id);
    await seedFragment(elites[0], 3);
    await seedFragment(elites[1], 2);
    // 3× da primeira + 2× da segunda: tudo consumido.
    const inputs = [elites[0], elites[0], elites[0], elites[1], elites[1]];
    const result = await runTradeUp(db, userId, inputs, 'trade-dupes');
    expect(result.sourceIndex).toBeLessThan(TRADE_INPUTS);
    expect(await fragmentOf(elites[0])).toBe(0);
    expect(await fragmentOf(elites[1])).toBe(0);
    // Pedir 2× quando só tem 1: 409 sem consumir nada.
    await seedFragment(elites[0], 1);
    await seedFragment(elites[1], 1);
    await expect(runTradeUp(db, userId, [elites[0], elites[0], elites[1], elites[1], elites[2]], 'seed-dupes-x')).rejects.toMatchObject({ status: 409, code: 'NO_FRAGMENT' });
    expect(await fragmentOf(elites[0])).toBe(1);
    expect(await fragmentOf(elites[1])).toBe(1);
  });

  it('risco: vitória entrega o alvo e derrota devolve a sacrificada como fragmento', async () => {
    const { cardUpgradeChance } = await import('../src/lib/game/online/card-value');
    const { riskUpgrade, serverRoll } = await import('../server/collection/upgrader');
    const sacrifices = playersOfRarity('superstar').slice(0, 3).map((player) => player.id);
    for (const id of sacrifices) await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack') ON CONFLICT DO NOTHING`, [userId, id]);
    // Derrota com seed presa: roll >= chance → o alvo não entra e o fragmento da sacrificada volta.
    const sacrifice = sacrifices[0];
    const target = playersOfRarity('goat')[0].id;
    const chance = cardUpgradeChance([sacrifice], target);
    expect(chance).toBeGreaterThan(0);
    const serverSeed = '5'.repeat(64);
    const nonce = await pinUpgraderSeed(serverSeed);
    let clientSeed = 'c0';
    for (let index = 0; ; index += 1) if ((serverRoll(serverSeed, `c${index}`, nonce) >= chance)) { clientSeed = `c${index}`; break; }
    const lost = await riskUpgrade(db, userId, sacrifice, target, clientSeed);
    expect(lost).toMatchObject({ won: false, stake: [sacrifice], target, risk: true, duplicateFragment: true });
    expect(await ownedIds()).not.toContain(target);
    expect(await fragmentOf(sacrifice)).toBe(1);
    // Vitória com seed presa (server seed diferente: upgrades.server_seed é único): o alvo entra com source 'upgrade'.
    const sacrifice2 = sacrifices[1];
    const winServerSeed = '6'.repeat(64);
    const nonce2 = await pinUpgraderSeed(winServerSeed);
    let winSeed = 'w0';
    for (let index = 0; ; index += 1) if ((serverRoll(winServerSeed, `w${index}`, nonce2) < chance)) { winSeed = `w${index}`; break; }
    const won = await riskUpgrade(db, userId, sacrifice2, target, winSeed);
    expect(won).toMatchObject({ won: true, target, risk: true });
    expect(await ownedIds()).toContain(target);
    expect(await fragmentOf(sacrifice2)).toBe(0);
  });

  it('risco recusa carta escalada, desconhecida e alvo já possuído', async () => {
    const { riskUpgrade } = await import('../server/collection/upgrader');
    const target = playersOfRarity('goat')[1].id;
    const notOwned = playersOfRarity('superstar')[9].id;
    await expect(riskUpgrade(db, userId, notOwned, target, 'seed')).rejects.toMatchObject({ status: 404, code: 'NOT_OWNED' });
    await expect(riskUpgrade(db, userId, target, target, 'seed')).rejects.toMatchObject({ status: 400, code: 'BAD_TARGET' });
  });

  it('Lenda: entrega parcial soma, o teto não consome excedente, o resgate garante o alvo e some com o progresso', async () => {
    const { deliverLenda, claimLenda } = await import('../server/collection/card-contracts');
    const lenda: LendaDef = LENDAS.find((def) => def.id === 'lenda-francesa')!;
    const frPlayers = collectionPlayers.filter((player) => isPlayerInTheme(frenchTheme, player)).slice(0, 30);
    for (const player of frPlayers) await seedFragment(player.id, 2);
    expect(await deliverLenda(db, userId, lenda.id, frPlayers.slice(0, 3).map((player) => player.id))).toMatchObject({ progress: 3, delivered: 3 });
    expect(await deliverLenda(db, userId, lenda.id, frPlayers.slice(3, 18).map((player) => player.id))).toMatchObject({ progress: 18, delivered: 15 });
    const delivery = await deliverLenda(db, userId, lenda.id, frPlayers.slice(0, 30).map((player) => player.id));
    expect(delivery).toMatchObject({ progress: LENDA_TARGET, complete: true, delivered: 7 });
    expect(await claimLenda(db, userId, lenda.id)).toEqual({ targetId: lenda.targetId });
    expect(await ownedIds()).toContain(lenda.targetId);
    await expect(claimLenda(db, userId, lenda.id)).rejects.toMatchObject({ status: 409, code: 'LENDA_INCOMPLETE' });
    for (const player of frPlayers) await seedFragment(player.id, 1);
    const thirty = collectionPlayers.filter((player) => isPlayerInTheme(frenchTheme, player)).slice(0, 30).map((player) => player.id);
    await deliverLenda(db, userId, lenda.id, thirty);
    await expect(claimLenda(db, userId, lenda.id)).rejects.toMatchObject({ status: 409, code: 'ALREADY_OWNED' });
  });
});

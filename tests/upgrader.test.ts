// tests/upgrader.test.ts
// Chance do upgrader (pura), o provably fair (vetores fixos, node:crypto = crypto.subtle) e os desfechos contra o Postgres local. A parte de banco é pulada sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardCoinValue, cardUpgradeChance } from '../src/lib/game/online/card-value';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { UPGRADER_MAX_CHANCE, UPGRADER_RARITY_CAP, upgradeChance } from '../src/lib/game/online/collection-rules';
import { CONSOLATION_COMMON_CHANCE, CONSOLATION_VALUE_RATIO, consolationCard, fairConsolation, fairRoll, rollDegrees, rollFromHex, sha256Hex, verifyFair } from '../src/lib/game/online/fair';
import { collectionCoachById, collectionPlayerById } from '../src/lib/game/online/collection-pool';
import { rarityOf } from '../src/lib/game/online/collection-rules';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

describe('chance do upgrader', () => {
  it('é aposta/alvo × 0,9, com teto de 75% até Superstar', () => {
    expect(upgradeChance(100, 1000, 'rare', ['common'])).toBeCloseTo(0.09, 10);
    expect(upgradeChance(500, 1000, 'elite', ['rare'])).toBeCloseTo(0.45, 10);
    expect(upgradeChance(990, 1000, 'superstar', ['elite'])).toBe(UPGRADER_MAX_CHANCE);
    for (const rarity of ['common', 'rare', 'elite', 'superstar'] as const) expect(UPGRADER_RARITY_CAP[rarity]).toBe(0.75);
    expect(upgradeChance(0, 1000, 'rare', ['common'])).toBe(0);
    expect(upgradeChance(100, 0, 'rare', ['common'])).toBe(0);
  });

  it('teto de 40% em Lenda e 20% em GOAT', () => {
    expect(upgradeChance(20000, 24000, 'legend', ['legend'])).toBe(0.4);
    expect(upgradeChance(9000, 24000, 'legend', ['superstar'])).toBeCloseTo(0.3375, 10);
    expect(upgradeChance(90000, 100000, 'goat', ['legend'])).toBe(0.2);
    expect(upgradeChance(10000, 100000, 'goat', ['legend'])).toBeCloseTo(0.09, 10);
  });

  it('alvo 2+ raridades acima da melhor carta apostada: metade da chance, depois do teto', () => {
    // Elite → Lenda (2 acima): 6.000/24.000 × 0,9 = 22,5% → 11,25%.
    expect(upgradeChance(6000, 24000, 'legend', ['elite'])).toBeCloseTo(0.1125, 10);
    // Muitas comuns por uma Lenda: bate no teto de 40% e cai para 20%.
    expect(upgradeChance(15000, 24000, 'legend', ['common', 'common', 'common', 'common', 'common', 'common'])).toBeCloseTo(0.2, 10);
    // Uma Superstar na aposta tira a penalidade (só 1 acima).
    expect(upgradeChance(15000, 24000, 'legend', ['common', 'superstar'])).toBe(0.4);
    // GOAT a partir de Superstar: teto 20% vira 10%.
    expect(upgradeChance(90000, 100000, 'goat', ['superstar'])).toBeCloseTo(0.1, 10);
    // Coach usa a raridade dele: por id, a regra é a mesma do servidor.
    const coach = [...collectionCoachById.values()].find((item) => rarityOf(item) === 'legend');
    const common = collectionPlayers.find((player) => rarityOf(player) === 'common')!;
    if (coach) expect(cardUpgradeChance([common.id], coach.id)).toBeCloseTo(upgradeChance(cardCoinValue(common.id), cardCoinValue(coach.id), 'legend', ['common']), 10);
  });
});

/** Vetores fixos: calculados uma vez com node:crypto (HMAC-SHA256, 13 primeiros hex / 16^13). */
const VECTORS = [
  { serverSeed: 'a'.repeat(64), clientSeed: 'cliente', nonce: 0, hex: '7eb3859e4857b', roll: 0.49492678751297947, refund: 0.8217054038217748, hash: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' },
  { serverSeed: '00ff'.repeat(16), clientSeed: 'x', nonce: 7, hex: '4b802231c0d95', roll: 0.29492391314201893, refund: 0.08885120925577938, hash: 'f6775dfb33b915d8c44b3a6c327f9d0ac71a0b163726da98c7a1a261932b9198' }
];

describe('provably fair (puro)', () => {
  it('servidor (node:crypto) e navegador (crypto.subtle) dão o mesmo roll nos vetores fixos', async () => {
    const { serverRoll, sha256 } = await import('../server/collection/upgrader');
    for (const vector of VECTORS) {
      expect(rollFromHex(vector.hex)).toBe(vector.roll);
      expect(serverRoll(vector.serverSeed, vector.clientSeed, vector.nonce)).toBe(vector.roll);
      expect(await fairRoll(vector.serverSeed, vector.clientSeed, vector.nonce)).toBe(vector.roll);
      expect(serverRoll(vector.serverSeed, vector.clientSeed, vector.nonce, 'refund')).toBe(vector.refund);
      expect(await fairRoll(vector.serverSeed, vector.clientSeed, vector.nonce, 'refund')).toBe(vector.refund);
      expect(sha256(vector.serverSeed)).toBe(vector.hash);
      expect(await sha256Hex(vector.serverSeed)).toBe(vector.hash);
    }
  });

  it('roll fica em [0, 1) e o ponteiro para em roll × 360', () => {
    expect(rollFromHex('0000000000000')).toBe(0);
    expect(rollFromHex('fffffffffffff')).toBeLessThan(1);
    expect(rollDegrees(0.25)).toBe(90);
  });

  it('verificação: aceita a rodada certa e recusa seed, hash, roll ou desfecho adulterados', async () => {
    const [vector] = VECTORS;
    const reveal = { serverSeed: vector.serverSeed, serverSeedHash: vector.hash, clientSeed: vector.clientSeed, nonce: vector.nonce, roll: vector.roll, chance: 0.5, won: true };
    expect(await verifyFair(reveal)).toBe(true);
    expect(await verifyFair(reveal, VECTORS[1].hash)).toBe(false);
    expect(await verifyFair({ ...reveal, serverSeed: 'b'.repeat(64) })).toBe(false);
    expect(await verifyFair({ ...reveal, roll: 0.1 })).toBe(false);
    expect(await verifyFair({ ...reveal, won: false })).toBe(false);
    expect(await verifyFair({ ...reveal, nonce: 1 })).toBe(false);
  });
});

const rarityOfCard = (id: string) => rarityOf((collectionCoachById.get(id) ?? collectionPlayerById.get(id))!);

describe('carta rebaixada da derrota (pura)', () => {
  const byValue = [...collectionPlayers].sort((a, b) => cardCoinValue(a.id) - cardCoinValue(b.id));
  /** Six expensive cards: 20% of their value has plenty of cheaper cards. */
  const rich = byValue.slice(-6).map((player) => player.id);
  const target = byValue[byValue.length - 7].id;
  const rolls = Array.from({ length: 200 }, (_, index) => (index + 0.5) / 200);

  it('ramo comum abaixo de 0,7: sempre uma comum, nunca apostada nem o alvo', () => {
    for (const pick of rolls) {
      const result = consolationCard(CONSOLATION_COMMON_CHANCE - 0.01, pick, rich, target);
      expect(result.kind).toBe('common');
      expect(rarityOfCard(result.card)).toBe('common');
      expect(rich).not.toContain(result.card);
      expect(result.card).not.toBe(target);
    }
  });

  it('ramo de valor a partir de 0,7: vale no máximo 20% da aposta e fica perto disso', () => {
    const limit = rich.reduce((sum, id) => sum + cardCoinValue(id), 0) * CONSOLATION_VALUE_RATIO;
    const best = Math.max(...[...collectionPlayerById.keys(), ...collectionCoachById.keys()].map(cardCoinValue).filter((value) => value <= limit));
    const seen = new Set<string>();
    for (const pick of rolls) {
      const result = consolationCard(CONSOLATION_COMMON_CHANCE, pick, rich, target);
      expect(result.kind).toBe('value');
      expect(cardCoinValue(result.card)).toBeLessThanOrEqual(limit);
      expect(cardCoinValue(result.card)).toBeGreaterThanOrEqual(best * 0.9);
      expect(rich).not.toContain(result.card);
      seen.add(result.card);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('aposta barata demais para 20%: o ramo de valor cai numa comum', () => {
    const cheap = [byValue[0].id];
    const result = consolationCard(0.99, 0.5, cheap, target);
    expect(result.kind).toBe('common');
    expect(result.card).not.toBe(cheap[0]);
  });

  it('com uma carta só, a rebaixada nunca é a apostada, em nenhum sorteio', () => {
    for (const id of [byValue[0].id, byValue.at(-1)!.id]) {
      for (const branch of [0, 0.5, 0.7, 0.99]) for (const pick of rolls) expect(consolationCard(branch, pick, [id], target).card).not.toBe(id);
    }
  });

  it('mesma seed, mesma carta: servidor (node:crypto) e navegador (crypto.subtle)', async () => {
    const { serverRoll } = await import('../server/collection/upgrader');
    const kinds = new Set<string>();
    for (let nonce = 0; nonce < 40; nonce += 1) {
      const server = consolationCard(serverRoll('f'.repeat(64), 'seed', nonce, 'refund'), serverRoll('f'.repeat(64), 'seed', nonce, 'refund-pick'), rich, target);
      expect(await fairConsolation('f'.repeat(64), 'seed', nonce, rich, target)).toEqual(server);
      kinds.add(server.kind);
    }
    expect(kinds).toEqual(new Set(['common', 'value']));
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('upgrader (Postgres)', () => {
  let db: Db;
  let userId = '';
  const byValue = [...collectionPlayers].sort((a, b) => cardCoinValue(a.id) - cardCoinValue(b.id));
  const cheap = byValue.slice(0, 8).map((player) => player.id);
  const target = byValue.find((player) => cardCoinValue(player.id) > cheap.reduce((sum, id) => sum + cardCoinValue(id), 0))!.id;
  const owned = async () => (await db.query<{ player_id: string; source: string }>('SELECT player_id, source FROM collection WHERE user_id = $1', [userId]));
  /** Pins the user's unused server seed, so the draw is known in advance. */
  const pinSeed = async (serverSeed: string) => {
    await db.query('INSERT INTO upgrader_seeds (user_id, server_seed) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET server_seed = EXCLUDED.server_seed', [userId, serverSeed]);
    const [row] = await db.query<{ nonce: number }>('SELECT nonce FROM upgrader_seeds WHERE user_id = $1', [userId]);
    return row.nonce;
  };
  /** A client seed whose roll lands on the wanted side of the chance with that server seed and nonce. */
  const clientSeedFor = async (serverSeed: string, nonce: number, chance: number, win: boolean) => {
    const { serverRoll } = await import('../server/collection/upgrader');
    for (let index = 0; ; index += 1) if ((serverRoll(serverSeed, `c${index}`, nonce) < chance) === win) return `c${index}`;
  };

  beforeAll(async () => {
    const { runMigrations } = await import('../server/db/migrations');
    db = await createTestDb(url!, 'test_upgrader');
    await runMigrations(db);
    [{ id: userId }] = await db.query<{ id: string }>(`INSERT INTO users (email, verified_at) VALUES ('upgrader@example.com', now()) RETURNING id`);
    await db.query('INSERT INTO wallets (user_id, coins) VALUES ($1, 500)', [userId]);
    for (const id of cheap) await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack')`, [userId, id]);
  });
  afterAll(async () => { await db?.close(); });

  it('derrota com uma carta: a apostada é perdida e entra uma rebaixada; saldo intacto', async () => {
    const { upgradeCards, getFairState, serverRoll, sha256 } = await import('../server/collection/upgrader');
    const stake = cheap.slice(0, 1);
    const chance = cardUpgradeChance(stake, target);
    const serverSeed = 'd'.repeat(64);
    const nonce = await pinSeed(serverSeed);
    const before = await getFairState(db, userId);
    expect(before).toEqual({ serverSeedHash: sha256(serverSeed), nonce });
    const clientSeed = await clientSeedFor(serverSeed, nonce, chance, false);
    const result = await upgradeCards(db, userId, stake, target, clientSeed);
    expect(result.won).toBe(false);
    // Determinístico dada a seed: o roll e a carta rebaixada saem do HMAC.
    expect(result.roll).toBe(serverRoll(serverSeed, clientSeed, nonce));
    const expected = consolationCard(serverRoll(serverSeed, clientSeed, nonce, 'refund'), serverRoll(serverSeed, clientSeed, nonce, 'refund-pick'), stake, target);
    expect(result).toMatchObject({ consolation: expected.card, consolationKind: expected.kind, stake });
    expect(stake).not.toContain(result.consolation);
    // O navegador chega na mesma carta e o Verificar confere tudo.
    expect((await fairConsolation(serverSeed, clientSeed, nonce, stake, target)).card).toBe(result.consolation);
    expect(result).toMatchObject({ serverSeed, serverSeedHash: before.serverSeedHash, clientSeed, nonce });
    expect(await verifyFair(result, before.serverSeedHash)).toBe(true);
    expect(await verifyFair({ ...result, consolation: stake[0] }, before.serverSeedHash)).toBe(false);
    // A seed rotaciona: hash novo, nonce + 1, e é isso que o GET devolve agora.
    expect(result.next.serverSeedHash).not.toBe(before.serverSeedHash);
    expect(result.next.nonce).toBe(nonce + 1);
    expect(await getFairState(db, userId)).toEqual(result.next);
    expect(result.chance).toBeCloseTo(chance, 10);
    const rows = await owned();
    const ids = rows.map((row) => row.player_id);
    expect(ids).not.toContain(stake[0]);
    expect(ids).not.toContain(target);
    expect(result.duplicate).toBe(cheap.includes(result.consolation!) && result.consolation !== stake[0]);
    if (!result.duplicate) expect(rows.find((row) => row.player_id === result.consolation)?.source).toBe('upgrade');
    const [row] = await db.query('SELECT won, returned, server_seed, server_seed_hash, client_seed, nonce, roll FROM upgrades WHERE user_id = $1', [userId]);
    expect(row).toEqual({ won: false, returned: result.consolation, server_seed: serverSeed, server_seed_hash: before.serverSeedHash, client_seed: clientSeed, nonce, roll: result.roll });
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(500 + result.duplicateCoins);
  });

  it('derrota com várias cartas: todas são perdidas; rebaixada repetida vira coins', async () => {
    const { upgradeCards, serverRoll } = await import('../server/collection/upgrader');
    const { duplicateValue } = await import('../server/collection/service');
    const stake = cheap.slice(1, 3);
    const chance = cardUpgradeChance(stake, target);
    const serverSeed = '9'.repeat(64);
    const nonce = await pinSeed(serverSeed);
    const clientSeed = await clientSeedFor(serverSeed, nonce, chance, false);
    const expected = consolationCard(serverRoll(serverSeed, clientSeed, nonce, 'refund'), serverRoll(serverSeed, clientSeed, nonce, 'refund-pick'), stake, target);
    // Já tem a carta que vai sair: ela vira coins.
    await db.query(`INSERT INTO collection (user_id, player_id, source) VALUES ($1, $2, 'pack') ON CONFLICT DO NOTHING`, [userId, expected.card]);
    const [{ coins: before }] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    const result = await upgradeCards(db, userId, stake, target, clientSeed);
    expect(result).toMatchObject({ won: false, consolation: expected.card, duplicate: true, duplicateCoins: duplicateValue(expected.card) });
    expect(result.duplicateCoins).toBeGreaterThan(0);
    const ids = (await owned()).map((row) => row.player_id);
    for (const id of stake) expect(ids).not.toContain(id);
    const [{ coins: after }] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(after).toBe(before + result.duplicateCoins);
    await db.query('DELETE FROM collection WHERE user_id = $1 AND player_id = $2 AND NOT (player_id = ANY($3))', [userId, expected.card, cheap]);
  });

  it('vitória: as apostadas saem e o alvo entra', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const stake = cheap.slice(3, 5);
    const chance = cardUpgradeChance(stake, target);
    const serverSeed = 'e'.repeat(64);
    const nonce = await pinSeed(serverSeed);
    const clientSeed = await clientSeedFor(serverSeed, nonce, chance, true);
    const result = await upgradeCards(db, userId, stake, target, clientSeed);
    expect(result).toMatchObject({ won: true, consolation: null, consolationKind: null, duplicate: false, target, serverSeed, nonce });
    expect(result.roll).toBeLessThan(chance);
    const rows = await owned();
    expect(rows.find((row) => row.player_id === target)?.source).toBe('upgrade');
    for (const id of stake) expect(rows.map((row) => row.player_id)).not.toContain(id);
  });

  it('recusa carta escalada, carta que não é sua, alvo barato e alvo que já tem', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const [a, b] = cheap.slice(5, 7);
    await db.query(`INSERT INTO lineups (user_id, player_ids, roles) VALUES ($1, $2, $3)`, [userId, [a, 'x1', 'x2', 'x3', 'x4'], ['rifler', 'rifler', 'rifler', 'rifler', 'rifler']]);
    await expect(upgradeCards(db, userId, [a], byValue.at(-1)!.id, 'seed')).rejects.toMatchObject({ code: 'IN_LINEUP' });
    await expect(upgradeCards(db, userId, [byValue[40].id], byValue.at(-1)!.id, 'seed')).rejects.toMatchObject({ code: 'NOT_OWNED' });
    await expect(upgradeCards(db, userId, [b], cheap[0], 'seed')).rejects.toMatchObject({ code: 'TARGET_TOO_CHEAP' });
    await expect(upgradeCards(db, userId, [b], target, 'seed')).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    await expect(upgradeCards(db, userId, [b], target, '')).rejects.toMatchObject({ code: 'BAD_CLIENT_SEED' });
    await expect(upgradeCards(db, userId, [b], target, 'x'.repeat(65))).rejects.toMatchObject({ code: 'BAD_CLIENT_SEED' });
    expect((await owned()).map((row) => row.player_id)).toContain(b);
  });
});

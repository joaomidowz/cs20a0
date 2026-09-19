// tests/upgrader.test.ts
// Chance do upgrader (pura), o provably fair (vetores fixos, node:crypto = crypto.subtle) e os desfechos contra o Postgres local. A parte de banco é pulada sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardCoinValue } from '../src/lib/game/online/card-value';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { UPGRADER_MAX_CHANCE, upgradeChance } from '../src/lib/game/online/collection-rules';
import { fairRoll, rollDegrees, rollFromHex, sha256Hex, verifyFair } from '../src/lib/game/online/fair';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';

describe('chance do upgrader', () => {
  it('é aposta/alvo × 0,9, com teto de 75%', () => {
    expect(upgradeChance(100, 1000)).toBeCloseTo(0.09, 10);
    expect(upgradeChance(500, 1000)).toBeCloseTo(0.45, 10);
    expect(upgradeChance(990, 1000)).toBe(UPGRADER_MAX_CHANCE);
    expect(upgradeChance(0, 1000)).toBe(0);
    expect(upgradeChance(100, 0)).toBe(0);
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

  it('derrota: as apostadas saem e só uma delas volta; saldo intacto', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const stake = cheap.slice(0, 2);
    const chance = upgradeChance(cardCoinValue(stake[0]) + cardCoinValue(stake[1]), cardCoinValue(target));
    const { getFairState, serverRoll, sha256 } = await import('../server/collection/upgrader');
    const serverSeed = 'd'.repeat(64);
    const nonce = await pinSeed(serverSeed);
    const before = await getFairState(db, userId);
    expect(before).toEqual({ serverSeedHash: sha256(serverSeed), nonce });
    const clientSeed = await clientSeedFor(serverSeed, nonce, chance, false);
    const result = await upgradeCards(db, userId, stake, target, clientSeed);
    expect(result.won).toBe(false);
    // Determinístico dada a seed: o roll e a carta devolvida saem do HMAC.
    expect(result.roll).toBe(serverRoll(serverSeed, clientSeed, nonce));
    expect(result.returned).toBe(stake[Math.floor(serverRoll(serverSeed, clientSeed, nonce, 'refund') * stake.length)]);
    // A revelação bate com o hash publicado antes do giro.
    expect(result).toMatchObject({ serverSeed, serverSeedHash: before.serverSeedHash, clientSeed, nonce });
    expect(sha256(result.serverSeed)).toBe(before.serverSeedHash);
    expect(await verifyFair(result, before.serverSeedHash)).toBe(true);
    // A seed rotaciona: hash novo, nonce + 1, e é isso que o GET devolve agora.
    expect(result.next.serverSeedHash).not.toBe(before.serverSeedHash);
    expect(result.next.nonce).toBe(nonce + 1);
    expect(await getFairState(db, userId)).toEqual(result.next);
    expect(result.chance).toBeCloseTo(chance, 10);
    expect(stake).toContain(result.returned);
    const ids = (await owned()).map((row) => row.player_id);
    expect(ids).toContain(result.returned);
    expect(ids).not.toContain(stake.find((id) => id !== result.returned));
    expect(ids).not.toContain(target);
    const [row] = await db.query('SELECT won, returned, server_seed, server_seed_hash, client_seed, nonce, roll FROM upgrades WHERE user_id = $1', [userId]);
    expect(row).toEqual({ won: false, returned: result.returned, server_seed: serverSeed, server_seed_hash: before.serverSeedHash, client_seed: clientSeed, nonce, roll: result.roll });
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(500);
  });

  it('vitória: as apostadas saem e o alvo entra', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const stake = cheap.slice(2, 5);
    const chance = upgradeChance(stake.reduce((sum, id) => sum + cardCoinValue(id), 0), cardCoinValue(target));
    const serverSeed = 'e'.repeat(64);
    const nonce = await pinSeed(serverSeed);
    const clientSeed = await clientSeedFor(serverSeed, nonce, chance, true);
    const result = await upgradeCards(db, userId, stake, target, clientSeed);
    expect(result).toMatchObject({ won: true, returned: null, target, serverSeed, nonce });
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

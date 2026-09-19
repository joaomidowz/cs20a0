// tests/upgrader.test.ts
// Chance do upgrader (pura) e os dois desfechos contra o Postgres local. A parte de banco é pulada sem TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cardCoinValue } from '../src/lib/game/online/card-value';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { UPGRADER_MAX_CHANCE, upgradeChance } from '../src/lib/game/online/collection-rules';
import { createSeededRng } from '../src/lib/game/simulation';
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

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('upgrader (Postgres)', () => {
  let db: Db;
  let userId = '';
  const byValue = [...collectionPlayers].sort((a, b) => cardCoinValue(a.id) - cardCoinValue(b.id));
  const cheap = byValue.slice(0, 8).map((player) => player.id);
  const target = byValue.find((player) => cardCoinValue(player.id) > cheap.reduce((sum, id) => sum + cardCoinValue(id), 0))!.id;
  const owned = async () => (await db.query<{ player_id: string; source: string }>('SELECT player_id, source FROM collection WHERE user_id = $1', [userId]));
  /** A seed whose first draw lands on the wanted side of the chance. */
  const seedFor = (chance: number, win: boolean) => {
    for (let index = 0; ; index += 1) if ((createSeededRng(`s${index}`)() < chance) === win) return `s${index}`;
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
    const result = await upgradeCards(db, userId, stake, target, seedFor(chance, false));
    expect(result.won).toBe(false);
    expect(result.chance).toBeCloseTo(chance, 10);
    expect(stake).toContain(result.returned);
    const ids = (await owned()).map((row) => row.player_id);
    expect(ids).toContain(result.returned);
    expect(ids).not.toContain(stake.find((id) => id !== result.returned));
    expect(ids).not.toContain(target);
    const [row] = await db.query<{ won: boolean; returned: string }>('SELECT won, returned FROM upgrades WHERE user_id = $1', [userId]);
    expect(row).toEqual({ won: false, returned: result.returned });
    const [wallet] = await db.query<{ coins: number }>('SELECT coins FROM wallets WHERE user_id = $1', [userId]);
    expect(wallet.coins).toBe(500);
  });

  it('vitória: as apostadas saem e o alvo entra', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const stake = cheap.slice(2, 5);
    const chance = upgradeChance(stake.reduce((sum, id) => sum + cardCoinValue(id), 0), cardCoinValue(target));
    const result = await upgradeCards(db, userId, stake, target, seedFor(chance, true));
    expect(result).toMatchObject({ won: true, returned: null, target });
    const rows = await owned();
    expect(rows.find((row) => row.player_id === target)?.source).toBe('upgrade');
    for (const id of stake) expect(rows.map((row) => row.player_id)).not.toContain(id);
  });

  it('recusa carta escalada, carta que não é sua, alvo barato e alvo que já tem', async () => {
    const { upgradeCards } = await import('../server/collection/upgrader');
    const [a, b] = cheap.slice(5, 7);
    await db.query(`INSERT INTO lineups (user_id, player_ids, roles) VALUES ($1, $2, $3)`, [userId, [a, 'x1', 'x2', 'x3', 'x4'], ['rifler', 'rifler', 'rifler', 'rifler', 'rifler']]);
    await expect(upgradeCards(db, userId, [a], byValue.at(-1)!.id)).rejects.toMatchObject({ code: 'IN_LINEUP' });
    await expect(upgradeCards(db, userId, [byValue[40].id], byValue.at(-1)!.id)).rejects.toMatchObject({ code: 'NOT_OWNED' });
    await expect(upgradeCards(db, userId, [b], cheap[0])).rejects.toMatchObject({ code: 'TARGET_TOO_CHEAP' });
    await expect(upgradeCards(db, userId, [b], target)).rejects.toMatchObject({ code: 'ALREADY_OWNED' });
    expect((await owned()).map((row) => row.player_id)).toContain(b);
  });
});

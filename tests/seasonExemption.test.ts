// tests/seasonExemption.test.ts
// A conta do dono joga tudo, mas nunca aparece em ranking nenhum: tabela da temporada, pódio fechado e prêmios.
// Postgres local; pulado sem TEST_DATABASE_URL.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../server/db/client';
import { createTestDb } from './helpers/testDb';
import { runMigrations } from '../server/db/migrations';
import { closeFinishedSeasons, currentStandings, isRankingExempt, lastSeasonPodium } from '../server/collection/seasons';

const url = process.env.TEST_DATABASE_URL;
const OWNER_EMAIL = 'jgcustodio2005@gmail.com';
const NOW = Date.UTC(2026, 8, 20, 12); // dentro da temporada de setembro/2026
const LATER = Date.UTC(2026, 9, 2, 12); // temporada de outubro já vencida

describe.skipIf(!url)('conta do dono fora do ranking (Postgres)', () => {
  let db: Db;
  let owner = '';

  beforeAll(async () => {
    db = await createTestDb(url!, 'test_season_exempt');
    await runMigrations(db);
    const id = randomUUID();
    await db.query('INSERT INTO users (id, email, display_name, verified_at) VALUES ($1, $2, $3, now())', [id, OWNER_EMAIL, 'Dono']);
    owner = id;
  });

  afterAll(async () => { await db?.close(); });

  const insertUser = async (email: string): Promise<string> => {
    const id = randomUUID();
    await db.query('INSERT INTO users (id, email, display_name, verified_at) VALUES ($1, $2, $3, now())', [id, email, email.split('@')[0]]);
    return id;
  };
  const insertSeason = async (month: string, endsAt: string, status = 'active'): Promise<number> => {
    const [season] = await db.query<{ id: number }>(
      'INSERT INTO seasons (month, starts_at, ends_at, status) VALUES ($1::date, $2, $3, $4) RETURNING id',
      [month, `${month}T00:00:00Z`, endsAt, status]
    );
    return season.id;
  };
  const insertStandings = async (seasonId: number, userId: string, points: number, won = 0) => {
    await db.query(
      'INSERT INTO season_standings (season_id, user_id, majors_won, majors_played, points, avg_rating) VALUES ($1, $2, $3, 3, $4, 7.5)',
      [seasonId, userId, won, points]
    );
  };

  it('o contrato de exceção aponta para a conta do dono', () => {
    expect(isRankingExempt(OWNER_EMAIL)).toBe(true);
    expect(isRankingExempt('JGCUSTODIO2005@GMAIL.COM')).toBe(true);
    expect(isRankingExempt('jogador@example.com')).toBe(false);
  });

  it('some da tabela da temporada, mas continua se enxergando em `me`', async () => {
    const beta = await insertUser('beta@example.com');
    const gama = await insertUser('gama@example.com');
    const season = await insertSeason('2026-09-01', '2026-09-30T21:00:00Z');
    await insertStandings(season, owner, 500, 2);
    await insertStandings(season, beta, 300, 1);
    await insertStandings(season, gama, 100);

    const table = await currentStandings(db, NOW, null);
    expect(table.top.map((row) => row.userId)).toEqual([beta, gama]);
    expect(table.top.map((row) => row.rank)).toEqual([1, 2]);

    const self = await currentStandings(db, NOW, owner);
    expect(self.top.some((row) => row.userId === owner)).toBe(false);
    expect(self.me?.userId).toBe(owner);
    expect(self.me?.rank).toBe(1); // a posição que ocuparia: ninguém não-isento à frente
  });

  it('não ocupa vaga no pódio da temporada fechada', async () => {
    const a = await insertUser('alfa@example.com');
    const bravo = await insertUser('bravo@example.com');
    const charlie = await insertUser('charlie@example.com');
    const delta = await insertUser('delta@example.com');
    const season = await insertSeason('2026-08-01', '2026-08-31T21:00:00Z', 'closed');
    await insertStandings(season, owner, 900, 3);
    await insertStandings(season, a, 700, 2);
    await insertStandings(season, bravo, 500, 1);
    await insertStandings(season, charlie, 300);
    await insertStandings(season, delta, 100);

    const podium = await lastSeasonPodium(db);
    expect(podium?.podium.map((row) => row.points)).toEqual([700, 500, 300]);
    expect(podium?.podium.some((row) => row.points === 900)).toBe(false);
  });

  it('não recebe prêmio de fim de temporada; o resto da tabela sobe', async () => {
    const eco = await insertUser('eco@example.com');
    const season = await insertSeason('2026-10-01', '2026-10-01T21:00:00Z');
    await insertStandings(season, owner, 500, 2);
    await insertStandings(season, eco, 300, 1);

    const closed = await closeFinishedSeasons(db, LATER);
    // Setembro (teste anterior) também vence neste relógio; só outubro é desta asserção.
    expect(closed.find((row) => row.month === '2026-10-01')).toEqual({ seasonId: season, month: '2026-10-01', awarded: 1 });

    const [ownerAwards] = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM awards WHERE user_id = $1', [owner]);
    expect(Number(ownerAwards.n)).toBe(0);
    const [ecoAward] = await db.query<{ detail: { rank: number } }>('SELECT detail FROM awards WHERE user_id = $1', [eco]);
    expect(ecoAward.detail.rank).toBe(1); // o título vai para o primeiro não-isento
  });
});

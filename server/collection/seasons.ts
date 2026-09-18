import { matchReward } from '../../src/lib/game/online/collection-rules';
import type { Db, Tx } from '../db/client';
import { playerById } from '../data';
import type { RunCompletedEvent } from '../room-manager';
import { detectAwards } from './awards';
import { applyLedger } from './service';
import { dayKeyUtcMinus3, seasonMonthOf } from './time';

/** Points of a ranked title by lobby size: playing alone against bots never scores. */
export const POINTS_BY_LOBBY: ReadonlyArray<{ min: number; points: number }> = [
  { min: 8, points: 5 },
  { min: 4, points: 3 },
  { min: 2, points: 1 }
];
export const RANKED_MIN_LOBBY = 4;

export const pointsFor = (lobbySize: number): number => POINTS_BY_LOBBY.find((rule) => lobbySize >= rule.min)?.points ?? 0;

export async function ensureActiveSeason(tx: Tx, now: number): Promise<number> {
  const { month, startsAt, endsAt } = seasonMonthOf(now);
  const [row] = await tx.query<{ id: number }>(
    `INSERT INTO seasons (month, starts_at, ends_at) VALUES ($1, $2, $3)
     ON CONFLICT (month) DO UPDATE SET month = seasons.month RETURNING id`,
    [month, new Date(startsAt), new Date(endsAt)]
  );
  await tx.query('INSERT INTO season_rules (season_id, points_json) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, JSON.stringify({ byLobby: POINTS_BY_LOBBY, rankedMinLobby: RANKED_MIN_LOBBY })]);
  return row.id;
}

/** Persists one finished run for every collection participant. Idempotent by (room, seed, user). */
export async function recordMajor(db: Db, event: RunCompletedEvent, now: number): Promise<void> {
  for (const entry of event.entries) {
    await db.tx(async (tx) => {
      const [existing] = await tx.query('SELECT id FROM majors WHERE room_code = $1 AND seed = $2 AND user_id = $3', [event.roomCode, event.seed, entry.userId]);
      if (existing) return;
      const seasonId = await ensureActiveSeason(tx, now);
      const ranked = event.lobbySize >= RANKED_MIN_LOBBY;
      const day = dayKeyUtcMinus3(now);
      const [today] = await tx.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM majors WHERE user_id = $1 AND ranked AND counted AND (played_at AT TIME ZONE 'UTC' - interval '3 hours')::date = $2::date`,
        [entry.userId, day]
      );
      const counted = ranked && Number(today.n) === 0;
      const basePoints = counted && entry.champion ? pointsFor(event.lobbySize) : 0;
      const detected = detectAwards({ ...entry, awards: event.awards, lookup: (id) => playerById.get(id) });
      const rules = new Map((await tx.query<{ kind: string; coins: number; points: number; once_per_season: boolean }>('SELECT kind, coins, points, once_per_season FROM award_rules')).map((row) => [row.kind, row]));
      let awardPoints = 0;
      let awardCoins = 0;
      const granted: string[] = [];
      for (const award of detected) {
        const rule = rules.get(award.kind);
        if (!rule) continue;
        if (!ranked && ['major_title', 'major_mvp', 'top10_player'].includes(award.kind)) continue;
        if (rule.once_per_season) {
          const [already] = await tx.query('SELECT id FROM awards WHERE user_id = $1 AND kind = $2 AND season_id = $3', [entry.userId, award.kind, seasonId]);
          if (already) continue;
        }
        await tx.query('INSERT INTO awards (user_id, kind, ref_id, season_id, detail) VALUES ($1, $2, $3, $4, $5)', [entry.userId, award.kind, `${event.roomCode}:${event.seed}`, seasonId, JSON.stringify(award.detail)]);
        awardPoints += counted ? rule.points : 0;
        awardCoins += rule.coins;
        granted.push(award.kind);
      }
      const points = basePoints + awardPoints;
      const ratings = entry.stats.map((line) => line.runRating).filter((value) => Number.isFinite(value));
      const avgRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
      await tx.query(
        `INSERT INTO majors (season_id, user_id, room_code, seed, lobby_size, ranked, counted, placement, champion, points, avg_rating, awards)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [seasonId, entry.userId, event.roomCode, event.seed, event.lobbySize, ranked, counted, entry.placement, entry.champion, points, avgRating, JSON.stringify(granted)]
      );
      const reward = matchReward(entry.placement, ranked);
      await applyLedger(tx, entry.userId, reward, 'match_reward', `${event.roomCode}:${event.seed}`);
      if (awardCoins) await applyLedger(tx, entry.userId, awardCoins, 'award', `${event.roomCode}:${event.seed}`);
      await tx.query(
        `INSERT INTO season_standings (season_id, user_id, majors_won, majors_played, points, avg_rating)
         VALUES ($1, $2, $3, 1, $4, $5)
         ON CONFLICT (season_id, user_id) DO UPDATE SET
           majors_won = season_standings.majors_won + EXCLUDED.majors_won,
           majors_played = season_standings.majors_played + 1,
           points = season_standings.points + EXCLUDED.points,
           avg_rating = CASE WHEN EXCLUDED.avg_rating IS NULL THEN season_standings.avg_rating
             WHEN season_standings.avg_rating IS NULL THEN EXCLUDED.avg_rating
             ELSE (season_standings.avg_rating * season_standings.majors_played + EXCLUDED.avg_rating) / (season_standings.majors_played + 1) END`,
        [seasonId, entry.userId, entry.champion && ranked ? 1 : 0, points, avgRating]
      );
    });
  }
}

export interface StandingRow {
  rank: number;
  userId: string;
  displayName: string;
  majorsWon: number;
  majorsPlayed: number;
  points: number;
  avgRating: number | null;
}

export async function currentStandings(db: Db, now: number, userId: string | null): Promise<{ month: string; top: StandingRow[]; me: StandingRow | null }> {
  const { month } = seasonMonthOf(now);
  const rows = await db.query<{ user_id: string; display_name: string | null; email: string; majors_won: number; majors_played: number; points: number; avg_rating: string | null }>(
    `SELECT s.user_id, u.display_name, u.email, s.majors_won, s.majors_played, s.points, s.avg_rating
     FROM season_standings s JOIN seasons se ON se.id = s.season_id JOIN users u ON u.id = s.user_id
     WHERE se.month = $1
     ORDER BY s.points DESC, s.majors_won DESC, s.avg_rating DESC NULLS LAST, s.user_id`,
    [month]
  );
  const all: StandingRow[] = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    displayName: row.display_name ?? row.email.split('@')[0],
    majorsWon: row.majors_won,
    majorsPlayed: row.majors_played,
    points: row.points,
    avgRating: row.avg_rating === null ? null : Number(row.avg_rating)
  }));
  return { month, top: all.slice(0, 50), me: userId ? all.find((row) => row.userId === userId) ?? null : null };
}

export async function awardsOf(db: Db, userId: string): Promise<Array<{ kind: string; count: number; last: string }>> {
  const rows = await db.query<{ kind: string; count: string; last: Date }>('SELECT kind, count(*)::text AS count, max(earned_at) AS last FROM awards WHERE user_id = $1 GROUP BY kind ORDER BY max(earned_at) DESC', [userId]);
  return rows.map((row) => ({ kind: row.kind, count: Number(row.count), last: row.last.toISOString() }));
}

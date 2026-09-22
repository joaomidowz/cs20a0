import { AWARD_POINTS_CAP, COUNTED_RUNS_PER_DAY, ELIMINATED_POINTS, FULL_POINTS_LOBBY, PLACEMENT_POINTS, matchReward, seasonPoints } from '../../src/lib/game/online/collection-rules';
import type { Db, Tx } from '../db/client';
import { collectionPlayerById as playerById } from '../../src/lib/game/online/collection-pool';
import type { RunCompletedEvent } from '../room-manager';
import { detectAwards } from './awards';
import { advanceMissions } from './missions';
import { applyLedger } from './service';
import { dayKeyUtcMinus3, seasonMonthOf } from './time';
import { cardCoinValue } from '../../src/lib/game/online/card-value';

/** Humans needed for a run to score season points at all (two score a third, see `seasonPoints`). */
export const RANKED_MIN_LOBBY = 2;

/**
 * Accounts that play the whole game but never appear in any ranking (the owner's own account): they are skipped when
 * the season table ranks, the closed-season podium fills and end-of-season prizes are granted. Stored e-mails are
 * already normalized to lower case.
 */
const RANKING_EXEMPT_EMAILS = new Set(['jgcustodio2005@gmail.com']);
export const isRankingExempt = (email: string): boolean => RANKING_EXEMPT_EMAILS.has(email.toLowerCase());
const rankingExemptEmails = (): string[] => [...RANKING_EXEMPT_EMAILS];
/** Rules snapshot stored with each season, so a later change never rewrites how an old season was scored. */
const SEASON_RULES = { byPlacement: PLACEMENT_POINTS, eliminated: ELIMINATED_POINTS, fullLobby: FULL_POINTS_LOBBY, rankedMinLobby: RANKED_MIN_LOBBY, countedPerDay: COUNTED_RUNS_PER_DAY };

export async function ensureActiveSeason(tx: Tx, now: number): Promise<number> {
  const { month, startsAt, endsAt } = seasonMonthOf(now);
  const [row] = await tx.query<{ id: number }>(
    `INSERT INTO seasons (month, starts_at, ends_at) VALUES ($1, $2, $3)
     ON CONFLICT (month) DO UPDATE SET month = seasons.month RETURNING id`,
    [month, new Date(startsAt), new Date(endsAt)]
  );
  await tx.query('INSERT INTO season_rules (season_id, points_json) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.id, JSON.stringify(SEASON_RULES)]);
  return row.id;
}

/** Persists one finished run for every collection participant. Idempotent by (room, seed, user). */
export async function recordMajor(db: Db, event: RunCompletedEvent, now: number): Promise<void> {
  for (const entry of event.entries) {
    await db.tx(async (tx) => {
      const [existing] = await tx.query('SELECT id FROM majors WHERE room_code = $1 AND seed = $2 AND user_id = $3', [event.roomCode, event.seed, entry.userId]);
      if (existing) return;
      const seasonId = await ensureActiveSeason(tx, now);
      // Season points only in competitive runs (queue, or a code room where everybody brought a collection team).
      const ranked = event.competitive;
      const day = dayKeyUtcMinus3(now);
      // What this run is worth if it ends up among the day's best; which runs count is decided after the insert.
      const basePoints = ranked ? seasonPoints(entry.placement, event.lobbySize) : 0;
      const detected = detectAwards({ ...entry, awards: event.awards, lookup: (id) => playerById.get(id) });
      const rules = new Map((await tx.query<{ kind: string; coins: number; points: number; once_per_season: boolean }>('SELECT kind, coins, points, once_per_season FROM award_rules')).map((row) => [row.kind, row]));
      let awardPoints = 0;
      let awardCoins = 0;
      const granted: string[] = [];
      const grantedDetail: Array<{ kind: string; coins: number; points: number }> = [];
      for (const award of detected) {
        const rule = rules.get(award.kind);
        if (!rule) continue;
        if (!ranked && ['major_title', 'major_mvp', 'top10_player'].includes(award.kind)) continue;
        if (rule.once_per_season) {
          const [already] = await tx.query('SELECT id FROM awards WHERE user_id = $1 AND kind = $2 AND season_id = $3', [entry.userId, award.kind, seasonId]);
          if (already) continue;
        }
        await tx.query('INSERT INTO awards (user_id, kind, ref_id, season_id, detail) VALUES ($1, $2, $3, $4, $5)', [entry.userId, award.kind, `${event.roomCode}:${event.seed}`, seasonId, JSON.stringify(award.detail)]);
        awardPoints += ranked ? rule.points : 0;
        awardCoins += rule.coins;
        granted.push(award.kind);
        grantedDetail.push({ kind: award.kind, coins: rule.coins, points: ranked ? rule.points : 0 });
      }
      const potential = basePoints + Math.min(AWARD_POINTS_CAP, awardPoints);
      const ratings = entry.stats.map((line) => line.runRating).filter((value) => Number.isFinite(value));
      const avgRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
      await tx.query(
        // `played_at` comes from `now`, like the day key below: left to the database clock, the two could disagree
        // (and a run recorded with a past `now` would never be found among its own day's runs).
        `INSERT INTO majors (season_id, user_id, room_code, seed, lobby_size, ranked, counted, placement, champion, points, avg_rating, awards, base_points, reward_coins, award_coins, potential_points, played_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, 0, $9, $10, $11, $12, $13, $14, to_timestamp($15::double precision / 1000))`,
        [seasonId, entry.userId, event.roomCode, event.seed, event.lobbySize, ranked, entry.placement, entry.champion, avgRating, JSON.stringify(grantedDetail), basePoints, matchReward(entry.placement, ranked), awardCoins, potential, now]
      );
      // The day's best runs count, the rest score nothing: a new run can push an older, weaker one out.
      await tx.query(
        `WITH day_runs AS (
           SELECT id, row_number() OVER (ORDER BY potential_points DESC, played_at, id) AS place FROM majors
           WHERE user_id = $1 AND ranked AND NOT voided AND (played_at AT TIME ZONE 'UTC' - interval '3 hours')::date = $2::date
         )
         UPDATE majors m SET counted = d.place <= $3, points = CASE WHEN d.place <= $3 THEN m.potential_points ELSE 0 END
         FROM day_runs d WHERE d.id = m.id`,
        [entry.userId, day, COUNTED_RUNS_PER_DAY]
      );
      await advanceMissions(tx, { entry, event, seasonId, now, mvp: detected.some((award) => award.kind === 'major_mvp') });
      const reward = matchReward(entry.placement, ranked);
      await applyLedger(tx, entry.userId, reward, 'match_reward', `${event.roomCode}:${event.seed}`);
      if (awardCoins) await applyLedger(tx, entry.userId, awardCoins, 'award', `${event.roomCode}:${event.seed}`);
      // Only a ranked run is a Major played: alone against bots (or a friendly room) it is practice, so it neither
      // counts as played nor feeds the rating average — the same gate `majors_won` has always had.
      await tx.query(
        `INSERT INTO season_standings (season_id, user_id, majors_won, majors_played, points, avg_rating)
         VALUES ($1, $2, $3, $5, 0, $4)
         ON CONFLICT (season_id, user_id) DO UPDATE SET
           majors_won = season_standings.majors_won + EXCLUDED.majors_won,
           majors_played = season_standings.majors_played + EXCLUDED.majors_played,
           avg_rating = CASE WHEN EXCLUDED.avg_rating IS NULL THEN season_standings.avg_rating
             WHEN season_standings.avg_rating IS NULL THEN EXCLUDED.avg_rating
             ELSE (season_standings.avg_rating * season_standings.majors_played + EXCLUDED.avg_rating) / (season_standings.majors_played + 1) END`,
        [seasonId, entry.userId, entry.champion && ranked ? 1 : 0, ranked ? avgRating : null, ranked ? 1 : 0]
      );
      await tx.query(
        'UPDATE season_standings SET points = (SELECT coalesce(sum(points), 0) FROM majors WHERE season_id = $1 AND user_id = $2) WHERE season_id = $1 AND user_id = $2',
        [seasonId, entry.userId]
      );
    });
  }
}

export interface MajorResult {
  placement: string;
  lobbySize: number;
  ranked: boolean;
  counted: boolean;
  champion: boolean;
  basePoints: number;
  points: number;
  rewardCoins: number;
  awardCoins: number;
  awards: Array<{ kind: string; coins: number; points: number }>;
}

/** What this player earned in the latest run of a room: the end-of-run summary. */
export async function majorResult(db: Db, userId: string, roomCode: string): Promise<MajorResult | null> {
  const [row] = await db.query<{ placement: string; lobby_size: number; ranked: boolean; counted: boolean; champion: boolean; base_points: number; points: number; reward_coins: number; award_coins: number; awards: unknown }>(
    `SELECT placement, lobby_size, ranked, counted, champion, base_points, points, reward_coins, award_coins, awards FROM majors
     WHERE user_id = $1 AND room_code = $2 ORDER BY played_at DESC, id DESC LIMIT 1`,
    [userId, roomCode]
  );
  if (!row) return null;
  // Older rows stored only award kinds.
  const awards = Array.isArray(row.awards) ? row.awards.map((item) => (typeof item === 'string' ? { kind: item, coins: 0, points: 0 } : item as { kind: string; coins: number; points: number })) : [];
  return { placement: row.placement, lobbySize: row.lobby_size, ranked: row.ranked, counted: row.counted, champion: row.champion, basePoints: row.base_points, points: row.points, rewardCoins: row.reward_coins, awardCoins: row.award_coins, awards };
}

export interface PublicProfile {
  userId: string; teamName: string | null; displayName: string; memberSince: string; majorsPlayed: number; majorsWon: number; seasonPoints: number;
  awards: Array<{ kind: string; count: number }>;
  activeLineup: { cardIds: string[]; starPlayerId: string | null } | null;
  bestCards: string[];
}

/** Public profile: names, totals, awards, the active team and a small trade showcase. Never e-mail or wallet. */
export async function publicProfile(db: Db, userId: string, now: number): Promise<PublicProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [user] = await db.query<{ id: string; team_name: string | null; display_name: string | null; created_at: Date }>('SELECT id, team_name, display_name, created_at FROM users WHERE id = $1 AND verified_at IS NOT NULL', [userId]);
  if (!user) return null;
  const [totals] = await db.query<{ played: string; won: string }>(`SELECT count(*) FILTER (WHERE lobby_size >= 2 AND NOT voided)::text AS played, count(*) FILTER (WHERE champion AND lobby_size >= 2 AND NOT voided)::text AS won FROM majors WHERE user_id = $1`, [userId]);
  const { month } = seasonMonthOf(now);
  const [season] = await db.query<{ points: number }>('SELECT s.points FROM season_standings s JOIN seasons se ON se.id = s.season_id WHERE s.user_id = $1 AND se.month = $2', [userId, month]);
  const [lineup] = await db.query<{ player_ids: string[]; coach_id: string | null; star_player_id: string | null }>(
    `SELECT ls.player_ids, ls.coach_id, ls.star_player_id FROM users u
     LEFT JOIN lineup_slots ls ON ls.user_id = u.id AND ls.slot_index = u.active_lineup_slot WHERE u.id = $1`, [userId]
  );
  const activeIds = lineup?.player_ids ? [...lineup.player_ids, ...(lineup.coach_id ? [lineup.coach_id] : [])] : [];
  const activeSet = new Set(activeIds);
  const cards = (await db.query<{ player_id: string }>('SELECT player_id FROM collection WHERE user_id = $1', [userId])).map((row) => row.player_id);
  const bestCards = cards.filter((id) => !activeSet.has(id)).sort((a, b) => cardCoinValue(b) - cardCoinValue(a)).slice(0, 12);
  return {
    userId: user.id, teamName: user.team_name, displayName: user.display_name ?? 'Player', memberSince: user.created_at.toISOString(),
    majorsPlayed: Number(totals.played), majorsWon: Number(totals.won), seasonPoints: season?.points ?? 0,
    awards: (await awardsOf(db, userId)).map(({ kind, count }) => ({ kind, count })),
    activeLineup: activeIds.length ? { cardIds: activeIds, starPlayerId: lineup.star_player_id } : null,
    bestCards
  };
}

export interface RoomReward { userId: string; teamName: string | null; displayName: string; placement: string; points: number; coins: number }

/** What every collection player of a room earned in its latest run (names as shown in the season table, never e-mails). */
export async function roomRewards(db: Db, roomCode: string): Promise<RoomReward[]> {
  const rows = await db.query<{ user_id: string; team_name: string | null; display_name: string | null; placement: string; points: number; coins: number }>(
    `SELECT m.user_id, u.team_name, u.display_name, m.placement, m.points, (m.reward_coins + m.award_coins) AS coins
     FROM majors m JOIN users u ON u.id = m.user_id
     WHERE m.room_code = $1 AND m.seed = (SELECT seed FROM majors WHERE room_code = $1 ORDER BY played_at DESC, id DESC LIMIT 1)
     ORDER BY m.points DESC, coins DESC`,
    [roomCode]
  );
  return rows.map((row) => ({ userId: row.user_id, teamName: row.team_name, displayName: row.display_name ?? 'Player', placement: row.placement, points: row.points, coins: row.coins }));
}

export interface StandingRow {
  rank: number;
  userId: string;
  displayName: string;
  teamName: string | null;
  majorsWon: number;
  majorsPlayed: number;
  points: number;
  avgRating: number | null;
}

export async function currentStandings(db: Db, now: number, userId: string | null): Promise<{ month: string; top: StandingRow[]; me: StandingRow | null }> {
  const { month } = seasonMonthOf(now);
  const rows = await db.query<{ user_id: string; display_name: string | null; team_name: string | null; email: string; majors_won: number; majors_played: number; points: number; avg_rating: string | null }>(
    `SELECT s.user_id, u.display_name, u.team_name, u.email, s.majors_won, s.majors_played, s.points, s.avg_rating
     FROM season_standings s JOIN seasons se ON se.id = s.season_id JOIN users u ON u.id = s.user_id
     WHERE se.month = $1
     ORDER BY s.points DESC, s.majors_won DESC, s.avg_rating DESC NULLS LAST, s.user_id`,
    [month]
  );
  // Exempt accounts never occupy a rank: the counter only advances for everyone else, and an exempt viewer still
  // resolves `me` with the rank they would hold (one more than the non-exempt players ahead of them).
  const ranked: StandingRow[] = [];
  const exempt = new Map<string, StandingRow>();
  let rank = 0;
  for (const row of rows) {
    const base = {
      userId: row.user_id,
      displayName: row.display_name ?? row.email.split('@')[0],
      teamName: row.team_name,
      majorsWon: row.majors_won,
      majorsPlayed: row.majors_played,
      points: row.points,
      avgRating: row.avg_rating === null ? null : Number(row.avg_rating)
    };
    if (isRankingExempt(row.email)) {
      exempt.set(row.user_id, { ...base, rank: rank + 1 });
      continue;
    }
    rank += 1;
    ranked.push({ ...base, rank });
  }
  return { month, top: ranked.slice(0, 50), me: userId ? ranked.find((row) => row.userId === userId) ?? exempt.get(userId) ?? null : null };
}

export async function awardsOf(db: Db, userId: string): Promise<Array<{ kind: string; count: number; last: string }>> {
  const rows = await db.query<{ kind: string; count: string; last: Date }>('SELECT kind, count(*)::text AS count, max(earned_at) AS last FROM awards WHERE user_id = $1 AND NOT voided GROUP BY kind ORDER BY max(earned_at) DESC', [userId]);
  return rows.map((row) => ({ kind: row.kind, count: Number(row.count), last: row.last.toISOString() }));
}

/** Tier of a final season rank; only the best tier is granted (top 1 does not also get top 3). */
const seasonAwardFor = (rank: number): 'season_top1' | 'season_top3' | 'season_top10' | null =>
  rank === 1 ? 'season_top1' : rank <= 3 ? 'season_top3' : rank <= 10 ? 'season_top10' : null;

/**
 * Closes every season whose month is over: final ranks become awards (champion, top 3, top 10) with their coin prize.
 * Runs at boot and hourly; closing is a single UPDATE … WHERE status = 'active', so two runs never pay twice.
 */
export async function closeFinishedSeasons(db: Db, now: number): Promise<Array<{ seasonId: number; month: string; awarded: number }>> {
  const due = await db.query<{ id: number; month: Date }>(`SELECT id, month FROM seasons WHERE status = 'active' AND ends_at <= $1 ORDER BY month`, [new Date(now)]);
  const closed: Array<{ seasonId: number; month: string; awarded: number }> = [];
  for (const season of due) {
    const awarded = await db.tx(async (tx) => {
      const [locked] = await tx.query<{ id: number }>(`UPDATE seasons SET status = 'closed' WHERE id = $1 AND status = 'active' RETURNING id`, [season.id]);
      if (!locked) return 0;
      const rows = await tx.query<{ user_id: string; points: number; majors_won: number }>(
        `SELECT s.user_id, s.points, s.majors_won FROM season_standings s JOIN users u ON u.id = s.user_id
         WHERE s.season_id = $1 AND s.points > 0 AND u.email <> ANY($2::text[])
         ORDER BY s.points DESC, s.majors_won DESC, s.avg_rating DESC NULLS LAST, s.user_id LIMIT 10`,
        [season.id, rankingExemptEmails()]
      );
      const rules = new Map((await tx.query<{ kind: string; coins: number }>(`SELECT kind, coins FROM award_rules WHERE kind LIKE 'season_top%'`)).map((row) => [row.kind, row.coins]));
      let count = 0;
      for (const [index, row] of rows.entries()) {
        const kind = seasonAwardFor(index + 1);
        if (!kind) continue;
        await tx.query('INSERT INTO awards (user_id, kind, ref_id, season_id, detail) VALUES ($1, $2, $3, $4, $5)', [row.user_id, kind, `season:${season.id}`, season.id, JSON.stringify({ rank: index + 1, points: row.points, majorsWon: row.majors_won })]);
        const coins = rules.get(kind) ?? 0;
        if (coins) await applyLedger(tx, row.user_id, coins, 'season_prize', `season:${season.id}`);
        count += 1;
      }
      return count;
    });
    closed.push({ seasonId: season.id, month: season.month.toISOString().slice(0, 10), awarded });
  }
  return closed;
}

/** Podium of the most recent closed season, for the "reigning champion" line. */
export async function lastSeasonPodium(db: Db): Promise<{ month: string; podium: Array<{ rank: number; displayName: string; teamName: string | null; points: number }> } | null> {
  const [season] = await db.query<{ id: number; month: Date }>(`SELECT id, month FROM seasons WHERE status = 'closed' ORDER BY month DESC LIMIT 1`);
  if (!season) return null;
  const rows = await db.query<{ display_name: string | null; team_name: string | null; email: string; points: number }>(
    `SELECT u.display_name, u.team_name, u.email, s.points FROM season_standings s JOIN users u ON u.id = s.user_id
     WHERE s.season_id = $1 AND s.points > 0 AND u.email <> ANY($2::text[]) ORDER BY s.points DESC, s.majors_won DESC, s.avg_rating DESC NULLS LAST, s.user_id LIMIT 3`,
    [season.id, rankingExemptEmails()]
  );
  return { month: season.month.toISOString().slice(0, 10), podium: rows.map((row, index) => ({ rank: index + 1, displayName: row.display_name ?? row.email.split('@')[0], teamName: row.team_name, points: row.points })) };
}

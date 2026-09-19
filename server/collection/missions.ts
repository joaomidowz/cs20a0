import { DAILY_BASIC_PACKS } from '../../src/lib/game/online/collection-rules';
import { MISSIONS, missionById, missionIncrements, missionPeriodEnd, missionPeriodKey, type MissionScope } from '../../src/lib/game/online/missions-rules';
import type { Db, Tx } from '../db/client';
import type { RunCompletedEntry, RunCompletedEvent } from '../room-manager';
import { ensureActiveSeason } from './seasons';
import { CollectionError, applyLedger } from './service';
import { dayKeyUtcMinus3, seasonMonthOf } from './time';

/**
 * Soma um run às missões do jogador. Roda dentro da transação de `recordMajor`, depois da checagem de run duplicado,
 * então cada (sala, seed, usuário) conta uma vez só.
 */
export async function advanceMissions(tx: Tx, input: { entry: RunCompletedEntry; event: RunCompletedEvent; seasonId: number; now: number; mvp: boolean }): Promise<void> {
  const { entry, event, seasonId, now } = input;
  let soloStreak = 0;
  if (!event.competitive) {
    const [streak] = await tx.query<{ current: number }>(
      `INSERT INTO solo_streaks (user_id, current, best) VALUES ($1, $2, $2)
       ON CONFLICT (user_id) DO UPDATE SET current = CASE WHEN $3 THEN solo_streaks.current + 1 ELSE 0 END,
         best = GREATEST(solo_streaks.best, CASE WHEN $3 THEN solo_streaks.current + 1 ELSE 0 END)
       RETURNING current`,
      [entry.userId, entry.champion ? 1 : 0, entry.champion]
    );
    soloStreak = streak.current;
  }
  const increments = missionIncrements({ competitive: event.competitive, champion: entry.champion, mvp: input.mvp, field: event.field ?? 'random', seriesLost: entry.seriesLost ?? 0, soloStreak });
  for (const { mission, mode, value } of increments) {
    const period = missionPeriodKey(mission.scope, now, seasonId);
    const capped = Math.min(mission.target, value);
    await tx.query(
      `INSERT INTO mission_progress (user_id, mission_id, period_key, progress) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET progress = LEAST($5::int, ${mode === 'add' ? 'mission_progress.progress + EXCLUDED.progress' : 'GREATEST(mission_progress.progress, EXCLUDED.progress)'})`,
      [entry.userId, mission.id, period, capped, mission.target]
    );
  }
}

export interface MissionView {
  id: string;
  scope: MissionScope;
  target: number;
  progress: number;
  coins: number;
  packs: number;
  claimed: boolean;
  resetsAt: string;
}

export async function listMissions(db: Db, userId: string, now: number): Promise<{ missions: MissionView[]; soloStreak: { current: number; best: number } }> {
  return db.tx(async (tx) => {
    const seasonId = await ensureActiveSeason(tx, now);
    const seasonEnd = seasonMonthOf(now).endsAt;
    const keys = [...new Set(MISSIONS.map((mission) => missionPeriodKey(mission.scope, now, seasonId)))];
    const rows = await tx.query<{ mission_id: string; period_key: string; progress: number; claimed_at: Date | null }>(
      'SELECT mission_id, period_key, progress, claimed_at FROM mission_progress WHERE user_id = $1 AND period_key = ANY($2::text[])',
      [userId, keys]
    );
    const byKey = new Map(rows.map((row) => [`${row.mission_id}|${row.period_key}`, row]));
    const [streak] = await tx.query<{ current: number; best: number }>('SELECT current, best FROM solo_streaks WHERE user_id = $1', [userId]);
    return {
      missions: MISSIONS.map((mission) => {
        const row = byKey.get(`${mission.id}|${missionPeriodKey(mission.scope, now, seasonId)}`);
        return { id: mission.id, scope: mission.scope, target: mission.target, progress: row?.progress ?? 0, coins: mission.coins, packs: mission.packs, claimed: Boolean(row?.claimed_at), resetsAt: new Date(missionPeriodEnd(mission.scope, now, seasonEnd)).toISOString() };
      }),
      soloStreak: { current: streak?.current ?? 0, best: streak?.best ?? 0 }
    };
  });
}

/** Resgata uma missão completa do período atual: coins pelo ledger e, nas maiores, sobres grátis no dia. */
export async function claimMission(db: Db, userId: string, missionId: string, now: number): Promise<{ coins: number; packs: number; wallet: number }> {
  const mission = missionById.get(missionId);
  if (!mission) throw new CollectionError(404, 'MISSION_NOT_FOUND', 'Missão não encontrada');
  return db.tx(async (tx) => {
    const seasonId = await ensureActiveSeason(tx, now);
    const period = missionPeriodKey(mission.scope, now, seasonId);
    const [row] = await tx.query<{ progress: number; claimed_at: Date | null }>(
      'SELECT progress, claimed_at FROM mission_progress WHERE user_id = $1 AND mission_id = $2 AND period_key = $3 FOR UPDATE',
      [userId, mission.id, period]
    );
    if (!row || row.progress < mission.target) throw new CollectionError(409, 'MISSION_INCOMPLETE', 'Missão ainda não concluída');
    if (row.claimed_at) throw new CollectionError(409, 'MISSION_CLAIMED', 'Recompensa já resgatada');
    await tx.query('UPDATE mission_progress SET claimed_at = $4 WHERE user_id = $1 AND mission_id = $2 AND period_key = $3', [userId, mission.id, period, new Date(now)]);
    const wallet = await applyLedger(tx, userId, mission.coins, 'mission_reward', `mission:${mission.id}:${period}`);
    if (mission.packs) {
      await tx.query(
        `INSERT INTO pack_grants (user_id, day, granted, opened) VALUES ($1, $2, $3, 0)
         ON CONFLICT (user_id, day) DO UPDATE SET granted = pack_grants.granted + $4`,
        [userId, dayKeyUtcMinus3(now), DAILY_BASIC_PACKS + mission.packs, mission.packs]
      );
    }
    return { coins: mission.coins, packs: mission.packs, wallet };
  });
}

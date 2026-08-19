import type { PlayerRunStats } from '../types';
import type { ReplayEventV1, ReplayPlanV1 } from './types';

export const REPLAY_STATS_RULES_VERSION = 'replay-stats-v1' as const;
const ASSIST_WINDOW_MS = 5_000;
const MINIMUM_ASSIST_DAMAGE = 20;
const TRADE_WINDOW_MS = 5_000;

export interface ReplayPlayerStats {
  playerId: string;
  kills: number;
  deaths: number;
  damage: number;
  adr: number;
  assists: number;
  flashAssists: number;
  trades: number;
  roundsPlayed: number;
}

export interface ReplayStatsReport {
  planId: string;
  mapId: ReplayPlanV1['mapId'];
  rulesVersion: typeof REPLAY_STATS_RULES_VERSION;
  players: ReplayPlayerStats[];
}

export interface ReplayReconciliation {
  playerId: string;
  metric: 'kills' | 'deaths' | 'adr';
  legacyValue: number;
  eventValue: number;
  difference: number;
  rulesVersion: typeof REPLAY_STATS_RULES_VERSION;
  knownReason?: 'offline-replay-model';
}

interface DamageContribution {
  damage: number;
  lastAtMs: number;
}

interface RecentKill {
  atMs: number;
  killerPlayerId: string;
  victimPlayerId: string;
}

const numericDifference = (eventValue: number, legacyValue: number) =>
  Number((eventValue - legacyValue).toFixed(2));

export function aggregateReplayStats(plan: ReplayPlanV1): ReplayStatsReport {
  const stats = new Map(plan.players.map((player) => [player.id, {
    playerId: player.id,
    kills: 0,
    deaths: 0,
    damage: 0,
    adr: 0,
    assists: 0,
    flashAssists: 0,
    trades: 0,
    roundsPlayed: plan.rounds.length
  } satisfies ReplayPlayerStats]));
  const organizationByPlayer = new Map(plan.players.map((player) => [player.id, player.organizationId]));

  for (const round of plan.rounds) {
    const hp = new Map(plan.players.map((player) => [player.id, 100]));
    const killed = new Set<string>();
    const contributions = new Map<string, Map<string, DamageContribution>>();
    const recentKills: RecentKill[] = [];
    const events = [...round.events].sort((left, right) =>
      left.atMs - right.atMs || left.sequence - right.sequence || left.id.localeCompare(right.id));

    for (const event of events) {
      if (event.type === 'damage') {
        if (killed.has(event.targetPlayerId)) continue;
        const remainingHp = hp.get(event.targetPlayerId) ?? 100;
        const actualDamage = Math.max(0, Math.min(remainingHp, event.damage));
        hp.set(event.targetPlayerId, remainingHp - actualDamage);
        const sourceStats = stats.get(event.sourcePlayerId);
        if (sourceStats) sourceStats.damage += actualDamage;
        if (actualDamage > 0 && event.sourcePlayerId !== event.targetPlayerId) {
          const victimContributions = contributions.get(event.targetPlayerId) ?? new Map<string, DamageContribution>();
          const previous = victimContributions.get(event.sourcePlayerId) ?? { damage: 0, lastAtMs: event.atMs };
          victimContributions.set(event.sourcePlayerId, {
            damage: previous.damage + actualDamage,
            lastAtMs: event.atMs
          });
          contributions.set(event.targetPlayerId, victimContributions);
        }
        continue;
      }

      if (event.type !== 'kill' || killed.has(event.victimPlayerId)) continue;
      killed.add(event.victimPlayerId);
      hp.set(event.victimPlayerId, 0);
      const killerStats = stats.get(event.killerPlayerId);
      const victimStats = stats.get(event.victimPlayerId);
      if (killerStats) killerStats.kills += 1;
      if (victimStats) victimStats.deaths += 1;

      let assistantPlayerId = event.assistantPlayerId;
      if (!assistantPlayerId) {
        assistantPlayerId = [...(contributions.get(event.victimPlayerId)?.entries() ?? [])]
          .filter(([playerId, contribution]) =>
            playerId !== event.killerPlayerId &&
            contribution.damage >= MINIMUM_ASSIST_DAMAGE &&
            event.atMs - contribution.lastAtMs <= ASSIST_WINDOW_MS)
          .sort((left, right) => right[1].damage - left[1].damage || left[0].localeCompare(right[0]))[0]?.[0];
      }
      if (assistantPlayerId && assistantPlayerId !== event.killerPlayerId && assistantPlayerId !== event.victimPlayerId) {
        const assistantStats = stats.get(assistantPlayerId);
        if (assistantStats) assistantStats.assists += 1;
      }
      if (event.flashAssistantPlayerId && event.flashAssistantPlayerId !== event.killerPlayerId) {
        const flashStats = stats.get(event.flashAssistantPlayerId);
        if (flashStats) flashStats.flashAssists += 1;
      }

      const killerOrganizationId = organizationByPlayer.get(event.killerPlayerId);
      const tradedKill = [...recentKills].reverse().find((previous) =>
        previous.killerPlayerId === event.victimPlayerId &&
        killerOrganizationId === organizationByPlayer.get(previous.victimPlayerId) &&
        event.atMs - previous.atMs <= TRADE_WINDOW_MS);
      if (tradedKill && killerStats) killerStats.trades += 1;
      recentKills.push({
        atMs: event.atMs,
        killerPlayerId: event.killerPlayerId,
        victimPlayerId: event.victimPlayerId
      });
    }
  }

  const players = plan.players.map((player) => {
    const playerStats = stats.get(player.id);
    if (!playerStats) throw new Error(`Missing replay stats for ${player.id}`);
    return {
      ...playerStats,
      adr: Number((playerStats.damage / Math.max(1, playerStats.roundsPlayed)).toFixed(2))
    };
  });

  return {
    planId: plan.id,
    mapId: plan.mapId,
    rulesVersion: REPLAY_STATS_RULES_VERSION,
    players
  };
}

export function reconcileReplayStats(
  legacy: PlayerRunStats[],
  derived: ReplayStatsReport
): ReplayReconciliation[] {
  const derivedByPlayer = new Map(derived.players.map((player) => [player.playerId, player]));
  const entries: ReplayReconciliation[] = [];
  for (const legacyPlayer of legacy) {
    const eventPlayer = derivedByPlayer.get(legacyPlayer.playerId);
    const values: Array<{
      metric: ReplayReconciliation['metric'];
      legacyValue: number;
      eventValue: number;
    }> = [
      { metric: 'kills', legacyValue: legacyPlayer.kills, eventValue: eventPlayer?.kills ?? 0 },
      { metric: 'deaths', legacyValue: legacyPlayer.deaths, eventValue: eventPlayer?.deaths ?? 0 },
      { metric: 'adr', legacyValue: legacyPlayer.adr, eventValue: eventPlayer?.adr ?? 0 }
    ];
    for (const value of values) {
      const difference = numericDifference(value.eventValue, value.legacyValue);
      entries.push({
        playerId: legacyPlayer.playerId,
        metric: value.metric,
        legacyValue: value.legacyValue,
        eventValue: value.eventValue,
        difference,
        rulesVersion: REPLAY_STATS_RULES_VERSION,
        ...(difference !== 0 ? { knownReason: 'offline-replay-model' as const } : {})
      });
    }
  }
  return entries;
}

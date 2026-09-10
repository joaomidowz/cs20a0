import { defaultHumanEcoCall, defaultHumanSide, TIMEOUT_LOSS_STREAK } from './bot-policies';
import type { PublicPendingDecision } from './online/contracts';
import type { StrategicAutomationPreferences } from './preferences';
import { timeoutTiming } from './rounds';
import type { MapId, MapSide, OrgStyle, RoundDetail, TeamSide, TimeoutTiming } from './types';

/**
 * The online room is authoritative, so the gear cannot resolve a decision locally: it answers for the player right
 * away with the same deterministic call the server would apply when the timer runs out.
 */
export const answersDecision = (decision: PublicPendingDecision, preferences: StrategicAutomationPreferences) =>
  decision.kind === 'eco-call' ? preferences.autoEconomy : preferences.autoMapPicksAndVetos;

/** One key per decision, so a repeated snapshot never sends the same answer twice. */
export const decisionKey = (seriesId: string, decision: PublicPendingDecision) =>
  `${seriesId}:${decision.kind}:${decision.kind === 'veto' ? decision.step : decision.mapIndex}:${decision.kind === 'eco-call' ? decision.roundNumber : 0}`;

/** An answer already sent: the key it answered and when, so a rejected command is retried instead of lost. */
export interface AutomationAttempt {
  key: string;
  at: number;
}

/**
 * The room can refuse an answer that arrives before the round is live, so the same decision is answered again
 * after a short wait instead of waiting for the server deadline.
 */
export function shouldAnswerAgain(previous: AutomationAttempt | null, key: string, now: number, retryAfterMs = 900): boolean {
  if (!previous || previous.key !== key) return true;
  return now - previous.at >= retryAfterMs;
}

/** Bans the least familiar map and picks the most familiar one, the reading the veto board already shows. */
export function autoVetoMap(available: MapId[], familiarity: Partial<Record<MapId, number>>, action: 'ban' | 'pick'): MapId | null {
  if (!available.length) return null;
  const ordered = [...available].sort((left, right) => (familiarity[left] ?? 0) - (familiarity[right] ?? 0) || left.localeCompare(right));
  return (action === 'ban' ? ordered[0] : ordered.at(-1)) ?? null;
}

export const autoSidePick = (style: OrgStyle | undefined, mapId: MapId | null): MapSide => defaultHumanSide(style, mapId ?? undefined);

export const autoEcoCall = (style: OrgStyle | undefined, money: number): 'force' | 'eco' => defaultHumanEcoCall(style, money);

/** Regulation is MR12 and overtime runs in blocks of three, the halves a tactical timeout belongs to. */
export const halfOfRound = (roundNumber: number) =>
  roundNumber <= 12 ? 0 : roundNumber <= 24 ? 1 : 2 + Math.floor((roundNumber - 25) / 3);

/** Rounds lost in a row in the current half, counted from the rounds the client already received. */
export function currentLossStreak(rounds: RoundDetail[], side: TeamSide): number {
  if (!rounds.length) return 0;
  const ordered = [...rounds].sort((left, right) => left.number - right.number);
  const half = halfOfRound(ordered[ordered.length - 1].number);
  let streak = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const round = ordered[index];
    if (halfOfRound(round.number) !== half || round.winner === side) break;
    streak += 1;
  }
  return streak;
}

/** How a timeout called now would be timed, from the rounds the client already received. */
export const timeoutTimingFor = (rounds: RoundDetail[], side: TeamSide): TimeoutTiming => timeoutTiming(currentLossStreak(rounds, side));

/** With the pause on automatic the player's team calls it like a bot: four straight lost rounds, once per half. */
export function shouldCallTimeout(rounds: RoundDetail[], side: TeamSide, timeoutsLeft: number): boolean {
  return timeoutsLeft > 0 && currentLossStreak(rounds, side) >= TIMEOUT_LOSS_STREAK;
}

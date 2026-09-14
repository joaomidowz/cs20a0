// src/lib/game/dynasty/value.ts
import type { Coach, Player } from '../types';

export const VALUE_STEP = 5_000;
const PLAYER_VALUE_FLOOR = 30_000;
const PLAYER_VALUE_CAP = 2_500_000;
const COACH_VALUE_FLOOR = 20_000;

const RARITY_MULTIPLIER: Readonly<Record<string, number>> = {
  common: 1,
  rare: 1.05,
  elite: 1.12,
  legend: 1.2,
  superstar: 1.3,
  goat: 1.45
};

export const roundToStep = (value: number) => Math.round(value / VALUE_STEP) * VALUE_STEP;

/** Market value in whole dollars, from the (resolved) player: overall curve × rarity × position × Major titles. */
export function playerMarketValue(player: Player): number {
  const overall = Math.min(99, Math.max(60, player.overall ?? 70));
  const base = 50_000 * 1.09 ** (overall - 60);
  const rarity = RARITY_MULTIPLIER[(player.rarity ?? 'common').toLowerCase()] ?? 1;
  const role = (player.role ?? '').toLowerCase();
  const position = role.includes('awp') ? 1.15 : role.includes('igl') ? 1.1 : 1;
  const titles = 1 + 0.08 * Math.min(2, (player.badges ?? []).filter((badge) => badge === 'major-champion').length);
  return Math.min(PLAYER_VALUE_CAP, Math.max(PLAYER_VALUE_FLOOR, roundToStep(base * rarity * position * titles)));
}

export const coachMarketValue = (coach: Pick<Coach, 'overall'>) =>
  Math.max(COACH_VALUE_FLOOR, roundToStep(20_000 * 1.08 ** (coach.overall - 60)));

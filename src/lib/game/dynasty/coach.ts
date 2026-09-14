// src/lib/game/dynasty/coach.ts
import type { Coach, CombatTeam, HistoricalTeam, Player } from '../types';

export const COACH_REROLLS = 1;

export const isDraftableCoach = (coach: Coach) => coach.confidence !== 'placeholder';

const orgOf = (name: string | null | undefined) => (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** +1.5% power with two or more players from the coach's own team-year; +0.75% with two or more from the same organization in another year. */
export function coachAffinity(coach: Coach, players: Player[], teams: HistoricalTeam[]): number {
  if (players.filter((player) => player.teamId === coach.teamId).length >= 2) return 0.015;
  const nameOf = new Map(teams.map((team) => [team.id, team.name]));
  const org = orgOf(nameOf.get(coach.teamId));
  if (!org) return 0;
  return players.filter((player) => player.teamId && orgOf(nameOf.get(player.teamId)) === org).length >= 2 ? 0.0075 : 0;
}

/** The coach's edge on a combat team. A coach with 70 in every attribute is neutral. */
export function applyCoachToTeam(team: CombatTeam, coach: Coach, affinity = 0): CombatTeam {
  return {
    ...team,
    power: team.power * (1 + (coach.tactics - 70) / 2000 + affinity),
    mental: Math.max(1, Math.min(99, team.mental + (coach.discipline - 70) * 0.25)),
    coachId: coach.id,
    coachSidePreference: -(coach.aggression - 70) / 1000,
    timeoutFactor: 1 + (coach.discipline - 70) / 200
  };
}

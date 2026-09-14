import { calculateDynastyBaseTeamPower } from '../simulation';
import type { Coach, CombatTeam, DynastyMajorPlan, HistoricalTeam, Player, SelectedPlayer, SeriesPlan } from '../types';
import { applyCoachToTeam, coachAffinity } from './coach';
import { offRolePlayerIds, positionMultiplier } from './position';

export const createDynastyMajorPlan = (majorNumber: number, style: SeriesPlan['style']): DynastyMajorPlan => ({
  majorNumber,
  rules: 2,
  training: null,
  basePlan: { style, tactic: 'standard', study: false },
  plans: {},
  confirmed: true
});

export const studyBudget = (coach: Coach | null): number => coach && coach.tactics >= 85 ? 4 : 3;

export const studiesLeft = (major: DynastyMajorPlan, coach: Coach | null): number =>
  Math.max(0, studyBudget(coach) - Object.values(major.plans).filter((plan) => plan.study).length);

export function confirmSeriesPlan(major: DynastyMajorPlan, seriesId: string, plan: SeriesPlan, coach: Coach | null): DynastyMajorPlan {
  if (major.plans[seriesId]) throw new Error('Plano da série já confirmado');
  if (plan.study && studiesLeft(major, coach) <= 0) throw new Error('Estudos esgotados');
  return { ...major, plans: { ...major.plans, [seriesId]: plan } };
}

const tacticStrength = (attribute: number) => Math.max(0, Math.min(1, (attribute - 70) / 30));

function applyDynastyStyle(team: CombatTeam, plan: SeriesPlan): CombatTeam {
  if (plan.style === 'tactical') return { ...team, style: plan.style, power: team.power * 1.02, studyPercentage: 100 };
  if (plan.style === 'balanced') return { ...team, style: plan.style, power: team.power * 1.02, consistency: Math.min(99, (team.consistency ?? 65) + 8) };
  return { ...team, style: plan.style, power: team.power * 1.015, aggressionPercentage: Math.min(100, (team.aggressionPercentage ?? 0) + 10) };
}

function applyCoachTactic(team: CombatTeam, coach: Coach | null, plan: SeriesPlan): CombatTeam {
  if (!coach || plan.tactic === 'standard') return team;
  if (plan.tactic === 'pressure') {
    const k = tacticStrength(coach.aggression);
    return { ...team, power: team.power * (1 + 0.008 * k), coachSidePreference: (team.coachSidePreference ?? 0) - 0.01, mental: Math.max(1, team.mental - 1) };
  }
  if (plan.tactic === 'control') {
    const k = tacticStrength(coach.discipline);
    return { ...team, timeoutFactor: (team.timeoutFactor ?? 1) * (1 + 0.15 * k), mental: Math.min(99, team.mental + 3 * k) };
  }
  const k = tacticStrength(coach.tactics);
  return { ...team, power: team.power * (1 + 0.01 * k), consistency: Math.max(1, (team.consistency ?? 65) - 4) };
}

export interface BuildDynastyUserTeamInput {
  players: Player[];
  lineup: SelectedPlayer[];
  seed: string;
  coach: Coach | null;
  teams: HistoricalTeam[];
  plan: SeriesPlan;
}

/** Single source of truth for the number shown in the HUD and the team played by the campaign. */
export function buildDynastyUserTeam({ players, lineup, seed, coach, teams, plan }: BuildDynastyUserTeamInput): CombatTeam {
  let team = calculateDynastyBaseTeamPower(players, lineup, seed);
  team = applyDynastyStyle(team, plan);
  if (coach) team = applyCoachToTeam(team, coach, coachAffinity(coach, players, teams));
  team = applyCoachTactic(team, coach, plan);
  if (plan.study) team = { ...team, power: team.power * 1.015 };
  // Playing out of position never blocks the lineup; it costs strength instead.
  const offRole = offRolePlayerIds(players, lineup).length;
  if (offRole) team = { ...team, power: team.power * positionMultiplier(offRole) };
  return team;
}

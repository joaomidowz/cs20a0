import { getEligibleSlotRoles, getRoleLabel, validatePlayerPick } from '../roleRules';
import { collectionCoachById, collectionTeamById } from './collection-pool';
import { playerCountryOf } from './collection-countries';
import { themeLines, type ThemeLine, type ThemeMember } from './collection-theme';
import { addCourtPoints } from '../courtPower';
import { calculateDynastyBaseTeamPower } from '../simulation';
import type { CombatTeam, LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '../types';

/**
 * Lineup rules of the collection mode. Roles may repeat; instead of the off-position penalty of Dinastia there is a
 * synergy (up or down) by composition, and one star player the team is built around. Pure and shared: the server
 * applies it to the tournament team, the client previews the same numbers.
 */
export const STAR_MIN_OVERALL = 85;

/** The hybrid slot: one card holds the AWP and calls the game. It fills both roles, at HYBRID_BONUS_RATIO of their bonuses. */
export const AWPER_IGL = 'awper-igl';
export type CollectionSlotRole = LineupSlotRole | typeof AWPER_IGL;
export const HYBRID_BONUS_RATIO = 0.5;

/**
 * Star bonus (% of power, on top of the flat `star` line) by the role the star plays and the plan, for a 90-overall star:
 * every role gains under every plan, and each one has the plan that suits it (entry → aggressive, rifler → balanced,
 * AWPer and lurker → tactical). `starScale` stretches it by the star's overall; the AWPer-IGL gets the AWPer row at
 * HYBRID_BONUS_RATIO.
 */
export const STAR_ROLE_BONUS: Readonly<Record<'awper' | 'entry' | 'rifler' | 'lurker', Readonly<Record<OrgStyle, number>>>> = {
  awper: { aggressive: 2, balanced: 1.5, tactical: 3 },
  entry: { aggressive: 3, balanced: 1.5, tactical: 1 },
  rifler: { aggressive: 1.5, balanced: 2.5, tactical: 1.5 },
  lurker: { aggressive: 1, balanced: 1.5, tactical: 2 }
};
/** Half of the role bonus up to 85 overall, all of it at 90, one and a half from 95 on. */
export const starScale = (overall: number): number => Math.max(0.5, Math.min(1.5, (overall - 80) / 10));

/**
 * Plan bonuses (% of power). The collection builds its team on the plan-neutral motor (`collectionBaseTeam`), so the
 * whole effect of a plan is here, in the open: the engine's hidden x1.10 for tactical and x1.00 for aggressive used to
 * vanish under the motor cap for strong lineups, and whatever compensated it became a free edge.
 *
 * Every plan has the same ceiling and what it yields comes from the cards: aggressive from the entry, tactical from
 * the caller and the coach, balanced from a lineup with no weak link. The best plan is the one your lineup can run.
 */
export const PLAN_BONUS_MIN = 12;
export const PLAN_BONUS_MAX = 18;
/** Balanced asks for nothing, so it starts a little higher and tops out a little lower than the specialist plans. */
export const BALANCED_PLAN_MIN = 13;
export const BALANCED_PLAN_MAX = 17;
/** A plan the lineup cannot run (aggressive without an entry, tactical without a caller and a support). */
export const PLAN_OFF_BONUS = 8;
/** Coach tactics that start and finish counting for the tactical plan. */
const COACH_TACTICS_RANGE: readonly [number, number] = [70, 98];
const quarter = (value: number) => Math.round(value * 4) / 4;
const ramp = (value: number, from: number, to: number) => Math.max(0, Math.min(1, (value - from) / (to - from)));

/** How well the lineup runs its plan, 0 to 1; what the builder shows next to the plan. */
export function planQuality(input: CollectionLineupInput): number {
  const style = input.style ?? 'balanced';
  const inSlot = (role: LineupSlotRole) => input.players.filter((_, index) => slotRolesOf(input.roles[index]).includes(role));
  if (style === 'aggressive') return ramp(Math.max(0, ...inSlot('entry').map((player) => player.entry ?? 0)), 75, 95);
  if (style === 'tactical') {
    const caller = ramp(Math.max(0, ...inSlot('igl').map((player) => player.igl ?? 0)), TACTICAL_MIN_IGL, 99);
    const coach = input.coachId ? collectionCoachById.get(input.coachId) : undefined;
    // Without a coach the caller does it alone; with one, the bench is worth almost a third of the plan.
    return coach ? caller * 0.7 + ramp(coach.tactics, COACH_TACTICS_RANGE[0], COACH_TACTICS_RANGE[1]) * 0.3 : caller * 0.7;
  }
  // Balanced is only as steady as its shakiest card.
  return ramp(Math.min(...input.players.map((player) => player.consistency ?? 70)), 70, 95);
}

/** Power bonus of the chosen plan, from how well the lineup runs it. */
export function planBonus(input: CollectionLineupInput): number {
  if (!styleReady(input)) return PLAN_OFF_BONUS;
  const [min, max] = (input.style ?? 'balanced') === 'balanced' ? [BALANCED_PLAN_MIN, BALANCED_PLAN_MAX] : [PLAN_BONUS_MIN, PLAN_BONUS_MAX];
  return quarter(min + (max - min) * planQuality(input));
}

/**
 * The combat team a collection lineup starts from: the engine's player-quality and composition motor WITHOUT the
 * legacy per-plan weights and multipliers (Dinastia uses the same base). The chosen plan still rides on the team, so
 * match day keeps each plan's character (the aggressive good day, the tactical preparation).
 */
export function collectionBaseTeam(players: Player[], style: OrgStyle, lineup: SelectedPlayer[], seed = ''): CombatTeam {
  const base = calculateDynastyBaseTeamPower(players, lineup, seed);
  return { ...base, power: softMotor(base.power), style };
}

/**
 * Card quality with diminishing returns, in place of the engine's hard stop at MAX_TEAM_POWER. Up to the knee a better
 * roster is worth every point: that is the road from Commons to Superstars. Above it each point is worth a tenth.
 *
 * Synergy multiplies the motor, so roster and build sit on the same axis: left linear, thirteen points of roster
 * between Superstars and GOATs outweigh any build, and the game is pay-to-win (measured: well-built Superstars won
 * 35% against lazy GOATs). Compressed here, a great roster still helps — and it still unlocks what the plans and the
 * star ask for (an entry of 99, a 95+ star) — but from a good roster on, the build decides.
 */
export const MOTOR_KNEE = 88;
export const MOTOR_SLOPE = 0.1;
export const softMotor = (power: number): number => (power <= MOTOR_KNEE ? power : MOTOR_KNEE + (power - MOTOR_KNEE) * MOTOR_SLOPE);

/** Engine roles a collection slot fills ("awper-igl" → awper and igl). */
export const slotRolesOf = (role: CollectionSlotRole): LineupSlotRole[] => (role === AWPER_IGL ? ['awper', 'igl'] : [role]);

/** The pick the simulation understands: the hybrid is an AWPer with IGL as the secondary role. */
export const toSelectedPlayer = (playerId: string, role: CollectionSlotRole): SelectedPlayer =>
  role === AWPER_IGL ? { playerId, selectedSlotRole: 'awper', secondarySlotRole: 'igl' } : { playerId, selectedSlotRole: role };

/** Back from a simulation pick to the collection slot role. */
export const collectionRoleOf = (pick: SelectedPlayer): CollectionSlotRole =>
  pick.selectedSlotRole === 'awper' && pick.secondarySlotRole === 'igl' ? AWPER_IGL : pick.selectedSlotRole;

export const collectionRoleLabel = (role: CollectionSlotRole): string => slotRolesOf(role).map(getRoleLabel).join(' · ');

/** The star carries the team with frags: a support or a pure IGL cannot be the star (an AWPer-IGL can). */
export const starRoleAllowed = (role: CollectionSlotRole | undefined): boolean => role !== 'support' && role !== 'igl';

export interface CollectionLineupInput {
  players: Player[];
  roles: CollectionSlotRole[];
  starPlayerId: string | null;
  /** Game plan: balanced is free, aggressive needs an entry, tactical needs a real caller and a support (and pays the most). */
  style?: OrgStyle;
  /** Coach card of the collection: it counts as the sixth member of the team and year themes. */
  coachId?: string | null;
}

/** Caller strength a tactical plan needs from its IGL. */
export const TACTICAL_MIN_IGL = 75;

/** Whether the lineup can run the chosen plan; the builder shows the requirement next to the style buttons. */
export function styleReady(input: CollectionLineupInput): boolean {
  const has = (role: LineupSlotRole) => input.roles.some((item) => slotRolesOf(item).includes(role));
  if (input.style === 'aggressive') return has('entry');
  if (input.style === 'tactical') {
    const caller = input.players.some((player, index) => slotRolesOf(input.roles[index]).includes('igl') && (player.igl ?? 0) >= TACTICAL_MIN_IGL);
    return caller && has('support');
  }
  return true;
}

export interface LineupCheck {
  ok: boolean;
  problems: string[];
  /** Star only counts when the player is in the top two overalls of the lineup or has 85+, and is not a support or a pure IGL. */
  starEffective: boolean;
}

/** Primary slot role of a card from its dataset role ("awper-igl" → awper, "rifle-support" → rifler). */
export function primaryRoleOf(player: Pick<Player, 'role'>): LineupSlotRole {
  const first = (player.role ?? 'rifler').toLowerCase().split('-')[0];
  if (first === 'rifle') return 'rifler';
  if (first === 'awp') return 'awper';
  return (['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'] as LineupSlotRole[]).includes(first as LineupSlotRole) ? (first as LineupSlotRole) : 'rifler';
}

export function isStarEffective(players: Player[], starPlayerId: string | null, roles?: readonly CollectionSlotRole[]): boolean {
  if (!starPlayerId) return false;
  const star = players.find((player) => player.id === starPlayerId);
  if (!star) return false;
  if (roles && !starRoleAllowed(roles[players.indexOf(star)])) return false;
  const overall = star.overall ?? 0;
  if (overall >= STAR_MIN_OVERALL) return true;
  const sorted = [...players].map((player) => player.overall ?? 0).sort((a, b) => b - a);
  return overall >= (sorted[1] ?? 0);
}

export function validateLineup(input: CollectionLineupInput, lookup: (id: string) => Player | undefined): LineupCheck {
  const problems: string[] = [];
  if (input.players.length !== 5 || input.roles.length !== 5) problems.push('LINEUP_SIZE');
  const picked: SelectedPlayer[] = [];
  input.players.forEach((player, index) => {
    const role = input.roles[index];
    if (!role) return;
    // The hybrid needs the card to be eligible for both of its roles.
    for (const slotRole of slotRolesOf(role)) {
      const check = validatePlayerPick(player, picked, slotRole, lookup, { unlimitedRoles: true });
      if (!check.ok) { problems.push(`${player.id}:${check.reason ?? 'INVALID'}`); break; }
    }
    picked.push(toSelectedPlayer(player.id, role));
  });
  if (input.starPlayerId && !input.players.some((player) => player.id === input.starPlayerId)) problems.push('STAR_NOT_IN_LINEUP');
  return { ok: problems.length === 0, problems, starEffective: isStarEffective(input.players, input.starPlayerId, input.roles) };
}

export interface SynergyLine {
  key: string;
  /** Percent of power. What a lineup gains by being well built. */
  power: number;
  /**
   * Court points (`courtPower.ts`). What a lineup loses by missing a piece: priced on the court scale so it stings a
   * lineup of GOATs exactly as much as a beginner's, which a percentage cannot do under a compressive curve.
   */
  court: number;
  mental: number;
  clutch: number;
  consistency: number;
}

/** Court points a lineup pays for playing without each piece. Two points are about 67/33 in a best-of-three. */
export const MISSING_IGL_COURT = -2;
export const MISSING_AWPER_COURT = -2;
export const MISSING_SUPPORT_COURT = -1.5;

/** Organization of a team-year, so Astralis 2016 and Astralis 2019 recognise each other. */
const orgOfTeam = (teamId: string | null | undefined): string | null => {
  const name = teamId ? collectionTeamById.get(teamId)?.name : null;
  return name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') || null : null;
};

const memberOfPlayer = (player: Player): ThemeMember => ({
  country: playerCountryOf(player),
  teamId: player.teamId ?? null,
  org: orgOfTeam(player.teamId),
  year: player.year ?? null
});

/** The thematic lines of a lineup, with their labels: the builder names the theme, `synergyOf` only takes the power. */
export function themeOf(input: CollectionLineupInput): ThemeLine[] {
  const coach = input.coachId ? collectionCoachById.get(input.coachId) : undefined;
  // The coach never counts for country: only 13% of the coach cards know their own.
  const coachMember: ThemeMember | null = coach ? { country: null, teamId: coach.teamId, org: orgOfTeam(coach.teamId), year: coach.year } : null;
  return themeLines(input.players.map(memberOfPlayer), coachMember);
}

/** Every composition effect as percentages (power) or points (mental/clutch/consistency); the sum is applied to the team. */
export function synergyOf(input: CollectionLineupInput): SynergyLine[] {
  const lines: SynergyLine[] = [];
  const add = (key: string, effect: Partial<Omit<SynergyLine, 'key'>>) => lines.push({ key, power: 0, court: 0, mental: 0, clutch: 0, consistency: 0, ...effect });
  const count = (role: LineupSlotRole) => input.roles.filter((item) => slotRolesOf(item).includes(role)).length;
  const igls = count('igl');
  // A lone caller who also holds the AWP splits the attention: half of the bonus.
  if (igls === 1 && input.roles.includes(AWPER_IGL)) add('igl_hybrid', { mental: 1.5 * HYBRID_BONUS_RATIO });
  else if (igls === 1) add('igl_one', { mental: 1.5 });
  else if (igls === 0) add('igl_none', { court: MISSING_IGL_COURT, mental: -2 });
  const awpers = count('awper');
  if (awpers === 0) add('awp_none', { court: MISSING_AWPER_COURT });
  else if (awpers >= 2) {
    const strong = input.players.filter((player, index) => slotRolesOf(input.roles[index]).includes('awper')).every((player) => (player.awp ?? 0) >= 80);
    add(strong ? 'awp_double_strong' : 'awp_double_weak', { power: strong ? 1 : -1 });
  }
  const entries = count('entry');
  if (entries === 1) add('entry_one', { power: 0.5 });
  else if (entries >= 2) add('entry_double', { power: 0.25, consistency: -1 });
  if (count('support') === 0) add('support_none', { court: MISSING_SUPPORT_COURT });
  else add('support_present', { power: 0.5 });
  if (count('lurker') >= 1) add('lurker_present', { clutch: 1 });
  // A secondary position costs nothing: the builder only offers roles the card is eligible for.
  const ready = styleReady(input);
  // A plan the lineup cannot run feeds nobody: the star falls back to the balanced row.
  const style: OrgStyle = ready ? input.style ?? 'balanced' : 'balanced';
  if (input.style === 'balanced') add('style_balanced', { power: planBonus(input) });
  else if (input.style === 'aggressive') add(ready ? 'style_aggressive' : 'style_aggressive_off', { power: planBonus(input) });
  else if (input.style === 'tactical') add(ready ? 'style_tactical' : 'style_tactical_off', { power: planBonus(input), mental: ready ? 2 : -1 });
  if (isStarEffective(input.players, input.starPlayerId, input.roles)) {
    const star = input.players.find((player) => player.id === input.starPlayerId)!;
    const role = input.roles[input.players.indexOf(star)];
    add('star', { power: 2 });
    // The role the team plays around under the chosen plan, stretched by how good the star is.
    const scale = starScale(star.overall ?? 0);
    if (role === AWPER_IGL) add('star_awper_igl', { power: quarter(STAR_ROLE_BONUS.awper[style] * scale * HYBRID_BONUS_RATIO) });
    else if (role === 'awper' || role === 'entry' || role === 'rifler' || role === 'lurker') add(`star_${role}`, { power: quarter(STAR_ROLE_BONUS[role][style] * scale), ...(role === 'lurker' ? { clutch: 3 } : {}) });
  }
  // The themes the lineup is built around (same team, country or year); the labels come from `themeOf`.
  for (const line of themeOf(input)) add(line.key, { power: line.power });
  return lines;
}

/** Which cards light up in the builder: the ones that create a positive line glow, the ones that cost strength turn red. */
export function cardEffects(input: CollectionLineupInput): Record<string, 'up' | 'down'> {
  const effects: Record<string, 'up' | 'down'> = {};
  const lines = new Set(synergyOf(input).map((line) => line.key));
  input.players.forEach((player, index) => {
    const role = input.roles[index];
    const up = (role === 'igl' && lines.has('igl_one'))
      || (role === AWPER_IGL && (lines.has('igl_hybrid') || lines.has('awp_double_strong')))
      || (role === 'awper' && lines.has('awp_double_strong'))
      || (role === 'entry' && lines.has('entry_one'))
      || (role === 'support' && lines.has('support_present'))
      || (role === 'lurker' && lines.has('lurker_present'));
    const down = slotRolesOf(role).includes('awper') && lines.has('awp_double_weak');
    if (down) effects[player.id] = 'down';
    else if (up) effects[player.id] = 'up';
  });
  return effects;
}

const clamp99 = (value: number) => Math.max(1, Math.min(99, value));

/** Applies the synergy to a team built by `collectionBaseTeam`. */
export function applyCollectionLineup(team: CombatTeam, input: CollectionLineupInput): CombatTeam {
  const total = synergyOf(input).reduce((sum, line) => ({ power: sum.power + line.power, court: sum.court + line.court, mental: sum.mental + line.mental, clutch: sum.clutch + line.clutch, consistency: sum.consistency + line.consistency }), { power: 0, court: 0, mental: 0, clutch: 0, consistency: 0 });
  return {
    ...team,
    // What the lineup gains is a share of its power; what it lacks is paid in court points, the same for everybody.
    power: addCourtPoints(team.power * (1 + total.power / 100), total.court),
    mental: clamp99(team.mental + total.mental),
    clutch: clamp99(team.clutch + total.clutch),
    ...(team.consistency !== undefined ? { consistency: clamp99(team.consistency + total.consistency) } : {})
  };
}

/** Roles the builder offers for a card; one that can both AWP and call also gets the hybrid slot. */
export function eligibleRolesOf(player: Player): CollectionSlotRole[] {
  const roles = getEligibleSlotRoles(player);
  return roles.includes('awper') && roles.includes('igl') ? [...roles, AWPER_IGL] : roles;
}

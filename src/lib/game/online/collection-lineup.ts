import { getEligibleSlotRoles, getRoleLabel, validatePlayerPick } from '../roleRules';
import { collectionCoachById, collectionTeamById } from './collection-pool';
import { playerCountryOf } from './collection-countries';
import { themeLines, type ThemeLine, type ThemeMember } from './collection-theme';
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
 * Plan bonuses (% of power). The simulation already favours the tactical plan (×1.10, balanced ×1.05, aggressive ×1),
 * so the collection evens it out here: balanced gets a flat lift and the aggressive plan grows with its entry, from
 * AGGRESSIVE_PLAN_MIN at 75 of the entry attribute to AGGRESSIVE_PLAN_MAX at 95. A really good entry beats a tactical team.
 */
export const BALANCED_PLAN_BONUS = 6;
export const TACTICAL_PLAN_BONUS = 3;
export const AGGRESSIVE_PLAN_MIN = 6;
export const AGGRESSIVE_PLAN_MAX = 14;
const quarter = (value: number) => Math.round(value * 4) / 4;

/** Aggressive plan bonus from the best entry of the lineup. */
export function aggressivePlanBonus(input: CollectionLineupInput): number {
  const best = Math.max(0, ...input.players.filter((_, index) => input.roles[index] === 'entry').map((player) => player.entry ?? 0));
  const quality = Math.max(0, Math.min(1, (best - 75) / 20));
  return quarter(AGGRESSIVE_PLAN_MIN + (AGGRESSIVE_PLAN_MAX - AGGRESSIVE_PLAN_MIN) * quality);
}

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
  power: number;
  mental: number;
  clutch: number;
  consistency: number;
}

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
  const add = (key: string, effect: Partial<Omit<SynergyLine, 'key'>>) => lines.push({ key, power: 0, mental: 0, clutch: 0, consistency: 0, ...effect });
  const count = (role: LineupSlotRole) => input.roles.filter((item) => slotRolesOf(item).includes(role)).length;
  const igls = count('igl');
  // A lone caller who also holds the AWP splits the attention: half of the bonus.
  if (igls === 1 && input.roles.includes(AWPER_IGL)) add('igl_hybrid', { mental: 1.5 * HYBRID_BONUS_RATIO });
  else if (igls === 1) add('igl_one', { mental: 1.5 });
  else if (igls === 0) add('igl_none', { mental: -2 });
  const awpers = count('awper');
  if (awpers === 0) add('awp_none', { power: -2 });
  else if (awpers >= 2) {
    const strong = input.players.filter((player, index) => slotRolesOf(input.roles[index]).includes('awper')).every((player) => (player.awp ?? 0) >= 80);
    add(strong ? 'awp_double_strong' : 'awp_double_weak', { power: strong ? 1 : -1 });
  }
  const entries = count('entry');
  if (entries === 1) add('entry_one', { power: 0.5 });
  else if (entries >= 2) add('entry_double', { power: 0.25, consistency: -1 });
  if (count('support') === 0) add('support_none', { power: -1.5 });
  else add('support_present', { power: 0.5 });
  if (count('lurker') >= 1) add('lurker_present', { clutch: 1 });
  // A secondary position costs nothing: the builder only offers roles the card is eligible for.
  const ready = styleReady(input);
  // A plan the lineup cannot run feeds nobody: the star falls back to the balanced row.
  const style: OrgStyle = ready ? input.style ?? 'balanced' : 'balanced';
  if (input.style === 'balanced') add('style_balanced', { power: BALANCED_PLAN_BONUS });
  else if (input.style === 'aggressive') add(ready ? 'style_aggressive' : 'style_aggressive_off', ready ? { power: aggressivePlanBonus(input) } : { power: -1 });
  else if (input.style === 'tactical') add(ready ? 'style_tactical' : 'style_tactical_off', ready ? { power: TACTICAL_PLAN_BONUS, mental: 2 } : { power: -2, mental: -1 });
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

/** Applies the synergy to a team already built by `calculateUserTeamPower`. */
export function applyCollectionLineup(team: CombatTeam, input: CollectionLineupInput): CombatTeam {
  const total = synergyOf(input).reduce((sum, line) => ({ power: sum.power + line.power, mental: sum.mental + line.mental, clutch: sum.clutch + line.clutch, consistency: sum.consistency + line.consistency }), { power: 0, mental: 0, clutch: 0, consistency: 0 });
  return {
    ...team,
    power: team.power * (1 + total.power / 100),
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

import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import type { CombatTeam, LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '../types';

/**
 * Lineup rules of the collection mode. Roles may repeat; instead of the off-position penalty of Dinastia there is a
 * synergy (up or down) by composition, and one star player the team is built around. Pure and shared: the server
 * applies it to the tournament team, the client previews the same numbers.
 */
export const STAR_MIN_OVERALL = 85;

export interface CollectionLineupInput {
  players: Player[];
  roles: LineupSlotRole[];
  starPlayerId: string | null;
  /** Game plan: balanced is free, aggressive needs an entry, tactical needs a real caller and a support (and pays the most). */
  style?: OrgStyle;
}

/** Caller strength a tactical plan needs from its IGL. */
export const TACTICAL_MIN_IGL = 75;

/** Whether the lineup can run the chosen plan; the builder shows the requirement next to the style buttons. */
export function styleReady(input: CollectionLineupInput): boolean {
  const has = (role: LineupSlotRole) => input.roles.includes(role);
  if (input.style === 'aggressive') return has('entry');
  if (input.style === 'tactical') {
    const igl = input.players.find((_, index) => input.roles[index] === 'igl');
    return Boolean(igl && (igl.igl ?? 0) >= TACTICAL_MIN_IGL && has('support'));
  }
  return true;
}

export interface LineupCheck {
  ok: boolean;
  problems: string[];
  /** Star only counts when the player is in the top two overalls of the lineup or has 85+. */
  starEffective: boolean;
}

/** Primary slot role of a card from its dataset role ("awper-igl" → awper, "rifle-support" → rifler). */
export function primaryRoleOf(player: Pick<Player, 'role'>): LineupSlotRole {
  const first = (player.role ?? 'rifler').toLowerCase().split('-')[0];
  if (first === 'rifle') return 'rifler';
  if (first === 'awp') return 'awper';
  return (['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'] as LineupSlotRole[]).includes(first as LineupSlotRole) ? (first as LineupSlotRole) : 'rifler';
}

export function isStarEffective(players: Player[], starPlayerId: string | null): boolean {
  if (!starPlayerId) return false;
  const star = players.find((player) => player.id === starPlayerId);
  if (!star) return false;
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
    const check = validatePlayerPick(player, picked, role, lookup, { unlimitedRoles: true });
    if (!check.ok) problems.push(`${player.id}:${check.reason ?? 'INVALID'}`);
    picked.push({ playerId: player.id, selectedSlotRole: role });
  });
  if (input.starPlayerId && !input.players.some((player) => player.id === input.starPlayerId)) problems.push('STAR_NOT_IN_LINEUP');
  return { ok: problems.length === 0, problems, starEffective: isStarEffective(input.players, input.starPlayerId) };
}

export interface SynergyLine {
  key: string;
  power: number;
  mental: number;
  clutch: number;
  consistency: number;
}

/** Every composition effect as percentages (power) or points (mental/clutch/consistency); the sum is applied to the team. */
export function synergyOf(input: CollectionLineupInput): SynergyLine[] {
  const lines: SynergyLine[] = [];
  const add = (key: string, effect: Partial<Omit<SynergyLine, 'key'>>) => lines.push({ key, power: 0, mental: 0, clutch: 0, consistency: 0, ...effect });
  const count = (role: LineupSlotRole) => input.roles.filter((item) => item === role).length;
  const igls = count('igl');
  if (igls === 1) add('igl_one', { mental: 1.5 });
  else if (igls === 0) add('igl_none', { mental: -2 });
  const awpers = count('awper');
  if (awpers === 0) add('awp_none', { power: -2 });
  else if (awpers >= 2) {
    const strong = input.players.filter((player, index) => input.roles[index] === 'awper').every((player) => (player.awp ?? 0) >= 80);
    add(strong ? 'awp_double_strong' : 'awp_double_weak', { power: strong ? 1 : -1 });
  }
  const entries = count('entry');
  if (entries === 1) add('entry_one', { power: 0.5 });
  else if (entries >= 2) add('entry_double', { power: 0.25, consistency: -1 });
  if (count('support') === 0) add('support_none', { power: -1.5 });
  else add('support_present', { power: 0.5 });
  if (count('lurker') >= 1) add('lurker_present', { clutch: 1 });
  const offRole = input.players.filter((player, index) => primaryRoleOf(player) !== input.roles[index]).length;
  if (offRole) add('off_role', { power: -1 * offRole });
  const ready = styleReady(input);
  if (input.style === 'balanced') add('style_balanced', { power: 0.5 });
  else if (input.style === 'aggressive') add(ready ? 'style_aggressive' : 'style_aggressive_off', ready ? { power: 1.5 } : { power: -1 });
  else if (input.style === 'tactical') add(ready ? 'style_tactical' : 'style_tactical_off', ready ? { power: 3, mental: 2 } : { power: -2, mental: -1 });
  if (isStarEffective(input.players, input.starPlayerId)) {
    const star = input.players.find((player) => player.id === input.starPlayerId)!;
    const role = input.roles[input.players.indexOf(star)];
    add('star', { power: 2 });
    if (role === 'awper') add('star_awper', { power: 0.5 });
    if (role === 'support') add('star_support', { mental: 2 });
    if (role === 'igl') add('star_igl', { mental: 1.5 });
    if (role === 'lurker') add('star_lurker', { clutch: 3 });
  }
  return lines;
}

/** Which cards light up in the builder: the ones that create a positive line glow, the ones that cost strength turn red. */
export function cardEffects(input: CollectionLineupInput): Record<string, 'up' | 'down'> {
  const effects: Record<string, 'up' | 'down'> = {};
  const lines = new Set(synergyOf(input).map((line) => line.key));
  input.players.forEach((player, index) => {
    const role = input.roles[index];
    if (primaryRoleOf(player) !== role) { effects[player.id] = 'down'; return; }
    const up = (role === 'igl' && lines.has('igl_one'))
      || (role === 'awper' && lines.has('awp_double_strong'))
      || (role === 'entry' && lines.has('entry_one'))
      || (role === 'support' && lines.has('support_present'))
      || (role === 'lurker' && lines.has('lurker_present'));
    const down = role === 'awper' && lines.has('awp_double_weak');
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

export const eligibleRolesOf = (player: Player): LineupSlotRole[] => getEligibleSlotRoles(player);

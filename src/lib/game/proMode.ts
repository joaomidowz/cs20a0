import { getEligibleSlotRoles } from './roleRules';
import type { LineupSlotRole, OrgStyle, Player, SelectedPlayer } from './types';

export const PRO_REQUIRED_ROLES: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support', 'rifler'];
export const PRO_REROLLS_MAX = 1;

export const PRO_ROLE_FIT_MODIFIERS = {
  primary: 1,
  secondary: 0.92,
  incompatible: 0.75,
  severe: 0.65
} as const;

const PRO_RIFLER_FLEX_MODIFIER = 1;
const PRO_IGL_TO_SUPPORT_MODIFIER = 0.96;

export const PRO_STYLE_MODIFIERS = {
  aggressive: {
    roleBoost: 1.05,
    boostedRoles: ['awper', 'entry', 'lurker'] as LineupSlotRole[]
  },
  tactical: {
    roleBoost: 1.05,
    boostedRoles: ['igl', 'support'] as LineupSlotRole[]
  },
  balanced: {
    correctRoleBoost: 1.02,
    debuffReduction: 0.2
  }
} as const;

const PRO_ROLE_ATTRIBUTES: Record<LineupSlotRole, Array<keyof Player>> = {
  igl: ['igl', 'mental', 'experience', 'consistency', 'support'],
  awper: ['awp', 'firepower', 'clutch', 'consistency'],
  entry: ['entry', 'firepower', 'clutch', 'mental'],
  lurker: ['clutch', 'consistency', 'firepower', 'experience'],
  support: ['support', 'consistency', 'mental', 'experience'],
  rifler: ['firepower', 'entry', 'clutch', 'consistency']
};

export type ProRoleFit = keyof typeof PRO_ROLE_FIT_MODIFIERS;

export interface ProRoleEvaluation {
  player: Player;
  adjustedPlayer: Player;
  selectedRole: LineupSlotRole;
  primaryRole: LineupSlotRole;
  eligibleRoles: LineupSlotRole[];
  fit: ProRoleFit;
  modifier: number;
  styleModifier: number;
  baseOverall: number;
  effectiveOverall: number;
  affectedAttributes: Array<keyof Player>;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const numeric = (value: number | null | undefined, fallback = 70) =>
  Number.isFinite(value) ? Number(value) : fallback;

const normalizeRole = (role: string | null | undefined): LineupSlotRole => {
  const value = (role ?? '').toLowerCase();
  if (value.includes('awp')) return 'awper';
  if (value.includes('igl')) return 'igl';
  if (value.includes('entry')) return 'entry';
  if (value.includes('lurk')) return 'lurker';
  if (value.includes('support')) return 'support';
  return 'rifler';
};

export function getProPrimaryRole(player: Player): LineupSlotRole {
  return normalizeRole(player.role) || getEligibleSlotRoles(player)[0] || 'rifler';
}

export function getProRoleFit(player: Player, selectedRole: LineupSlotRole): ProRoleFit {
  const primaryRole = getProPrimaryRole(player);
  if (selectedRole === primaryRole) return 'primary';
  if (selectedRole === 'rifler') return 'secondary';
  if (primaryRole === 'igl' && selectedRole === 'support') return 'secondary';
  const eligibleRoles = getEligibleSlotRoles(player);
  if (eligibleRoles.includes(selectedRole)) return 'secondary';
  if (selectedRole === 'igl' || selectedRole === 'awper' || primaryRole === 'igl' || primaryRole === 'awper') return 'severe';
  return 'incompatible';
}

export function getProStyleMultiplier(style: OrgStyle, selectedRole: LineupSlotRole, fit: ProRoleFit) {
  if (selectedRole === 'rifler') return 1;
  if (style === 'aggressive' && PRO_STYLE_MODIFIERS.aggressive.boostedRoles.includes(selectedRole)) return PRO_STYLE_MODIFIERS.aggressive.roleBoost;
  if (style === 'tactical' && PRO_STYLE_MODIFIERS.tactical.boostedRoles.includes(selectedRole)) return PRO_STYLE_MODIFIERS.tactical.roleBoost;
  if (style === 'balanced' && (fit === 'primary' || fit === 'secondary')) return PRO_STYLE_MODIFIERS.balanced.correctRoleBoost;
  return 1;
}

function fitModifierForStyle(fit: ProRoleFit, style: OrgStyle, selectedRole: LineupSlotRole, primaryRole: LineupSlotRole) {
  if (selectedRole === 'rifler') return PRO_RIFLER_FLEX_MODIFIER;
  if (primaryRole === 'igl' && selectedRole === 'support') return PRO_IGL_TO_SUPPORT_MODIFIER;
  const base = PRO_ROLE_FIT_MODIFIERS[fit];
  if (style !== 'balanced' || base >= 1) return base;
  return 1 - (1 - base) * (1 - PRO_STYLE_MODIFIERS.balanced.debuffReduction);
}

export function validateProAssignments(assignments: Record<string, LineupSlotRole | null>, playerIds: string[]) {
  const assignedRoles = playerIds.map((playerId) => assignments[playerId]).filter((role): role is LineupSlotRole => Boolean(role));
  const uniqueRoles = new Set(assignedRoles);
  return {
    complete: playerIds.length === 5 && assignedRoles.length === 5 && assignedRoles.length === uniqueRoles.size,
    hasDuplicate: assignedRoles.length !== uniqueRoles.size,
    unassignedCount: Math.max(0, playerIds.length - assignedRoles.length),
    missingRoles: []
  };
}

export function buildProRoleEvaluations(
  selectedPlayers: Player[],
  assignments: Record<string, LineupSlotRole | null>,
  style: OrgStyle
): ProRoleEvaluation[] {
  return selectedPlayers.flatMap((player) => {
    const selectedRole = assignments[player.id];
    if (!selectedRole) return [];
    const primaryRole = getProPrimaryRole(player);
    const eligibleRoles = getEligibleSlotRoles(player);
    const fit = getProRoleFit(player, selectedRole);
    const roleModifier = fitModifierForStyle(fit, style, selectedRole, primaryRole);
    const styleModifier = primaryRole === 'igl' && selectedRole === 'support' ? 1 : getProStyleMultiplier(style, selectedRole, fit);
    const modifier = roleModifier * styleModifier;
    const affectedAttributes = PRO_ROLE_ATTRIBUTES[selectedRole] ?? PRO_ROLE_ATTRIBUTES.rifler;
    const baseOverall = numeric(player.overall);
    const effectiveOverall = Math.round(clamp(baseOverall * modifier, 40, 99));
    const adjustedPlayer: Player = {
      ...player,
      overall: effectiveOverall
    };

    for (const attribute of affectedAttributes) {
      const current = adjustedPlayer[attribute];
      if (typeof current === 'number') {
        adjustedPlayer[attribute] = Math.round(clamp(current * modifier, 20, 99)) as never;
      }
    }

    return [{
      player,
      adjustedPlayer,
      selectedRole,
      primaryRole,
      eligibleRoles,
      fit,
      modifier,
      styleModifier,
      baseOverall,
      effectiveOverall,
      affectedAttributes
    }];
  });
}

export function buildProLineup(evaluations: ProRoleEvaluation[]): SelectedPlayer[] {
  return evaluations.map((evaluation) => ({
    playerId: evaluation.player.id,
    selectedSlotRole: evaluation.selectedRole
  }));
}

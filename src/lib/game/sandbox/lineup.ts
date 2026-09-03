import { playerById, players as allPlayers, teamById, teams } from '../data';
import { isValidLineupMapSelection, getDefaultMapSelection } from '../maps';
import { getEligibleSlotRoles, ROLE_LIMITS } from '../roleRules';
import { calculateUserTeamPower, createSeededRng } from '../simulation';
import type { CombatTeam, LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '../types';
import type { SandboxLineupSelection, SandboxLineupValidation } from './types';

export function validateSandboxLineup(selection: SandboxLineupSelection): SandboxLineupValidation {
  const errors: Record<string, string> = {};
  const resolvedPlayers = selection.players.map((selected) => playerById.get(selected.playerId)).filter((player) => player !== undefined);
  if (!selection.organizationId.trim() || !teamById.has(selection.organizationId)) errors.organizationId = 'Escolha uma organização válida.';
  if (selection.players.length !== 5) errors.players = 'Escolha exatamente cinco jogadores.';

  selection.players.forEach((selected, index) => {
    const player = playerById.get(selected.playerId);
    if (!player) {
      errors[`players.${index}.playerId`] = 'Escolha um jogador válido.';
    }
  });
  if (resolvedPlayers.length === 5 && !isValidLineupMapSelection(selection.mapPreferences, resolvedPlayers, teams)) {
    errors.mapPreferences = 'Escolha três mapas únicos com familiaridade maior que zero.';
  }
  return { valid: Object.keys(errors).length === 0, errors, players: resolvedPlayers };
}

export const sandboxPowerSeed = (organizationId: string) => `sandbox:${organizationId}`;

export function buildSandboxCombatTeam(selection: SandboxLineupSelection): CombatTeam {
  const validation = validateSandboxLineup(selection);
  if (!validation.valid) throw new Error('Cannot build an invalid Sandbox lineup');
  const organization = teamById.get(selection.organizationId)!;
  const lineup = selection.players.map((selected) => ({ ...selected }));
  const calculated = calculateUserTeamPower(validation.players, selection.style, lineup, sandboxPowerSeed(selection.organizationId));
  return {
    ...calculated,
    id: 'sandbox-user',
    organizationId: selection.organizationId,
    name: `${organization.name ?? 'Time'} ${organization.year ?? ''}`.trim(),
    style: selection.style,
    isUser: true,
    lineup
  };
}

export interface SandboxPowerPreview {
  power: number;
  averageOverall: number;
  eras: number[];
  roles: Record<LineupSlotRole, number>;
  offRoleCount: number;
  missing: LineupSlotRole[];
  duplicates: number;
}

const CORE_ROLES: LineupSlotRole[] = ['igl', 'awper', 'entry', 'lurker', 'support'];

/** Computes the live power preview for any (even incomplete) Sandbox lineup. Pure and cheap: safe to call per keystroke. */
export function previewSandboxLineupPower(
  picks: SelectedPlayer[],
  style: OrgStyle,
  organizationId: string
): SandboxPowerPreview {
  const resolved = picks
    .map((pick) => ({ pick, player: playerById.get(pick.playerId) }))
    .filter((entry): entry is { pick: SelectedPlayer; player: Player } => entry.player !== undefined);
  const players = resolved.map((entry) => entry.player);
  const lineup = resolved.map((entry) => entry.pick);
  const team = calculateUserTeamPower(players, style, lineup, sandboxPowerSeed(organizationId));
  const roles = (Object.keys(ROLE_LIMITS) as LineupSlotRole[]).reduce(
    (counts, role) => ({ ...counts, [role]: lineup.filter((pick) => pick.selectedSlotRole === role).length }),
    {} as Record<LineupSlotRole, number>
  );
  const eras = [...new Set(players.map((player) => (player.teamId ? teamById.get(player.teamId)?.year : null) ?? player.year).filter((year): year is number => typeof year === 'number'))].sort((a, b) => a - b);
  const baseIds = players.map((player) => (player.baseId?.trim() || player.id).replace(/[-_\s]?(?:19|20)\d{2}$/i, '').toLowerCase());
  return {
    power: players.length ? Math.round(team.power * 10) / 10 : 0,
    averageOverall: players.length ? Math.round(players.reduce((sum, player) => sum + (Number(player.overall) || 0), 0) / players.length) : 0,
    eras,
    roles,
    offRoleCount: resolved.filter((entry) => !getEligibleSlotRoles(entry.player).includes(entry.pick.selectedSlotRole)).length,
    missing: CORE_ROLES.filter((role) => roles[role] === 0),
    duplicates: baseIds.length - new Set(baseIds).size
  };
}

/** Picks the slot role to use when a candidate replaces a slot: keeps the slot role when the candidate is eligible for it. */
export function chooseSandboxSlotRole(candidate: Player, currentRole: LineupSlotRole | null): LineupSlotRole {
  const eligible = getEligibleSlotRoles(candidate);
  if (currentRole && eligible.includes(currentRole)) return currentRole;
  return eligible[0] ?? 'rifler';
}

/** Power delta (rounded to one decimal) when `candidate` takes `slotIndex`. */
export function previewSandboxSwapDelta(
  picks: SelectedPlayer[],
  slotIndex: number,
  candidate: Player,
  role: LineupSlotRole,
  style: OrgStyle,
  organizationId: string
): number {
  const before = previewSandboxLineupPower(picks, style, organizationId).power;
  const nextPicks = picks.length > slotIndex
    ? picks.map((pick, index) => index === slotIndex ? { playerId: candidate.id, selectedSlotRole: role } : pick)
    : [...picks, { playerId: candidate.id, selectedSlotRole: role }];
  const after = previewSandboxLineupPower(nextPicks, style, organizationId).power;
  return Math.round((after - before) * 10) / 10;
}

/** Builds a random five-player lineup, covering the five core roles when the drawn players allow it. */
export function createRandomSandboxLineup(seed: string, pool: Player[] = allPlayers): SelectedPlayer[] {
  const rng = createSeededRng(`${seed}:sandbox-random-lineup`);
  const candidates = pool.filter((player) => playerById.has(player.id));
  const drawn: Player[] = [];
  const usedBase = new Set<string>();
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  for (const player of shuffled) {
    const base = (player.baseId?.trim() || player.id).replace(/[-_\s]?(?:19|20)\d{2}$/i, '').toLowerCase();
    if (usedBase.has(base)) continue;
    usedBase.add(base);
    drawn.push(player);
    if (drawn.length === 5) break;
  }
  const remainingRoles = [...CORE_ROLES];
  const picks: SelectedPlayer[] = [];
  const assigned = new Set<string>();
  for (const role of CORE_ROLES) {
    const match = drawn.find((player) => !assigned.has(player.id) && getEligibleSlotRoles(player).includes(role));
    if (!match) continue;
    assigned.add(match.id);
    remainingRoles.splice(remainingRoles.indexOf(role), 1);
    picks.push({ playerId: match.id, selectedSlotRole: role });
  }
  for (const player of drawn) {
    if (assigned.has(player.id)) continue;
    picks.push({ playerId: player.id, selectedSlotRole: remainingRoles.shift() ?? 'rifler' });
  }
  return drawn.map((player) => picks.find((pick) => pick.playerId === player.id)!);
}

export function getDefaultSandboxMapPreferences(picks: SelectedPlayer[]) {
  const players = picks.map((pick) => playerById.get(pick.playerId)).filter((player): player is Player => player !== undefined);
  return getDefaultMapSelection(players, teams);
}

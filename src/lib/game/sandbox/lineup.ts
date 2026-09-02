import { playerById, teamById, teams } from '../data';
import { isValidLineupMapSelection } from '../maps';
import { calculateUserTeamPower } from '../simulation';
import type { CombatTeam } from '../types';
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

export function buildSandboxCombatTeam(selection: SandboxLineupSelection): CombatTeam {
  const validation = validateSandboxLineup(selection);
  if (!validation.valid) throw new Error('Cannot build an invalid Sandbox lineup');
  const organization = teamById.get(selection.organizationId)!;
  const lineup = selection.players.map((selected) => ({ ...selected }));
  const calculated = calculateUserTeamPower(validation.players, selection.style, lineup, `sandbox:${selection.organizationId}`);
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

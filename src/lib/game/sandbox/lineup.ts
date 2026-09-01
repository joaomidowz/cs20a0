import { playerById, teamById } from '../data';
import { getPlayerBaseId, validatePlayerPick } from '../roleRules';
import { calculateUserTeamPower } from '../simulation';
import type { CombatTeam, SelectedPlayer } from '../types';
import type { SandboxLineupSelection, SandboxLineupValidation } from './types';

const REQUIRED_PLAYER_COUNT = 5;

export function validateSandboxLineup(selection: SandboxLineupSelection): SandboxLineupValidation {
  const errors: Record<string, string> = {};
  const resolvedPlayers = selection.players
    .map((selected) => playerById.get(selected.playerId))
    .filter((player) => player !== undefined);

  if (!selection.organizationId.trim() || !teamById.has(selection.organizationId)) {
    errors.organizationId = 'Escolha uma organização válida.';
  }
  if (selection.players.length !== REQUIRED_PLAYER_COUNT) {
    errors.players = 'Escolha exatamente cinco jogadores.';
  }

  const accepted: SelectedPlayer[] = [];
  const seenBaseIds = new Set<string>();
  selection.players.forEach((selected, index) => {
    const player = playerById.get(selected.playerId);
    if (!player) {
      errors[`players.${index}.playerId`] = 'Escolha um jogador válido.';
      return;
    }

    const baseId = getPlayerBaseId(player);
    if (seenBaseIds.has(baseId)) {
      errors[`players.${index}.playerId`] = 'Este jogador já foi escolhido em outra era.';
      return;
    }
    seenBaseIds.add(baseId);

    const validation = validatePlayerPick(
      player,
      accepted,
      selected.selectedSlotRole,
      (id) => playerById.get(id)
    );
    if (!validation.ok) {
      errors[`players.${index}.selectedSlotRole`] = validation.reason ?? 'Escolha uma função válida para este jogador.';
      return;
    }
    accepted.push({ ...selected });
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    players: resolvedPlayers
  };
}

export function buildSandboxCombatTeam(selection: SandboxLineupSelection, side: 'A' | 'B'): CombatTeam {
  const validation = validateSandboxLineup(selection);
  if (!validation.valid) throw new Error('Cannot build an invalid Sandbox lineup');

  const organization = teamById.get(selection.organizationId)!;
  const lineup = selection.players.map((selected) => ({ ...selected }));
  const calculated = calculateUserTeamPower(validation.players, selection.style, lineup, `sandbox:${selection.organizationId}`);
  return {
    ...calculated,
    id: side === 'A' ? 'sandbox-a' : 'sandbox-b',
    organizationId: selection.organizationId,
    name: `${organization.name ?? 'Time A'} ${organization.year ?? ''}`.trim(),
    style: selection.style,
    isUser: true,
    lineup
  };
}

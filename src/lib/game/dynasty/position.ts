import { getEligibleSlotRoles } from '../roleRules';
import type { Player, SelectedPlayer } from '../types';

/** Strength lost for each lineup player placed outside the positions they can play. */
export const OFF_ROLE_PENALTY = 0.015;
export const MAX_OFF_ROLE_PENALTY = 0.075;

/** Ids of the lineup players assigned to a position their profile cannot play. */
export function offRolePlayerIds(players: Player[], lineup: SelectedPlayer[]): string[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return lineup.flatMap((selected) => {
    const player = byId.get(selected.playerId);
    return player && !getEligibleSlotRoles(player).includes(selected.selectedSlotRole) ? [selected.playerId] : [];
  });
}

export const positionMultiplier = (offRoleCount: number): number =>
  1 - Math.min(MAX_OFF_ROLE_PENALTY, OFF_ROLE_PENALTY * Math.max(0, offRoleCount));

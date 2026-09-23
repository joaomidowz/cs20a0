import type { CollectionSlotRole } from './collection-lineup';
import type { MapId } from '../types';

export interface LineupOwnershipDraft {
  playerIds: readonly (string | null)[];
  roles: readonly (CollectionSlotRole | null)[];
  starPlayerId: string | null;
  coachId: string | null;
  mapPreferences: readonly MapId[];
}

/** Removes locally selected cards that are no longer owned, while preserving every still-owned draft choice. */
export function reconcileLineupOwnership(draft: LineupOwnershipDraft, ownedIds: ReadonlySet<string>): LineupOwnershipDraft {
  let removedPlayer = false;
  const playerIds = draft.playerIds.map((id) => {
    if (id && !ownedIds.has(id)) { removedPlayer = true; return null; }
    return id;
  });
  const roles = draft.roles.map((role, index) => playerIds[index] ? role : null);
  return {
    playerIds,
    roles,
    starPlayerId: draft.starPlayerId && playerIds.includes(draft.starPlayerId) ? draft.starPlayerId : null,
    coachId: draft.coachId && ownedIds.has(draft.coachId) ? draft.coachId : null,
    mapPreferences: removedPlayer ? [] : [...draft.mapPreferences]
  };
}

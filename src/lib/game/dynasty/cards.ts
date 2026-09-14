import { getPlayerBaseId } from '../roleRules';
import type { DynastyMajorSummary, EvolutionEntry, LineupSlotRole, Player, TrainingFocus } from '../types';

export interface PlayerMajorEntry {
  majorNumber: number;
  placement: string;
  /** Version of the player used in that Major. */
  playerId: string;
  role: LineupSlotRole;
  rating: number | null;
  mapsPlayed: number | null;
  /** Overall at the start of that Major; null in summaries saved before it was recorded. */
  overall: number | null;
  training: TrainingFocus | null;
  evolution: EvolutionEntry | null;
}

export interface CoachMajorEntry {
  majorNumber: number;
  placement: string;
  averageRating: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Every Major the player's lineage took part in, following version changes through `getPlayerBaseId`. */
export function playerMajorHistory(history: DynastyMajorSummary[], player: Player, playerById: Map<string, Player>): PlayerMajorEntry[] {
  const baseId = getPlayerBaseId(player);
  return history.flatMap((summary) => {
    const selected = summary.lineup.find((item) => {
      const version = playerById.get(item.playerId);
      return version ? getPlayerBaseId(version) === baseId : false;
    });
    if (!selected) return [];
    const stat = summary.stats.find((item) => item.playerId === selected.playerId);
    return [{
      majorNumber: summary.majorNumber,
      placement: summary.placement,
      playerId: selected.playerId,
      role: selected.selectedSlotRole,
      rating: typeof stat?.runRating === 'number' ? stat.runRating : null,
      mapsPlayed: typeof stat?.mapsPlayed === 'number' ? stat.mapsPlayed : null,
      overall: summary.overalls?.[selected.playerId] ?? null,
      training: summary.training ?? null,
      evolution: summary.evolution?.find((entry) => entry.fromPlayerId === selected.playerId) ?? null
    }];
  });
}

/** Majors a coach led, with the lineup's average rating in each. */
export function coachMajorHistory(history: DynastyMajorSummary[], coachId: string): CoachMajorEntry[] {
  return history.filter((summary) => summary.coachId === coachId).map((summary) => {
    const ratings = summary.stats.map((stat) => stat.runRating).filter((rating): rating is number => typeof rating === 'number');
    return {
      majorNumber: summary.majorNumber,
      placement: summary.placement,
      averageRating: ratings.length ? round2(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null
    };
  });
}

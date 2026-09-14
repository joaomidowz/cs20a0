// src/lib/game/dynasty/evolution.ts
import { getPlayerBaseId } from '../roleRules';
import type { Coach, EvolutionEntry, Player, PlayerOverride, PlayerRunStats, SelectedPlayer } from '../types';
import { DRIFT_KEYS, resolveDynastyPlayer } from './resolve';

/** Largest drift a player can carry over the same dataset version, in both directions. */
export const DRIFT_LIMIT = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Overall points a player moves after one Major. `development` is the coach's attribute (null without a coach). */
export function driftDelta(rating: number, development: number | null, experience: number): number {
  let delta = Math.round((rating - 1) * 12) + 0;
  if (development !== null && development >= 85) delta += 1;
  else if (development !== null && development <= 60) delta -= 1;
  return experience >= 94 ? clamp(delta, -5, 1) : clamp(delta, -4, 4);
}

/** Same person one year later; with two versions that year (two Majors), the higher overall, then the id. */
export function nextVersionOf(player: Player, catalog: Player[]): Player | null {
  const baseId = getPlayerBaseId(player);
  const year = (player.year ?? 0) + 1;
  return catalog
    .filter((candidate) => candidate.year === year && getPlayerBaseId(candidate) === baseId)
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id))[0] ?? null;
}

export interface EvolveInput {
  lineup: SelectedPlayer[];
  overrides: Record<string, PlayerOverride>;
  stats: PlayerRunStats[];
  coach: Coach | null;
  catalog: Player[];
  playerById: Map<string, Player>;
}

export interface EvolveResult {
  lineup: SelectedPlayer[];
  overrides: Record<string, PlayerOverride>;
  evolution: EvolutionEntry[];
}

/** Runs once when the transfer window opens. The dataset is never touched: versions swap ids, drift lives in the overrides. */
export function evolveLineup(input: EvolveInput): EvolveResult {
  const lineup: SelectedPlayer[] = [];
  const overrides: Record<string, PlayerOverride> = {};
  const evolution: EvolutionEntry[] = [];
  for (const selected of input.lineup) {
    const base = input.playerById.get(selected.playerId);
    if (!base) {
      lineup.push(selected);
      continue;
    }
    const previous = input.overrides[selected.playerId];
    const before = resolveDynastyPlayer(base, previous);
    const next = nextVersionOf(base, input.catalog);
    if (next) {
      lineup.push({ playerId: next.id, selectedSlotRole: selected.selectedSlotRole });
      overrides[next.id] = { drift: {}, driftTotal: 0, versionsSince: [...(previous?.versionsSince ?? []), base.id] };
      evolution.push({ fromPlayerId: base.id, toPlayerId: next.id, kind: 'version', overallBefore: before.overall ?? 70, overallAfter: next.overall ?? 70 });
      continue;
    }
    const rating = input.stats.find((stat) => stat.playerId === selected.playerId)?.runRating ?? 1;
    const wanted = driftDelta(rating, input.coach?.development ?? null, before.experience ?? 70);
    const total = previous?.driftTotal ?? 0;
    const applied = clamp(total + wanted, -DRIFT_LIMIT, DRIFT_LIMIT) - total;
    const drift: PlayerOverride['drift'] = { ...(previous?.drift ?? {}) };
    if (applied !== 0) for (const key of DRIFT_KEYS) drift[key] = (drift[key] ?? 0) + applied;
    drift.experience = (drift.experience ?? 0) + 1;
    const override: PlayerOverride = { drift, driftTotal: total + applied, versionsSince: previous?.versionsSince ?? [] };
    overrides[selected.playerId] = override;
    lineup.push(selected);
    const after = resolveDynastyPlayer(base, override);
    evolution.push({ fromPlayerId: base.id, toPlayerId: base.id, kind: applied === 0 ? 'stable' : 'drift', overallBefore: before.overall ?? 70, overallAfter: after.overall ?? 70 });
  }
  return { lineup, overrides, evolution };
}

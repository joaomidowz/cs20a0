// src/lib/game/dynasty/resolve.ts
import type { Player, PlayerOverride } from '../types';

/** Attributes the Major-to-Major drift moves together. Experience grows on its own and IGL never drifts. */
export const DRIFT_KEYS = ['firepower', 'clutch', 'entry', 'awp', 'support', 'consistency', 'mental', 'overall'] as const;
export type DriftKey = (typeof DRIFT_KEYS)[number] | 'experience';

const clampAttribute = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

/** The only way to read a Dinastia player: the dataset version plus the dynasty's drift. Without an override the same object comes back. */
export function resolveDynastyPlayer(player: Player, override: PlayerOverride | null | undefined): Player {
  if (!override) return player;
  const resolved: Player = { ...player };
  for (const [key, delta] of Object.entries(override.drift) as Array<[DriftKey, number | undefined]>) {
    if (!delta) continue;
    resolved[key] = clampAttribute((player[key] ?? 70) + delta);
  }
  for (const [key, delta] of Object.entries(override.training ?? {}) as Array<[keyof NonNullable<PlayerOverride['training']>, number | undefined]>) {
    if (!delta) continue;
    resolved[key] = clampAttribute((resolved[key] ?? 70) + delta);
  }
  return resolved;
}

import type { Player } from './types';

export interface OrganizationRosterView {
  id: string;
  name: string;
  avatar: string;
  eyebrow: string;
  subtitle: string;
  tags: string[];
  roster: Player[];
  stats: Array<{ key: string; value: number }>;
}

export function getLineupStrengths(players: Player[]) {
  if (!players.length) return [];
  return ['firepower', 'support', 'consistency', 'mental', 'clutch', 'entry']
    .map((key) => ({
      key,
      value: Math.round(players.reduce((sum, player) => sum + Number(player[key as keyof Player] ?? 70), 0) / players.length)
    }))
    .sort((left, right) => right.value - left.value);
}

export function averageOverall(players: Player[], fallback = 0) {
  if (!players.length) return Math.round(fallback);
  return Math.round(players.reduce((sum, player) => sum + Number(player.overall ?? 70), 0) / players.length);
}

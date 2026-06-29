import { getEligibleSlotRoles } from './roleRules';
import type { LineupSlotRole, Player } from './types';

export const RANKING_ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'rifler', 'lurker', 'support'];

const rarityScore: Record<string, number> = {
  goat: 6,
  legend: 5,
  superstar: 4,
  elite: 3,
  rare: 2,
  common: 1
};

export const sortPlayersByOverall = (left: Player, right: Player) =>
  Number(right.overall ?? 0) - Number(left.overall ?? 0) ||
  Number(right.year ?? 0) - Number(left.year ?? 0) ||
  (rarityScore[(right.rarity ?? '').toLowerCase()] ?? 0) - (rarityScore[(left.rarity ?? '').toLowerCase()] ?? 0) ||
  (left.nickname ?? left.id).localeCompare(right.nickname ?? right.id);

export const playerMatchesRole = (player: Player, role: LineupSlotRole) => getEligibleSlotRoles(player).includes(role);

export const topPlayersByRole = (players: Player[], role: LineupSlotRole, limit = 10) =>
  players.filter((player) => playerMatchesRole(player, role)).sort(sortPlayersByOverall).slice(0, limit);

export const isHltvTop20 = (player: Player) => (player.badges ?? []).some((badge) => badge.includes('hltv-top20'));

export const hasMajorAward = (player: Player) =>
  (player.badges ?? []).some((badge) => badge.includes('major-mvp') || badge.includes('major-evp')) ||
  (player.awardBadges ?? []).some((award) => /MVP|EVP/i.test(award));

export const isMajorChampion = (player: Player) => (player.badges ?? []).includes('major-champion');

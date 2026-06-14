import type { OrgStyle, Player } from './types';

export function getPlayerPlaystyle(player: Player): OrgStyle {
  if (player.playstyle) return player.playstyle;
  if ((player.firepower ?? 0) >= 92 || (player.entry ?? 0) >= 92) return 'aggressive';
  if ((player.igl ?? 0) >= 80 || (player.support ?? 0) >= 90) return 'tactical';
  return 'balanced';
}

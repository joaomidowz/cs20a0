import playersJson from '$lib/data/cs/players.game.json';
import teamsJson from '$lib/data/cs/teams.game.json';
import type { HistoricalTeam, Player } from './types';

export const players = playersJson as Player[];
export const teams = teamsJson as HistoricalTeam[];
export const playerById = new Map(players.map((player) => [player.id, player]));
export const teamById = new Map(teams.map((team) => [team.id, team]));

export const getTeamPlayers = (team: HistoricalTeam | null) =>
  (team?.players ?? []).map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));

export const playerTitle = (player: Player) => {
  if (player.title) return player.title;
  const role = (player.role ?? '').toLowerCase();
  if (role.includes('awp')) return 'AWPer';
  if (role.includes('igl')) return 'Capitão';
  if (role.includes('support')) return 'Suporte';
  return 'Rifler';
};

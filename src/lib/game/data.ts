import { getAllPlayers, getAllTeams, getPlayerById, getPlayersByTeam, getTeamById } from '$lib/data/csData';
import { buildSecretPlayers } from './online/secret-players';
import type { HistoricalTeam, Player } from './types';

export const players = getAllPlayers();
export const teams = getAllTeams();
/** Secret players of the Resenha queues: resolvable by id, never part of `players` (rankings, pools and the data hash ignore them). */
export const secretPlayers = buildSecretPlayers(players);
export const playerById = new Map([...players, ...secretPlayers].map((player) => [player.id, player]));
export const teamById = new Map(teams.map((team) => [team.id, team]));

export const getTeamPlayers = (team: HistoricalTeam | null) =>
  team ? getPlayersByTeam(team.id).filter((player): player is Player => Boolean(player)) : [];

export { getAllPlayers, getAllTeams, getPlayerById, getPlayersByTeam, getTeamById };

export const playerTitle = (player: Player) => {
  if (player.title) return player.title;
  const role = (player.role ?? '').toLowerCase();
  if (role.includes('awp')) return 'roleAwper';
  if (role.includes('igl')) return 'roleIgl';
  if (role.includes('support')) return 'roleSupport';
  return 'roleRifler';
};

import players from '$lib/data/cs/players.game.json';
import teams from '$lib/data/cs/teams.game.json';
import type { HistoricalTeam, Player } from '$lib/game/types';

const allPlayers = players as Player[];
const allTeams = teams as HistoricalTeam[];
const playerById = new Map(allPlayers.map((player) => [player.id, player]));
const teamById = new Map(allTeams.map((team) => [team.id, team]));

export function getAllPlayers() {
  return allPlayers;
}

export function getAllTeams() {
  return allTeams;
}

export function getPlayersByTeam(teamId: string) {
  const team = teamById.get(teamId);
  if (team?.players?.length) {
    return team.players.map((id) => playerById.get(id)).filter((player): player is Player => Boolean(player));
  }
  return allPlayers.filter((player) => player.teamId === teamId);
}

export function getPlayerById(id: string) {
  return playerById.get(id);
}

export function getTeamById(id: string) {
  return teamById.get(id);
}

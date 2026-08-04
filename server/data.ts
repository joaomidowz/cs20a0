import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { ONLINE_DATA_HASH } from '../src/lib/game/online/dataset';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

export const players = playersJson as Player[];
export const teams = teamsJson as HistoricalTeam[];
export const playerById = new Map(players.map((player) => [player.id, player]));
export { ONLINE_DATA_HASH };

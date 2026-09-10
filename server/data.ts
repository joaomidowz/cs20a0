import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { ONLINE_DATA_HASH } from '../src/lib/game/online/dataset';
import { buildSecretPlayers } from '../src/lib/game/online/secret-players';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

export const players = playersJson as Player[];
export const teams = teamsJson as HistoricalTeam[];
/** Secret players of the Resenha queues: resolvable by id, never part of `players` (pools and the data hash ignore them). */
export const secretPlayers = buildSecretPlayers(players);
export const playerById = new Map([...players, ...secretPlayers].map((player) => [player.id, player]));
export { ONLINE_DATA_HASH };

import corePlayersJson from '../../data/cs/players.game.json';
import coreTeamsJson from '../../data/cs/teams.game.json';
import coreCoachesJson from '../../data/cs/coaches.game.json';
import expansionPlayersJson from '../../data/cs/players.expansion.game.json';
import expansionTeamsJson from '../../data/cs/teams.expansion.game.json';
import expansionCoachesJson from '../../data/cs/coaches.expansion.game.json';
import type { Coach, HistoricalTeam, Player } from '../types';

/**
 * Card pool of the online collection: every player and coach from 2013 on (core + the 2013–2015 expansion).
 * The only online module allowed to read the expansion and the coaches (tests/catalogGuards.test.ts). Rooms keep
 * drafting from the frozen core (`server/data.ts`, ONLINE_DATA_HASH); this pool only resolves collection cards.
 */
const byId = <T extends { id: string }>(lists: T[][]) => {
  const map = new Map<string, T>();
  for (const list of lists) for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
  return map;
};

export const collectionPlayerById = byId([corePlayersJson as Player[], expansionPlayersJson as Player[]]);
export const collectionPlayers: Player[] = [...collectionPlayerById.values()];
export const collectionTeamById = byId([coreTeamsJson as HistoricalTeam[], expansionTeamsJson as HistoricalTeam[]]);
export const collectionTeams: HistoricalTeam[] = [...collectionTeamById.values()];
/** Placeholder coaches (no confirmed person) never become cards. */
export const collectionCoachById = byId([(coreCoachesJson as Coach[]), (expansionCoachesJson as Coach[])].map((list) => list.filter((coach) => coach.confidence !== 'placeholder')));
export const collectionCoaches: Coach[] = [...collectionCoachById.values()];

export const isCoachCardId = (id: string) => collectionCoachById.has(id);
export const COLLECTION_YEARS: number[] = [...new Set(collectionPlayers.map((player) => player.year).filter((year): year is number => Boolean(year)))].sort((a, b) => a - b);

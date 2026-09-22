import corePlayersJson from '../../data/cs/players.game.json';
import coreTeamsJson from '../../data/cs/teams.game.json';
import coreCoachesJson from '../../data/cs/coaches.game.json';
import expansionPlayersJson from '../../data/cs/players.expansion.game.json';
import expansionTeamsJson from '../../data/cs/teams.expansion.game.json';
import expansionCoachesJson from '../../data/cs/coaches.expansion.game.json';
import type { Coach, HistoricalTeam, Player } from '../types';
import { TEAM_PACK_PRICES, type TeamPackRarity } from './collection-rules';

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
export const collectionOrganizationKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const TEAM_PACK_RARITY_RANK: Readonly<Record<TeamPackRarity, number>> = { standard: 0, elite: 1, legendary: 2 };
const historicalTeamPackRarity = (team: HistoricalTeam): TeamPackRarity => {
  if (team.rarity?.toLowerCase() === 'legendary' || ['champion', 'S', 'S+'].includes(team.tier ?? '')) return 'legendary';
  if (team.rarity?.toLowerCase() === 'elite' || ['contender', 'finalist'].includes(team.tier ?? '')) return 'elite';
  return 'standard';
};
/** Organizations across every era, for packs that let the player choose one badge and draw any of its years. */
export const collectionOrganizations: Array<{ key: string; name: string; teamIds: string[]; rarity: TeamPackRarity; price: number }> = [...collectionTeams.reduce((map, team) => {
  const name = team.name ?? team.id;
  const key = collectionOrganizationKey(name);
  const rarity = historicalTeamPackRarity(team);
  const current = map.get(key) ?? { key, name, teamIds: [] as string[], rarity };
  current.teamIds.push(team.id);
  if (TEAM_PACK_RARITY_RANK[rarity] > TEAM_PACK_RARITY_RANK[current.rarity]) current.rarity = rarity;
  map.set(key, current);
  return map;
}, new Map<string, { key: string; name: string; teamIds: string[]; rarity: TeamPackRarity }>()).values()]
  .map((organization) => ({ ...organization, price: TEAM_PACK_PRICES[organization.rarity] }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const collectionOrganizationByKey = new Map(collectionOrganizations.map((organization) => [organization.key, organization]));
/** Placeholder coaches (no confirmed person) never become cards. */
export const collectionCoachById = byId([(coreCoachesJson as Coach[]), (expansionCoachesJson as Coach[])].map((list) => list.filter((coach) => coach.confidence !== 'placeholder')));
export const collectionCoaches: Coach[] = [...collectionCoachById.values()];

export const isCoachCardId = (id: string) => collectionCoachById.has(id);
export const COLLECTION_YEARS: number[] = [...new Set(collectionPlayers.map((player) => player.year).filter((year): year is number => Boolean(year)))].sort((a, b) => a - b);

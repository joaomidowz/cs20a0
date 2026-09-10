import { topPlayersByRole } from '../playerRankings';
import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import type { LineupSlotRole, OnlineGameMode, Player } from '../types';
import type { DraftState } from './draft';

/**
 * Secret players for friends, only in the Resenha queues (`fun` / `max_fun`).
 *
 * Typing one of the aliases as the player name or the organization name brings a synthesized player into the lineup:
 * a clone of the N-th best player of a role in the dataset (the order of the rankings page), renamed to the alias.
 * The organization "Vargão Academy" may instead pick up to three of them by hand. Nothing is added to the data files:
 * the clones are built at runtime on the client and on the server from the same dataset, so the data hash is unchanged.
 */
export interface SecretAlias {
  alias: string;
  slug: string;
  role: LineupSlotRole;
  /** 1 = best of the role, 2 = second best, and so on. */
  rank: number;
  /** Positions the alias can be drafted in; a single one unless stated (Vargas also plays AWPer). */
  roles?: LineupSlotRole[];
  /** Overall shown and simulated for the clone (the source's attributes stay). */
  overall: number;
}

export const SECRET_ORGANIZATION_NAME = 'Vargão Academy';
export const SECRET_ORGANIZATION_PICKS = 3;
export const SECRET_ID_PREFIX = 'secret-';

export const SECRET_ALIASES: SecretAlias[] = [
  { alias: 'Raf4Moon', slug: 'raf4moon', role: 'rifler', rank: 1, overall: 98 },
  { alias: 'Th4natos', slug: 'th4natos', role: 'awper', rank: 10, overall: 97 },
  { alias: 'Midowz', slug: 'midowz', role: 'lurker', rank: 1, overall: 98 },
  { alias: 'Vargas', slug: 'vargas', role: 'igl', rank: 1, roles: ['igl', 'awper'], overall: 99 },
  { alias: 'MonesyPrime', slug: 'monesyprime', role: 'entry', rank: 1, overall: 98 },
  { alias: 'H1ro', slug: 'h1ro', role: 'awper', rank: 2, overall: 97 },
  { alias: 'Caiozera', slug: 'caiozera', role: 'rifler', rank: 5, overall: 97 },
  { alias: 'Gveds', slug: 'gveds', role: 'lurker', rank: 1, overall: 98 }
];

/** Accent- and punctuation-insensitive comparison, so "Vargao academy" and "VARGÃO ACADEMY" both match. */
export const normalizeSecretName = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

export const isSecretMode = (mode: OnlineGameMode) => mode === 'fun' || mode === 'max_fun';
export const isSecretOrganization = (organizationName: string) => normalizeSecretName(organizationName) === normalizeSecretName(SECRET_ORGANIZATION_NAME);
export const findSecretAlias = (name: string): SecretAlias | null =>
  SECRET_ALIASES.find((entry) => normalizeSecretName(entry.alias) === normalizeSecretName(name)) ?? null;
export const secretPlayerId = (alias: SecretAlias) => `${SECRET_ID_PREFIX}${alias.slug}`;
export const isSecretPlayerId = (id: string) => id.startsWith(SECRET_ID_PREFIX);

/** Clones the source player of every alias: same team, year and attributes, a new id and the alias as nickname. */
export function buildSecretPlayers(players: Player[]): Player[] {
  return SECRET_ALIASES.flatMap((entry) => {
    const source = topPlayersByRole(players, entry.role, entry.rank)[entry.rank - 1];
    if (!source) return [];
    const id = secretPlayerId(entry);
    const roles = entry.roles ?? [entry.role];
    return [{ ...source, id, baseId: id, nickname: entry.alias, role: entry.role, title: null, traits: [], eligibleSlotRoles: roles, overall: entry.overall }];
  });
}

/** Aliases a participant unlocks: the player name first, then the organization name. */
export function secretAliasFor(playerName: string, organizationName: string): SecretAlias | null {
  return findSecretAlias(playerName) ?? findSecretAlias(organizationName);
}

export const secretPicksUsed = (draft: DraftState) => draft.lineup.filter((pick) => isSecretPlayerId(pick.playerId)).length;

/** Picks left for a Vargão Academy participant (0 for everybody else). */
export const secretPicksLeftFor = (mode: OnlineGameMode, organizationName: string, draft: DraftState) =>
  isSecretMode(mode) && isSecretOrganization(organizationName) ? Math.max(0, SECRET_ORGANIZATION_PICKS - secretPicksUsed(draft)) : 0;

/**
 * Pre-fills the alias player into a fresh draft. Vargão Academy gets nothing here: it chooses by hand with
 * `pickSecretPlayer`. Outside the Resenha queues the draft is returned untouched.
 */
export function withSecretPlayers(
  draft: DraftState,
  mode: OnlineGameMode,
  playerName: string,
  organizationName: string,
  lookup: (id: string) => Player | undefined
): DraftState {
  if (!isSecretMode(mode) || isSecretOrganization(organizationName)) return draft;
  const alias = secretAliasFor(playerName, organizationName);
  if (!alias) return draft;
  const player = lookup(secretPlayerId(alias));
  if (!player || draft.lineup.some((pick) => pick.playerId === player.id)) return draft;
  const role = getEligibleSlotRoles(player).includes(alias.role) ? alias.role : getEligibleSlotRoles(player)[0] ?? alias.role;
  return { ...draft, lineup: [...draft.lineup, { playerId: player.id, selectedSlotRole: role }] };
}

export class SecretPickError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretPickError';
  }
}

/** Adds one of the aliases to a Vargão Academy lineup (at most three, one slot each, free roles). */
export function pickSecretPlayer(
  draft: DraftState,
  mode: OnlineGameMode,
  organizationName: string,
  alias: SecretAlias,
  player: Player,
  role: LineupSlotRole,
  lookup: (id: string) => Player | undefined,
  secondaryRole?: LineupSlotRole
): DraftState {
  if (!isSecretMode(mode)) throw new SecretPickError('Secret players only exist in the Resenha queues');
  if (!isSecretOrganization(organizationName)) throw new SecretPickError('Only Vargão Academy chooses its secret players');
  if (secretPicksUsed(draft) >= SECRET_ORGANIZATION_PICKS) throw new SecretPickError('No secret pick left');
  if (draft.lineup.length >= 5) throw new SecretPickError('Lineup is already complete');
  if (player.id !== secretPlayerId(alias)) throw new SecretPickError('Unknown secret player');
  const validation = validatePlayerPick(player, draft.lineup, role, lookup, { unlimitedRoles: true });
  if (!validation.ok) throw new SecretPickError(validation.reason ?? 'Invalid secret pick');
  if (secondaryRole && (secondaryRole === role || !getEligibleSlotRoles(player).includes(secondaryRole))) throw new SecretPickError('Invalid secondary role');
  return { ...draft, lineup: [...draft.lineup, { playerId: player.id, selectedSlotRole: role, ...(secondaryRole ? { secondarySlotRole: secondaryRole } : {}) }] };
}

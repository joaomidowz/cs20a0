import { topPlayersByRole } from '../playerRankings';
import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import type { LineupSlotRole, OnlineGameMode, Player } from '../types';
import type { DraftState } from './draft';

/**
 * Secret players for friends, only in the Resenha queues (`fun` / `max_fun`).
 *
 * Typing one of the aliases as the player name or the organization name brings a synthesized player into the lineup:
 * a clone of the N-th best player of a role in the dataset (the order of the rankings page), renamed to the alias.
 * The organization "Vargão Academy" may instead pick up to three of its own pool by hand, and "PolexTV" starts with
 * its whole five-player team. Nothing is added to the data files: the clones are built at runtime on the client and on
 * the server from the same dataset, so the data hash is unchanged.
 */
export type SecretOrganizationId = 'vargao' | 'polextv';

export interface SecretOrganization {
  id: SecretOrganizationId;
  name: string;
  /** 'pick': the organization chooses up to `picks` aliases of its pool; 'team': its whole pool is the lineup. */
  kind: 'pick' | 'team';
  picks: number;
}

export interface SecretAlias {
  alias: string;
  slug: string;
  organization: SecretOrganizationId;
  role: LineupSlotRole;
  /** 1 = best of the role, 2 = second best, and so on. */
  rank: number;
  /** Positions the alias can be drafted in; a single one unless stated (Vargas also plays AWPer). */
  roles?: LineupSlotRole[];
  /** Overall shown and simulated for the clone (the source's attributes stay unless overridden). */
  overall: number;
  attributes?: Partial<Pick<Player, 'mental' | 'igl' | 'firepower' | 'awp' | 'entry' | 'support' | 'clutch' | 'consistency' | 'experience'>>;
}

export const SECRET_ORGANIZATIONS: SecretOrganization[] = [
  { id: 'vargao', name: 'Vargão Academy', kind: 'pick', picks: 3 },
  { id: 'polextv', name: 'PolexTV', kind: 'team', picks: 5 }
];
export const SECRET_ORGANIZATION_NAME = SECRET_ORGANIZATIONS[0].name;
export const SECRET_ORGANIZATION_PICKS = SECRET_ORGANIZATIONS[0].picks;
export const SECRET_ID_PREFIX = 'secret-';

export const SECRET_ALIASES: SecretAlias[] = [
  // Vargão Academy pool.
  { alias: 'Raf4Moon', slug: 'raf4moon', organization: 'vargao', role: 'rifler', rank: 1, overall: 98 },
  { alias: 'Th4natos', slug: 'th4natos', organization: 'vargao', role: 'awper', rank: 10, overall: 97 },
  { alias: 'Midowz', slug: 'midowz', organization: 'vargao', role: 'lurker', rank: 1, overall: 98 },
  { alias: 'Vargas', slug: 'vargas', organization: 'vargao', role: 'igl', rank: 1, roles: ['igl', 'awper'], overall: 99 },
  { alias: 'MonesyPrime', slug: 'monesyprime', organization: 'vargao', role: 'entry', rank: 1, overall: 98 },
  { alias: 'H1ro', slug: 'h1ro', organization: 'vargao', role: 'awper', rank: 2, overall: 97 },
  { alias: 'Caiozera', slug: 'caiozera', organization: 'vargao', role: 'rifler', rank: 5, overall: 97 },
  { alias: 'Gveds', slug: 'gveds', organization: 'vargao', role: 'lurker', rank: 1, overall: 98 },
  { alias: 'Kavzera', slug: 'kavzera', organization: 'vargao', role: 'awper', rank: 1, overall: 99 },
  { alias: 'Andi', slug: 'andi', organization: 'vargao', role: 'rifler', rank: 2, overall: 96 },
  { alias: 'Potassio', slug: 'potassio', organization: 'vargao', role: 'rifler', rank: 3, overall: 98 },
  { alias: 'ntc', slug: 'ntc', organization: 'vargao', role: 'igl', rank: 2, overall: 89, attributes: { mental: 20 } },
  // PolexTV: a whole hidden team.
  { alias: 'Polex', slug: 'polex', organization: 'polextv', role: 'awper', rank: 3, overall: 99 },
  { alias: 'Caps', slug: 'caps', organization: 'polextv', role: 'rifler', rank: 4, overall: 99 },
  { alias: 'Paulinhho', slug: 'paulinhho', organization: 'polextv', role: 'entry', rank: 2, overall: 99 },
  { alias: 'Nerdzito', slug: 'nerdzito', organization: 'polextv', role: 'support', rank: 1, overall: 99 },
  { alias: 'Breitan', slug: 'breitan', organization: 'polextv', role: 'lurker', rank: 2, overall: 99 }
];

/** Accent- and punctuation-insensitive comparison, so "Vargao academy" and "VARGÃO ACADEMY" both match. */
export const normalizeSecretName = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

export const isSecretMode = (mode: OnlineGameMode) => mode === 'fun' || mode === 'max_fun';
export const findSecretOrganization = (organizationName: string): SecretOrganization | null =>
  SECRET_ORGANIZATIONS.find((entry) => normalizeSecretName(entry.name) === normalizeSecretName(organizationName)) ?? null;
export const isSecretOrganization = (organizationName: string) => findSecretOrganization(organizationName) !== null;
/** Aliases an organization draws from (its pool). */
export const secretPoolOf = (organizationName: string): SecretAlias[] => {
  const organization = findSecretOrganization(organizationName);
  return organization ? SECRET_ALIASES.filter((entry) => entry.organization === organization.id) : [];
};
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
    return [{ ...source, id, baseId: id, nickname: entry.alias, role: entry.role, title: null, traits: [], eligibleSlotRoles: roles, overall: entry.overall, ...(entry.attributes ?? {}) }];
  });
}

/** Aliases a participant unlocks: the player name first, then the organization name. */
export function secretAliasFor(playerName: string, organizationName: string): SecretAlias | null {
  return findSecretAlias(playerName) ?? findSecretAlias(organizationName);
}

export const secretPicksUsed = (draft: DraftState) => draft.lineup.filter((pick) => isSecretPlayerId(pick.playerId)).length;

/** Picks left for an organization that chooses its secret players by hand (0 for everybody else). */
export const secretPicksLeftFor = (mode: OnlineGameMode, organizationName: string, draft: DraftState) => {
  const organization = findSecretOrganization(organizationName);
  return isSecretMode(mode) && organization?.kind === 'pick' ? Math.max(0, organization.picks - secretPicksUsed(draft)) : 0;
};

/**
 * Pre-fills the secret players of a fresh draft: a whole team for a 'team' organization, one alias for a player or
 * organization named after it. A 'pick' organization (Vargão Academy) gets nothing here: it chooses by hand with
 * `pickSecretPlayer`. Outside the Resenha queues the draft is returned untouched.
 */
export function withSecretPlayers(
  draft: DraftState,
  mode: OnlineGameMode,
  playerName: string,
  organizationName: string,
  lookup: (id: string) => Player | undefined
): DraftState {
  if (!isSecretMode(mode)) return draft;
  const organization = findSecretOrganization(organizationName);
  if (organization?.kind === 'pick') return draft;
  const aliases = organization?.kind === 'team' ? secretPoolOf(organizationName) : [secretAliasFor(playerName, organizationName)].filter((entry): entry is SecretAlias => entry !== null);
  let lineup = [...draft.lineup];
  for (const alias of aliases) {
    const player = lookup(secretPlayerId(alias));
    if (!player || lineup.length >= 5 || lineup.some((pick) => pick.playerId === player.id)) continue;
    const role = getEligibleSlotRoles(player).includes(alias.role) ? alias.role : getEligibleSlotRoles(player)[0] ?? alias.role;
    lineup = [...lineup, { playerId: player.id, selectedSlotRole: role }];
  }
  return lineup.length === draft.lineup.length ? draft : { ...draft, lineup };
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
  const organization = findSecretOrganization(organizationName);
  if (organization?.kind !== 'pick') throw new SecretPickError('Only Vargão Academy chooses its secret players');
  if (alias.organization !== organization.id) throw new SecretPickError('That player belongs to another secret team');
  if (secretPicksUsed(draft) >= organization.picks) throw new SecretPickError('No secret pick left');
  if (draft.lineup.length >= 5) throw new SecretPickError('Lineup is already complete');
  if (player.id !== secretPlayerId(alias)) throw new SecretPickError('Unknown secret player');
  const validation = validatePlayerPick(player, draft.lineup, role, lookup, { unlimitedRoles: true });
  if (!validation.ok) throw new SecretPickError(validation.reason ?? 'Invalid secret pick');
  if (secondaryRole && (secondaryRole === role || !getEligibleSlotRoles(player).includes(secondaryRole))) throw new SecretPickError('Invalid secondary role');
  return { ...draft, lineup: [...draft.lineup, { playerId: player.id, selectedSlotRole: role, ...(secondaryRole ? { secondarySlotRole: secondaryRole } : {}) }] };
}

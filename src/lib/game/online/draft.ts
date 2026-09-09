import { getProRoleFit, PRO_REQUIRED_ROLES, validateProAssignments } from '../proMode';
import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import { createSeededRng } from '../simulation';
import type { HistoricalTeam, LineupSlotRole, MapId, OrgStyle, Player, SelectedPlayer } from '../types';
import type { OnlineGameMode } from './contracts';
import { pickDraftTeam } from './draft-pool';

export const MAX_LINEUP_SIZE = 5;

/** Every online mode except PRO drafts with free roles: any composition, plus optional dual positions. */
export const hasFreeRoles = (mode: OnlineGameMode): boolean => mode !== 'pro';

export interface DraftState {
  lineup: SelectedPlayer[];
  proPickedPlayerIds: string[];
  proRoleAssignments: Record<string, LineupSlotRole | null>;
  style: OrgStyle | null;
  usedTeamIds: string[];
  rolledTeamId: string | null;
  rerollsUsed: number;
  mapPreferences: MapId[];
}

export const emptyDraftState = (): DraftState => ({
  lineup: [],
  proPickedPlayerIds: [],
  proRoleAssignments: {},
  style: null,
  usedTeamIds: [],
  rolledTeamId: null,
  rerollsUsed: 0,
  mapPreferences: []
});

export const getRerollLimit = (mode: OnlineGameMode): number => mode === 'premier' ? 3 : 1;

const pickIndex = (state: DraftState, mode: OnlineGameMode) => mode === 'pro' ? state.proPickedPlayerIds.length : state.lineup.length;

export function drawDraftTeam(
  roomSeed: string,
  participantId: string,
  mode: OnlineGameMode,
  state: DraftState,
  teams: HistoricalTeam[],
  players: Player[],
  reroll = false
): DraftState {
  if (pickIndex(state, mode) >= MAX_LINEUP_SIZE) throw new Error('Lineup is already complete');
  if (!reroll && state.rolledTeamId) throw new Error('A draft offer is already active');
  if (reroll && (!state.rolledTeamId || state.rerollsUsed >= getRerollLimit(mode))) throw new Error('Reroll is not available');
  const rerollsUsed = state.rerollsUsed + (reroll ? 1 : 0);
  const excluded = reroll && state.rolledTeamId
    ? [...state.usedTeamIds, state.rolledTeamId]
    : state.usedTeamIds;
  const namespace = `${roomSeed}:${participantId}:${pickIndex(state, mode)}:${rerollsUsed}`;
  const team = pickDraftTeam(mode, teams, players, createSeededRng(namespace), excluded);
  return { ...state, rolledTeamId: team.id, rerollsUsed };
}

export function chooseDraftPlayer(
  mode: OnlineGameMode,
  state: DraftState,
  player: Player,
  role: LineupSlotRole | undefined,
  playerLookup: (id: string) => Player | undefined,
  secondaryRole?: LineupSlotRole
): DraftState {
  if (!state.rolledTeamId || player.teamId !== state.rolledTeamId) throw new Error('Player is not in the current offer');
  if (mode === 'pro') {
    if (state.proPickedPlayerIds.length >= MAX_LINEUP_SIZE) throw new Error('Lineup is already complete');
    if (state.proPickedPlayerIds.includes(player.id)) throw new Error('Player is already selected');
    return {
      ...state,
      proPickedPlayerIds: [...state.proPickedPlayerIds, player.id],
      proRoleAssignments: { ...state.proRoleAssignments, [player.id]: null },
      usedTeamIds: [...state.usedTeamIds, state.rolledTeamId],
      rolledTeamId: null
    };
  }
  const validation = validatePlayerPick(player, state.lineup, role, playerLookup, { unlimitedRoles: hasFreeRoles(mode) });
  if (!validation.ok || !role) throw new Error(validation.reason ?? 'Invalid player pick');
  if (secondaryRole && (secondaryRole === role || !getEligibleSlotRoles(player).includes(secondaryRole))) throw new Error('Invalid secondary role');
  return {
    ...state,
    lineup: [...state.lineup, { playerId: player.id, selectedSlotRole: role, ...(secondaryRole ? { secondarySlotRole: secondaryRole } : {}) }],
    usedTeamIds: [...state.usedTeamIds, state.rolledTeamId],
    rolledTeamId: null
  };
}

const fitScore = (player: Player, role: LineupSlotRole): number => {
  const fit = getProRoleFit(player, role);
  const fitValue = fit === 'primary' ? 400 : fit === 'secondary' ? 250 : fit === 'incompatible' ? 80 : 0;
  const attribute = role === 'awper' ? player.awp : role === 'igl' ? player.igl : role === 'entry' ? player.entry : role === 'support' ? player.support : role === 'lurker' ? player.clutch : player.firepower;
  return fitValue + Number(attribute ?? 0);
};

export interface DraftHistory {
  /** Positive values mean this base player has worked well for this user before. */
  playerScores?: Record<string, number>;
  roleScores?: Partial<Record<LineupSlotRole, number>>;
}

export interface AutomaticDraftPick {
  player: Player;
  role?: LineupSlotRole;
  score: number;
}

const visibleNumber = (value: number | null | undefined, fallback = 65) => Number.isFinite(value) ? Number(value) : fallback;

/**
 * Scores an offer from only the information visible in the selected queue. PRO is deliberately blind:
 * overall and every skill attribute are ignored until reveal.
 */
export function scoreDraftCandidate(options: {
  player: Player;
  role?: LineupSlotRole;
  mode: OnlineGameMode;
  style: OrgStyle;
  lineup: SelectedPlayer[];
  history?: DraftHistory;
  seed: string;
}): number {
  const baseId = (options.player.baseId?.trim() || options.player.id).replace(/[-_\s]?(?:19|20)\d{2}$/i, '').toLowerCase();
  const personal = Math.max(-4, Math.min(4, options.history?.playerScores?.[baseId] ?? 0));
  const jitter = (createSeededRng(`${options.seed}:${options.player.id}:${options.role ?? 'blind'}`)() - .5) * 3.2;
  if (options.mode === 'pro') return personal + jitter;
  const player = options.player;
  const styleScore = options.style === 'aggressive'
    ? visibleNumber(player.firepower) * .28 + visibleNumber(player.entry) * .24 + visibleNumber(player.mental) * .08
    : options.style === 'tactical'
      ? visibleNumber(player.igl, 35) * .2 + visibleNumber(player.support) * .2 + visibleNumber(player.mental) * .16
      : visibleNumber(player.overall) * .28 + visibleNumber(player.consistency) * .18 + visibleNumber(player.clutch) * .12;
  const roleAttribute = options.role === 'awper' ? player.awp : options.role === 'igl' ? player.igl : options.role === 'entry' ? player.entry
    : options.role === 'support' ? player.support : options.role === 'lurker' ? player.clutch : player.firepower;
  const currentRoles = new Set(options.lineup.map((pick) => pick.selectedSlotRole));
  const composition = options.role && !currentRoles.has(options.role) ? 6 : options.role === 'rifler' ? 0 : -1.5;
  const history = personal + (options.role ? options.history?.roleScores?.[options.role] ?? 0 : 0);
  return styleScore + visibleNumber(player.overall) * .34 + visibleNumber(roleAttribute) * .18 + composition + history + jitter;
}

export function chooseAutomaticDraftPick(options: {
  roster: Player[];
  mode: OnlineGameMode;
  state: DraftState;
  style?: OrgStyle;
  history?: DraftHistory;
  seed: string;
  playerLookup: (id: string) => Player | undefined;
}): AutomaticDraftPick | null {
  const style = options.style ?? options.state.style ?? 'balanced';
  const candidates: AutomaticDraftPick[] = [];
  for (const player of options.roster) {
    if (options.mode === 'pro') {
      if (!options.state.proPickedPlayerIds.includes(player.id)) candidates.push({ player, score: scoreDraftCandidate({ player, mode: options.mode, style, lineup: options.state.lineup, history: options.history, seed: options.seed }) });
      continue;
    }
    for (const role of getEligibleSlotRoles(player)) {
      if (!validatePlayerPick(player, options.state.lineup, role, options.playerLookup, { unlimitedRoles: hasFreeRoles(options.mode) }).ok) continue;
      candidates.push({ player, role, score: scoreDraftCandidate({ player, role, mode: options.mode, style, lineup: options.state.lineup, history: options.history, seed: options.seed }) });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.player.id.localeCompare(right.player.id) || (left.role ?? '').localeCompare(right.role ?? ''));
  if (!candidates.length) return null;
  // Seeded imperfection: when choices are within 2.5 points, occasionally use the runner-up.
  const near = candidates.filter((candidate) => candidates[0].score - candidate.score <= 2.5).slice(0, 3);
  const rng = createSeededRng(`${options.seed}:near-choice`);
  return near.length > 1 && rng() < .28 ? near[1 + Math.floor(rng() * (near.length - 1))] : near[0];
}

export function shouldAutomaticReroll(options: {
  bestOfferScore: number;
  mode: OnlineGameMode;
  rerollsUsed: number;
  pickIndex: number;
  seed: string;
}): boolean {
  if (options.rerollsUsed >= getRerollLimit(options.mode)) return false;
  // Expected offer declines slightly near the end because fewer team-years remain.
  const expected = options.mode === 'pro' ? 1.1 : 71 - options.pickIndex * .7;
  const margin = options.mode === 'pro' ? 3.4 : 7;
  const jitter = (createSeededRng(`${options.seed}:reroll`)() - .5) * 1.5;
  return options.bestOfferScore + margin + jitter < expected;
}

export function findBestProAssignments(selected: Player[]): Record<string, LineupSlotRole> {
  if (selected.length !== MAX_LINEUP_SIZE) throw new Error('PRO lineup must contain five players');
  let bestScore = Number.NEGATIVE_INFINITY;
  let best: Record<string, LineupSlotRole> | null = null;
  const search = (index: number, used: Set<LineupSlotRole>, current: Record<string, LineupSlotRole>, score: number) => {
    if (index === selected.length) {
      if (score > bestScore) {
        bestScore = score;
        best = { ...current };
      }
      return;
    }
    const player = selected[index];
    for (const role of PRO_REQUIRED_ROLES) {
      if (used.has(role)) continue;
      used.add(role);
      current[player.id] = role;
      search(index + 1, used, current, score + fitScore(player, role));
      used.delete(role);
      delete current[player.id];
    }
  };
  search(0, new Set(), {}, 0);
  if (!best || !validateProAssignments(best, selected.map((player) => player.id)).complete) throw new Error('Could not assign PRO roles');
  return best;
}

/** Fills only the roles that are still unassigned, never replacing a role the participant already chose. */
export function completeProAssignments(selected: Player[], chosen: Record<string, LineupSlotRole | null>): Record<string, LineupSlotRole> {
  if (selected.length !== MAX_LINEUP_SIZE) throw new Error('PRO lineup must contain five players');
  const fixed: Record<string, LineupSlotRole> = {};
  const usedRoles = new Set<LineupSlotRole>();
  for (const player of selected) {
    const role = chosen[player.id];
    if (!role || !PRO_REQUIRED_ROLES.includes(role) || usedRoles.has(role)) continue;
    fixed[player.id] = role;
    usedRoles.add(role);
  }
  const remainingPlayers = selected.filter((player) => !fixed[player.id]);
  const remainingRoles = PRO_REQUIRED_ROLES.filter((role) => !usedRoles.has(role));
  let bestScore = Number.NEGATIVE_INFINITY;
  let best: Record<string, LineupSlotRole> | null = null;
  const search = (index: number, used: Set<LineupSlotRole>, current: Record<string, LineupSlotRole>, score: number) => {
    if (index === remainingPlayers.length) {
      if (score > bestScore) {
        bestScore = score;
        best = { ...current };
      }
      return;
    }
    const player = remainingPlayers[index];
    for (const role of remainingRoles) {
      if (used.has(role)) continue;
      used.add(role);
      current[player.id] = role;
      search(index + 1, used, current, score + fitScore(player, role));
      used.delete(role);
      delete current[player.id];
    }
  };
  search(0, new Set(), {}, 0);
  const assignments = { ...fixed, ...(best ?? {}) };
  if (!validateProAssignments(assignments, selected.map((player) => player.id)).complete) return findBestProAssignments(selected);
  return assignments;
}

const firstValidPick = (teamPlayers: Player[], lineup: SelectedPlayer[], playerLookup: (id: string) => Player | undefined, unlimitedRoles: boolean) => {
  for (const player of teamPlayers) {
    for (const role of getEligibleSlotRoles(player)) {
      if (validatePlayerPick(player, lineup, role, playerLookup, { unlimitedRoles }).ok) return { player, role };
    }
  }
  return null;
};

export function autocompleteDraft(
  roomSeed: string,
  participantId: string,
  mode: OnlineGameMode,
  initial: DraftState,
  teams: HistoricalTeam[],
  players: Player[]
): DraftState {
  const playerLookup = (id: string) => players.find((player) => player.id === id);
  let state: DraftState = { ...initial, style: initial.style ?? 'balanced' };
  let guard = 0;
  while (pickIndex(state, mode) < MAX_LINEUP_SIZE && guard < teams.length * 3) {
    guard += 1;
    if (!state.rolledTeamId) state = drawDraftTeam(roomSeed, participantId, mode, state, teams, players);
    const offeredTeamId = state.rolledTeamId;
    if (!offeredTeamId) throw new Error('Draft offer was not generated');
    const roster = players.filter((player) => player.teamId === offeredTeamId);
    let automatic = chooseAutomaticDraftPick({ roster, mode, state, seed: `${roomSeed}:${participantId}:${guard}`, playerLookup });
    if (automatic && shouldAutomaticReroll({ bestOfferScore: automatic.score, mode, rerollsUsed: state.rerollsUsed, pickIndex: pickIndex(state, mode), seed: `${roomSeed}:${participantId}:${guard}` })) {
      state = drawDraftTeam(roomSeed, participantId, mode, state, teams, players, true);
      const rerolledRoster = players.filter((player) => player.teamId === state.rolledTeamId);
      automatic = chooseAutomaticDraftPick({ roster: rerolledRoster, mode, state, seed: `${roomSeed}:${participantId}:${guard}:rerolled`, playerLookup });
    }
    if (automatic) state = chooseDraftPlayer(mode, state, automatic.player, automatic.role, playerLookup);
    else state = { ...state, usedTeamIds: [...state.usedTeamIds, offeredTeamId], rolledTeamId: null };
  }
  if (pickIndex(state, mode) !== MAX_LINEUP_SIZE) throw new Error('Could not autocomplete a valid lineup');
  if (mode === 'pro') {
    state = { ...state, style: initial.style };
  }
  return state;
}

export const isDraftComplete = (mode: OnlineGameMode, state: DraftState): boolean =>
  state.lineup.length === MAX_LINEUP_SIZE && state.mapPreferences.length === 3 && (mode !== 'pro' || state.proPickedPlayerIds.length === MAX_LINEUP_SIZE);

import { buildProRoleEvaluations, getProRoleFit, PRO_REQUIRED_ROLES, validateProAssignments } from '../proMode';
import { getEligibleSlotRoles, validatePlayerPick } from '../roleRules';
import { createSeededRng, pickRandomTeam } from '../simulation';
import type { GameMode, HistoricalTeam, LineupSlotRole, OrgStyle, Player, SelectedPlayer } from '../types';

export const MAX_LINEUP_SIZE = 5;

export interface DraftState {
  lineup: SelectedPlayer[];
  proPickedPlayerIds: string[];
  proRoleAssignments: Record<string, LineupSlotRole | null>;
  style: OrgStyle | null;
  usedTeamIds: string[];
  rolledTeamId: string | null;
  rerollsUsed: number;
}

export const emptyDraftState = (): DraftState => ({
  lineup: [],
  proPickedPlayerIds: [],
  proRoleAssignments: {},
  style: null,
  usedTeamIds: [],
  rolledTeamId: null,
  rerollsUsed: 0
});

export const getRerollLimit = (mode: GameMode): number => mode === 'premier' ? 3 : 1;

const pickIndex = (state: DraftState, mode: GameMode) => mode === 'pro' ? state.proPickedPlayerIds.length : state.lineup.length;

export function drawDraftTeam(
  roomSeed: string,
  participantId: string,
  mode: GameMode,
  state: DraftState,
  teams: HistoricalTeam[],
  reroll = false
): DraftState {
  if (pickIndex(state, mode) >= MAX_LINEUP_SIZE) throw new Error('Lineup is already complete');
  if (reroll && (!state.rolledTeamId || state.rerollsUsed >= getRerollLimit(mode))) throw new Error('Reroll is not available');
  const rerollsUsed = state.rerollsUsed + (reroll ? 1 : 0);
  const excluded = reroll && state.rolledTeamId
    ? [...state.usedTeamIds, state.rolledTeamId]
    : state.usedTeamIds;
  const namespace = `${roomSeed}:${participantId}:${pickIndex(state, mode)}:${rerollsUsed}`;
  const team = pickRandomTeam(teams, createSeededRng(namespace), excluded);
  if (!team) throw new Error('No draft team is available');
  return { ...state, rolledTeamId: team.id, rerollsUsed };
}

export function chooseDraftPlayer(
  mode: GameMode,
  state: DraftState,
  player: Player,
  role: LineupSlotRole | undefined,
  playerLookup: (id: string) => Player | undefined
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
  const validation = validatePlayerPick(player, state.lineup, role, playerLookup);
  if (!validation.ok || !role) throw new Error(validation.reason ?? 'Invalid player pick');
  return {
    ...state,
    lineup: [...state.lineup, { playerId: player.id, selectedSlotRole: role }],
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

const firstValidPick = (teamPlayers: Player[], lineup: SelectedPlayer[], playerLookup: (id: string) => Player | undefined) => {
  for (const player of teamPlayers) {
    for (const role of getEligibleSlotRoles(player)) {
      if (validatePlayerPick(player, lineup, role, playerLookup).ok) return { player, role };
    }
  }
  return null;
};

export function autocompleteDraft(
  roomSeed: string,
  participantId: string,
  mode: GameMode,
  initial: DraftState,
  teams: HistoricalTeam[],
  players: Player[]
): DraftState {
  const playerLookup = (id: string) => players.find((player) => player.id === id);
  let state: DraftState = { ...initial, style: initial.style ?? 'balanced' };
  let guard = 0;
  while (pickIndex(state, mode) < MAX_LINEUP_SIZE && guard < teams.length * 3) {
    guard += 1;
    if (!state.rolledTeamId) state = drawDraftTeam(roomSeed, participantId, mode, state, teams);
    const offeredTeamId = state.rolledTeamId;
    if (!offeredTeamId) throw new Error('Draft offer was not generated');
    const roster = players.filter((player) => player.teamId === offeredTeamId);
    if (mode === 'pro') {
      const chosen = roster.find((player) => !state.proPickedPlayerIds.includes(player.id));
      if (chosen) state = chooseDraftPlayer(mode, state, chosen, undefined, playerLookup);
      else state = { ...state, usedTeamIds: [...state.usedTeamIds, offeredTeamId], rolledTeamId: null };
      continue;
    }
    const valid = firstValidPick(roster, state.lineup, playerLookup);
    if (valid) state = chooseDraftPlayer(mode, state, valid.player, valid.role, playerLookup);
    else state = { ...state, usedTeamIds: [...state.usedTeamIds, offeredTeamId], rolledTeamId: null };
  }
  if (pickIndex(state, mode) !== MAX_LINEUP_SIZE) throw new Error('Could not autocomplete a valid lineup');
  if (mode === 'pro') {
    const selected = state.proPickedPlayerIds.map(playerLookup).filter((player): player is Player => Boolean(player));
    const assignments = findBestProAssignments(selected);
    const evaluations = buildProRoleEvaluations(selected, assignments, state.style ?? 'balanced');
    state = { ...state, proRoleAssignments: assignments, lineup: evaluations.map((evaluation) => ({ playerId: evaluation.player.id, selectedSlotRole: evaluation.selectedRole })) };
  }
  return state;
}

export const isDraftComplete = (mode: GameMode, state: DraftState): boolean =>
  state.lineup.length === MAX_LINEUP_SIZE && (mode !== 'pro' || state.proPickedPlayerIds.length === MAX_LINEUP_SIZE);

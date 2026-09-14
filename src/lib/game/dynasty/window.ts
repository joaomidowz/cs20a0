// src/lib/game/dynasty/window.ts
import { getEligibleSlotRoles, getPlayerBaseId, ROLE_LIMITS } from '../roleRules';
import { createSeededRng, type SeededRng } from '../simulation';
import type { Coach, DynastyState, LineupSlotRole, Player, PlayerRunStats, SelectedPlayer, WindowOffer, WindowProposal, WindowState } from '../types';
import { offerCoaches } from './coachOffer';
import { evolveLineup } from './evolution';
import { resolveDynastyPlayer } from './resolve';
import { coachMarketValue, playerMarketValue, roundToStep } from './value';

export const MARKET_SIZE = 10;
export const FOCUS_OFFERS = 4;
export const PROPOSALS = 2;
export const TARGET_MARKUP = 1.25;
export const SALE_WITHOUT_PROPOSAL = 0.7;
export const OVERALL_BAND = 8;

export interface CreateWindowInput {
  /** Dynasty already settled for the Major that just ended. */
  dynasty: DynastyState;
  lineup: SelectedPlayer[];
  stats: PlayerRunStats[];
  /** Seed of the Major that just ended. */
  seed: string;
  /** Players that can be offered or targeted (the dataset, never the secret players). */
  catalog: Player[];
  playerById: Map<string, Player>;
  coaches: Coach[];
  coachById: Map<string, Coach>;
}

export interface IncomingPlayer {
  kind: 'offer' | 'target';
  playerId: string;
}

export type MoveProblem = 'no-moves' | 'not-in-lineup' | 'already-sold' | 'unknown-player' | 'duplicate-player' | 'not-offered' | 'offer-used' | 'target-used' | 'no-cash';

const pickIndex = (rng: SeededRng, length: number) => Math.floor(rng() * length);

export function createWindow(input: CreateWindowInput): WindowState {
  const { dynasty } = input;
  const coach = dynasty.coachId ? input.coachById.get(dynasty.coachId) ?? null : null;
  const evolved = evolveLineup({ lineup: input.lineup, overrides: dynasty.playerOverrides, stats: input.stats, coach, catalog: input.catalog, playerById: input.playerById });
  const rng = createSeededRng(`${input.seed}:window:${dynasty.majorNumber}`);
  const resolved = evolved.lineup.flatMap((selected) => {
    const player = input.playerById.get(selected.playerId);
    return player ? [{ selected, player: resolveDynastyPlayer(player, evolved.overrides[selected.playerId]) }] : [];
  });

  const proposals: WindowProposal[] = [];
  const proposalPool = [...resolved];
  while (proposals.length < PROPOSALS && proposalPool.length) {
    const [entry] = proposalPool.splice(pickIndex(rng, proposalPool.length), 1);
    proposals.push({ playerId: entry.selected.playerId, price: roundToStep(playerMarketValue(entry.player) * (0.85 + rng() * 0.25)) });
  }

  const lineupBaseIds = new Set(resolved.map((entry) => getPlayerBaseId(entry.player)));
  const candidates = input.catalog.filter((player) => !lineupBaseIds.has(getPlayerBaseId(player)));
  const weakest = [...resolved].sort((left, right) => (left.player.overall ?? 70) - (right.player.overall ?? 70))[0];
  const focusRole = weakest?.selected.selectedSlotRole ?? null;
  const average = resolved.reduce((sum, entry) => sum + (entry.player.overall ?? 70), 0) / Math.max(1, resolved.length);
  const offers: WindowOffer[] = [];
  const offered = new Set<string>();
  const draw = (pool: Player[], role: LineupSlotRole | null) => {
    const available = pool.filter((player) => !offered.has(getPlayerBaseId(player)));
    if (!available.length) return false;
    const player = available[pickIndex(rng, available.length)];
    offered.add(getPlayerBaseId(player));
    offers.push({ playerId: player.id, price: roundToStep(playerMarketValue(player) * (0.9 + rng() * 0.25)), focusRole: role });
    return true;
  };
  if (focusRole) {
    const focusPool = candidates.filter((player) => getEligibleSlotRoles(player).includes(focusRole));
    let focusCount = 0;
    while (focusCount < FOCUS_OFFERS && draw(focusPool, focusRole)) focusCount += 1;
  }
  const band = candidates.filter((player) => Math.abs((player.overall ?? 70) - average) <= OVERALL_BAND);
  while (offers.length < MARKET_SIZE && draw(band, null));
  while (offers.length < MARKET_SIZE && draw(candidates, null));

  const excludedTeams = [...resolved.flatMap((entry) => (entry.player.teamId ? [entry.player.teamId] : [])), ...(coach ? [coach.teamId] : [])];
  const coachOfferIds = offerCoaches(input.coaches, `${input.seed}:window:${dynasty.majorNumber}`, excludedTeams)
    .filter((item) => item.baseId !== coach?.baseId)
    .map((item) => item.id);

  return {
    majorNumber: dynasty.majorNumber,
    seed: input.seed,
    cashAtOpen: dynasty.cash,
    maxMoves: dynasty.history.at(-1)?.placement === 'placementChampion' ? 1 : 2,
    evolution: evolved.evolution,
    baseLineup: evolved.lineup,
    overrides: evolved.overrides,
    proposals,
    offers,
    coachOfferIds,
    moves: [],
    roleAssignments: {},
    coachChange: null
  };
}

export const windowCash = (state: WindowState) =>
  state.cashAtOpen + state.moves.reduce((sum, move) => sum + move.salePrice - move.buyPrice, 0) - (state.coachChange?.cost ?? 0);

export const movesLeft = (state: WindowState) => state.maxMoves - state.moves.length;

/** Lineup after the moves (the newcomer takes the outgoing player's position) and the user's reassignments. */
export function windowLineup(state: WindowState): SelectedPlayer[] {
  const lineup = state.baseLineup.map((selected) => ({ ...selected }));
  for (const move of state.moves) {
    const index = lineup.findIndex((selected) => selected.playerId === move.outPlayerId);
    if (index >= 0) lineup[index] = { playerId: move.inPlayerId, selectedSlotRole: lineup[index].selectedSlotRole };
  }
  return lineup.map((selected) => {
    const role = state.roleAssignments[selected.playerId];
    return role ? { ...selected, selectedSlotRole: role } : selected;
  });
}

export function salePriceFor(state: WindowState, playerId: string, playerById: Map<string, Player>): number {
  const proposal = state.proposals.find((item) => item.playerId === playerId);
  if (proposal) return proposal.price;
  const player = playerById.get(playerId);
  return player ? roundToStep(playerMarketValue(resolveDynastyPlayer(player, state.overrides[playerId])) * SALE_WITHOUT_PROPOSAL) : 0;
}

export function buyPriceFor(state: WindowState, incoming: IncomingPlayer, playerById: Map<string, Player>): number | null {
  if (incoming.kind === 'offer') return state.offers.find((offer) => offer.playerId === incoming.playerId)?.price ?? null;
  const player = playerById.get(incoming.playerId);
  return player ? roundToStep(playerMarketValue(player) * TARGET_MARKUP) : null;
}

export function checkMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): MoveProblem | null {
  if (movesLeft(state) <= 0) return 'no-moves';
  if (!state.baseLineup.some((selected) => selected.playerId === outPlayerId)) return 'not-in-lineup';
  if (state.moves.some((move) => move.outPlayerId === outPlayerId)) return 'already-sold';
  const player = playerById.get(incoming.playerId);
  if (!player) return 'unknown-player';
  const lineupBaseIds = new Set(windowLineup(state).flatMap((selected) => {
    const current = playerById.get(selected.playerId);
    return current ? [getPlayerBaseId(current)] : [];
  }));
  if (lineupBaseIds.has(getPlayerBaseId(player))) return 'duplicate-player';
  if (incoming.kind === 'offer') {
    if (!state.offers.some((offer) => offer.playerId === incoming.playerId)) return 'not-offered';
    if (state.moves.some((move) => move.inPlayerId === incoming.playerId)) return 'offer-used';
  } else if (state.moves.some((move) => move.kind === 'target')) {
    return 'target-used';
  }
  const price = buyPriceFor(state, incoming, playerById) ?? 0;
  if (windowCash(state) + salePriceFor(state, outPlayerId, playerById) - price < 0) return 'no-cash';
  return null;
}

export function makeMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): WindowState {
  const problem = checkMove(state, outPlayerId, incoming, playerById);
  if (problem) throw new Error(`Troca inválida: ${problem}`);
  return {
    ...state,
    moves: [...state.moves, {
      outPlayerId,
      inPlayerId: incoming.playerId,
      salePrice: salePriceFor(state, outPlayerId, playerById),
      buyPrice: buyPriceFor(state, incoming, playerById) ?? 0,
      kind: incoming.kind
    }]
  };
}

export function undoMove(state: WindowState, index: number): WindowState {
  const move = state.moves[index];
  if (!move) return state;
  const { [move.inPlayerId]: _removed, ...roleAssignments } = state.roleAssignments;
  return { ...state, moves: state.moves.filter((_, position) => position !== index), roleAssignments };
}

export const setRole = (state: WindowState, playerId: string, role: LineupSlotRole): WindowState =>
  ({ ...state, roleAssignments: { ...state.roleAssignments, [playerId]: role } });

/** `<playerId>:ineligible` for a position the player cannot take, `role:<role>` for a position over its limit. */
export function lineupProblems(state: WindowState, playerById: Map<string, Player>): string[] {
  const lineup = windowLineup(state);
  const problems: string[] = [];
  for (const selected of lineup) {
    const player = playerById.get(selected.playerId);
    if (!player || !getEligibleSlotRoles(player).includes(selected.selectedSlotRole)) problems.push(`${selected.playerId}:ineligible`);
  }
  for (const role of Object.keys(ROLE_LIMITS) as LineupSlotRole[]) {
    if (lineup.filter((selected) => selected.selectedSlotRole === role).length > ROLE_LIMITS[role]) problems.push(`role:${role}`);
  }
  return problems;
}

export function chooseCoach(state: WindowState, coachId: string | null, coachById: Map<string, Coach>): WindowState {
  if (coachId === null) return { ...state, coachChange: null };
  const coach = coachById.get(coachId);
  if (!coach || !state.coachOfferIds.includes(coachId)) throw new Error('Coach fora das ofertas da janela');
  return { ...state, coachChange: { coachId, cost: coachMarketValue(coach) } };
}

export const canConfirmWindow = (state: WindowState, playerById: Map<string, Player>) =>
  windowCash(state) >= 0 && windowLineup(state).length === 5 && lineupProblems(state, playerById).length === 0;

/** Applies the window to the dynasty. The caller then opens the next Major with `beginNextDynastyMajor`. */
export function confirmWindow(dynasty: DynastyState, state: WindowState, playerById: Map<string, Player>): { dynasty: DynastyState; lineup: SelectedPlayer[] } {
  if (!canConfirmWindow(state, playerById)) throw new Error('A janela ainda tem caixa negativo ou posições inválidas');
  const lineup = windowLineup(state);
  const kept = new Set(lineup.map((selected) => selected.playerId));
  const playerOverrides = Object.fromEntries(Object.entries(state.overrides).filter(([playerId]) => kept.has(playerId)));
  const history = dynasty.history.map((item, index) => (index === dynasty.history.length - 1 ? { ...item, movesMade: state.moves.length } : item));
  return {
    dynasty: { ...dynasty, cash: windowCash(state), coachId: state.coachChange?.coachId ?? dynasty.coachId, playerOverrides, history, window: null },
    lineup
  };
}

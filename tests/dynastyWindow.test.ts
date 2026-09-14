// tests/dynastyWindow.test.ts
import { describe, expect, it } from 'vitest';
import { coachById, coaches } from '../src/lib/game/data';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createDynastyState } from '../src/lib/game/dynasty/state';
import { coachMarketValue, playerMarketValue, roundToStep } from '../src/lib/game/dynasty/value';
import {
  assignRole, canConfirmWindow, checkMove, chooseCoach, confirmWindow, createWindow, FOCUS_OFFERS, lineupProblems, makeMove, MARKET_SIZE,
  movesLeft, salePriceFor, SWAP_OFFERS, SWAP_OVERALL_BAND, swapCashDelta, undoMove, windowCash, windowLineup, windowOffRolePlayerIds
} from '../src/lib/game/dynasty/window';
import type { DynastyMajorSummary, DynastyState, LineupSlotRole, Player, PlayerRunStats, SelectedPlayer } from '../src/lib/game/types';

const ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];
const makePlayer = (id: string, role: LineupSlotRole, overall: number): Player => ({
  id, baseId: id, nickname: id, title: '', traits: [], teamId: `${id}-team`, year: 2020, role, overall, rarity: 'common',
  firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, igl: role === 'igl' ? 85 : 30, experience: 80, consistency: 80, mental: 80
});
const catalog = Array.from({ length: 60 }, (_, index) => makePlayer(`c${index}`, ROLES[index % 6], 66 + (index % 25)));
const lineupPlayers = [makePlayer('l0', 'awper', 88), makePlayer('l1', 'igl', 84), makePlayer('l2', 'entry', 80), makePlayer('l3', 'lurker', 76), makePlayer('l4', 'support', 72)];
const playerById = new Map([...catalog, ...lineupPlayers].map((player) => [player.id, player]));
const lineup: SelectedPlayer[] = lineupPlayers.map((player) => ({ playerId: player.id, selectedSlotRole: player.role as LineupSlotRole }));
const stats = [1.3, 1, 0.7, 1, 1].map((runRating, index) => ({ playerId: lineupPlayers[index].id, runRating }) as PlayerRunStats);
const summary = (placement: string) =>
  ({ majorNumber: 1, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup, coachId: null, movesMade: 0, stats }) as DynastyMajorSummary;
const dynastyWith = (cash: number, placement = 'placement5to8'): DynastyState => ({ ...createDynastyState(), cash, prizeCreditedFor: 1, history: [summary(placement)] });
const open = (dynasty: DynastyState, seed = 'janela') => createWindow({ dynasty, lineup, stats, seed, catalog, playerById, coaches, coachById });
const rifler = catalog.find((player) => player.role === 'rifler')!;

describe('abertura da janela', () => {
  it('traz evolução, limite de trocas pela colocação e o caixa', () => {
    const state = open(dynastyWith(250_000));
    expect(state.maxMoves).toBe(2);
    expect(open(dynastyWith(0, 'placementChampion')).maxMoves).toBe(1);
    expect(state.cashAtOpen).toBe(250_000);
    expect(state.evolution.map((entry) => [entry.fromPlayerId, entry.kind, entry.overallBefore, entry.overallAfter])).toEqual([
      ['l0', 'drift', 88, 92], ['l1', 'stable', 84, 84], ['l2', 'drift', 80, 76], ['l3', 'stable', 76, 76], ['l4', 'stable', 72, 72]
    ]);
    expect(windowLineup(state)).toEqual(lineup);
    expect(lineupProblems(state, playerById)).toEqual([]);
  });

  it('monta 10 ofertas, 4 para a posição mais fraca, sem jogadores do elenco e com preço na faixa', () => {
    const state = open(dynastyWith(0));
    expect(state.offers).toHaveLength(MARKET_SIZE);
    const focus = state.offers.filter((offer) => offer.focusRole === 'support');
    expect(focus).toHaveLength(FOCUS_OFFERS);
    expect(focus.every((offer) => getEligibleSlotRoles(playerById.get(offer.playerId)!).includes('support'))).toBe(true);
    expect(state.offers.some((offer) => offer.playerId.startsWith('l'))).toBe(false);
    expect(new Set(state.offers.map((offer) => offer.playerId)).size).toBe(MARKET_SIZE);
    for (const offer of state.offers) {
      const value = playerMarketValue(playerById.get(offer.playerId)!);
      expect(offer.price).toBeGreaterThanOrEqual(roundToStep(value * 0.9));
      expect(offer.price).toBeLessThanOrEqual(roundToStep(value * 1.15));
    }
  });

  it('leva o treino confirmado ao ganho permanente da janela', () => {
    const dynasty = dynastyWith(0);
    dynasty.major = { majorNumber: 1, rules: 2, training: 'aim', basePlan: { style: 'balanced', tactic: 'standard', study: false }, plans: {}, confirmed: true };
    const trainedStats = stats.map((item) => ({ ...item, mapsPlayed: 3 }));
    const state = createWindow({ dynasty, lineup, stats: trainedStats, seed: 'treino-janela', catalog, playerById, coaches, coachById });
    expect(state.overrides.l1.training?.firepower).toBe(1);
    expect(state.evolution.find((entry) => entry.fromPlayerId === 'l1')?.training).toEqual({ attribute: 'firepower', delta: 1 });
  });

  it('traz duas propostas por jogadores distintos, três coaches e é determinística', () => {
    const state = open(dynastyWith(0));
    expect(state.proposals).toHaveLength(2);
    expect(new Set(state.proposals.map((proposal) => proposal.playerId)).size).toBe(2);
    expect(state.proposals.every((proposal) => salePriceFor(state, proposal.playerId, playerById) === proposal.price)).toBe(true);
    expect(state.coachOfferIds).toHaveLength(3);
    expect(JSON.stringify(open(dynastyWith(0)))).toBe(JSON.stringify(state));
    expect(JSON.stringify(open(dynastyWith(0), 'outra'))).not.toBe(JSON.stringify(state));
  });
});

describe('trocas', () => {
  const expensive = catalog.reduce((best, player) => ((player.overall ?? 0) > (best.overall ?? 0) ? player : best));

  it('respeitam caixa, limite, venda única e alvo livre com ágio', () => {
    expect(checkMove(open(dynastyWith(0)), 'l4', { kind: 'target', playerId: expensive.id }, playerById)).toBe('no-cash');
    const rich = open(dynastyWith(5_000_000));
    const afterTarget = makeMove(rich, 'l4', { kind: 'target', playerId: expensive.id }, playerById);
    expect(afterTarget.moves[0].buyPrice).toBe(roundToStep(playerMarketValue(expensive) * 1.25));
    expect(windowCash(afterTarget)).toBe(5_000_000 + afterTarget.moves[0].salePrice - afterTarget.moves[0].buyPrice);
    expect(checkMove(afterTarget, 'l3', { kind: 'target', playerId: rifler.id }, playerById)).toBe('target-used');
    expect(checkMove(afterTarget, 'l4', { kind: 'target', playerId: rifler.id }, playerById)).toBe('already-sold');
    expect(checkMove(afterTarget, 'l3', { kind: 'target', playerId: 'l1' }, playerById)).toBe('duplicate-player');
    const offer = afterTarget.offers.find((item) => checkMove(afterTarget, 'l3', { kind: 'offer', playerId: item.playerId }, playerById) === null)!;
    const twoMoves = makeMove(afterTarget, 'l3', { kind: 'offer', playerId: offer.playerId }, playerById);
    expect(movesLeft(twoMoves)).toBe(0);
    expect(checkMove(twoMoves, 'l2', { kind: 'offer', playerId: twoMoves.offers[0].playerId }, playerById)).toBe('no-moves');
    expect(checkMove(afterTarget, 'l2', { kind: 'offer', playerId: 'c-inexistente' }, playerById)).toBe('unknown-player');
    expect(undoMove(twoMoves, 1).moves).toEqual(afterTarget.moves);
    expect(() => makeMove(twoMoves, 'l2', { kind: 'offer', playerId: offer.playerId }, playerById)).toThrow(/no-moves/);
  });

  it('posição herdada fora das elegíveis confirma e só custa força', () => {
    const state = makeMove(open(dynastyWith(5_000_000)), 'l0', { kind: 'target', playerId: rifler.id }, playerById);
    expect(windowLineup(state)[0]).toEqual({ playerId: rifler.id, selectedSlotRole: 'awper' });
    expect(lineupProblems(state, playerById)).toEqual([]);
    expect(windowOffRolePlayerIds(state, playerById)).toEqual([rifler.id]);
    expect(canConfirmWindow(state, playerById)).toBe(true);
    const fixed = assignRole(state, rifler.id, 'rifler');
    expect(windowOffRolePlayerIds(fixed, playerById)).toEqual([]);
    expect(undoMove(fixed, 0).roleAssignments).toEqual({});
  });

  it('assignRole troca com quem ocupa uma posição cheia e nunca estoura o limite', () => {
    const state = open(dynastyWith(0));
    const swapped = assignRole(state, 'l1', 'awper');
    const roles = Object.fromEntries(windowLineup(swapped).map((selected) => [selected.playerId, selected.selectedSlotRole]));
    expect(roles.l1).toBe('awper');
    expect(roles.l0).toBe('igl');
    expect(lineupProblems(swapped, playerById)).toEqual([]);
    expect(assignRole(state, 'l1', 'igl')).toBe(state);
    expect(assignRole(state, 'inexistente', 'awper')).toBe(state);
  });
});

describe('coach e confirmação', () => {
  it('coach custa o valor e confirmar aplica elenco, caixa, coach, deriva e histórico', () => {
    const dynasty = dynastyWith(5_000_000);
    const base = open(dynasty);
    const coach = coachById.get(base.coachOfferIds[0])!;
    const withCoach = chooseCoach(base, coach.id, coachById);
    expect(withCoach.coachChange).toEqual({ coachId: coach.id, cost: coachMarketValue(coach) });
    expect(windowCash(withCoach)).toBe(5_000_000 - coachMarketValue(coach));
    expect(chooseCoach(withCoach, null, coachById).coachChange).toBeNull();
    expect(() => chooseCoach(base, 'coach-inexistente', coachById)).toThrow();
    const moved = makeMove(withCoach, 'l0', { kind: 'target', playerId: rifler.id }, playerById);
    expect(confirmWindow(dynasty, moved, playerById).lineup[0]).toEqual({ playerId: rifler.id, selectedSlotRole: 'awper' });
    const { dynasty: next, lineup: nextLineup } = confirmWindow(dynasty, assignRole(moved, rifler.id, 'rifler'), playerById);
    expect(nextLineup.map((selected) => selected.playerId)).toEqual([rifler.id, 'l1', 'l2', 'l3', 'l4']);
    expect(next.cash).toBe(windowCash(moved));
    expect(next.coachId).toBe(coach.id);
    expect(next.window).toBeNull();
    expect(next.history.at(-1)?.movesMade).toBe(1);
    expect(next.history.at(-1)?.evolution).toEqual(moved.evolution);
    expect(Object.keys(next.playerOverrides).sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(next.playerOverrides.l2.drift.overall).toBe(-4);
  });
});

describe('trocas diretas', () => {
  it('traz 2 ofertas determinísticas, elegíveis, na faixa de overall e fora do mercado', () => {
    const state = open(dynastyWith(0));
    expect(state.swapOffers).toHaveLength(SWAP_OFFERS);
    expect(open(dynastyWith(0)).swapOffers).toEqual(state.swapOffers);
    expect(new Set(state.swapOffers!.map((offer) => offer.forPlayerId)).size).toBe(SWAP_OFFERS);
    for (const offer of state.swapOffers!) {
      const theirs = playerById.get(offer.theirPlayerId)!;
      const mine = windowLineup(state).find((selected) => selected.playerId === offer.forPlayerId)!;
      const mineOverall = state.evolution.find((entry) => entry.toPlayerId === offer.forPlayerId)!.overallAfter;
      expect(Math.abs((theirs.overall ?? 70) - mineOverall)).toBeLessThanOrEqual(SWAP_OVERALL_BAND);
      expect(getEligibleSlotRoles(theirs)).toContain(mine.selectedSlotRole);
      expect(state.offers.some((item) => item.playerId === offer.theirPlayerId)).toBe(false);
      expect(Math.abs(offer.cashDelta) % 5_000).toBe(0);
    }
  });

  it('diferença em dinheiro: paga 110%, recebe 90% e empata abaixo de 5 mil', () => {
    expect(swapCashDelta(300_000, 200_000)).toBe(-110_000);
    expect(swapCashDelta(200_000, 300_000)).toBe(90_000);
    expect(swapCashDelta(204_000, 200_000)).toBe(0);
    expect(swapCashDelta(250_000, 250_000)).toBe(0);
  });

  it('aceitar conta como 1 troca, move o caixa pela diferença e não se repete', () => {
    const state = open(dynastyWith(5_000_000));
    const offer = state.swapOffers![0];
    const incoming = { kind: 'swap' as const, playerId: offer.theirPlayerId, offerId: offer.id };
    const otherLineupPlayer = windowLineup(state).find((selected) => selected.playerId !== offer.forPlayerId)!.playerId;
    expect(checkMove(state, otherLineupPlayer, incoming, playerById)).toBe('not-offered');
    const moved = makeMove(state, offer.forPlayerId, incoming, playerById);
    expect(movesLeft(moved)).toBe(state.maxMoves - 1);
    expect(windowCash(moved)).toBe(5_000_000 + offer.cashDelta);
    expect(moved.moves[0]).toMatchObject({ kind: 'swap', outPlayerId: offer.forPlayerId, inPlayerId: offer.theirPlayerId });
    expect(windowLineup(moved).some((selected) => selected.playerId === offer.theirPlayerId)).toBe(true);
    expect(checkMove(moved, offer.forPlayerId, incoming, playerById)).toBe('already-sold');
  });

  it('troca que custa dinheiro respeita o caixa e janela antiga sem trocas continua válida', () => {
    const state = open(dynastyWith(0));
    const paying = { ...state, swapOffers: [{ id: 'swap-teste', fromTeamId: 'x-team', theirPlayerId: rifler.id, forPlayerId: 'l4', cashDelta: -50_000 }] };
    expect(checkMove(paying, 'l4', { kind: 'swap', playerId: rifler.id, offerId: 'swap-teste' }, playerById)).toBe('no-cash');
    const legacy = { ...state, swapOffers: undefined };
    expect(checkMove(legacy, 'l4', { kind: 'swap', playerId: rifler.id, offerId: 'swap-teste' }, playerById)).toBe('not-offered');
    expect(canConfirmWindow(legacy, playerById)).toBe(true);
  });
});

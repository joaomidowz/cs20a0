import { describe, expect, it } from 'vitest';
import {
  applyDecision,
  autoDecide,
  createMapState,
  getCurrentSideA,
  getTimeoutsRemaining,
  isMapFinished,
  pendingDecision,
  playMapToEnd,
  playNextRound,
  requestTimeout,
  toMapResult,
  MapDecisionError
} from '../src/lib/game/rounds';
import { createSeededRng, simulateMap } from '../src/lib/game/simulation';
import type { CombatTeam } from '../src/lib/game/types';

const team = (id: string, power: number, style: CombatTeam['style'] = 'balanced'): CombatTeam => ({
  id, name: id, power, mental: 85, clutch: 85, experience: 85, consistency: 85, style
});

const playRounds = (count: number, seed = 'rounds') => {
  const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng(seed), mapId: 'mirage', controllers: { a: 'human', b: 'bot' } });
  for (let index = 0; index < count && !isMapFinished(state); index += 1) {
    if (pendingDecision(state)) autoDecide(state);
    playNextRound(state);
  }
  return state;
};

describe('round engine', () => {
  it('asks the side picker for a side before the first round and applies it to the map', () => {
    const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('side'), mapId: 'nuke', sidePickerTeamId: 'b', controllers: { a: 'bot', b: 'human' } });
    expect(pendingDecision(state)).toEqual({ type: 'side', teamId: 'b', side: 'b' });
    expect(() => playNextRound(state)).toThrow(MapDecisionError);
    applyDecision(state, { type: 'side', side: 'ct' });
    expect(pendingDecision(state)).toBeNull();
    expect(getCurrentSideA(state)).toBe('t');
    playNextRound(state);
    const result = toMapResult(state);
    expect(result.aStartsCt).toBe(false);
    expect(result.sidePickerId).toBe('b');
    expect(result.decisions).toEqual([{ kind: 'side', teamId: 'b', mapIndex: 0, side: 'ct', auto: false }]);
    expect(result.winnerId).toBe('');
  });

  it('flips a coin for the side when nobody picks and never asks bots anything', () => {
    const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('coin') });
    expect(pendingDecision(state)).toBeNull();
    const result = playMapToEnd(state);
    expect(typeof result.aStartsCt).toBe('boolean');
    expect(result.details!.every((round) => round.tags !== undefined)).toBe(true);
    expect(result.details!.filter((round) => round.tags.includes('pistol'))).toHaveLength(2);
  });

  it('lets the human pistol loser call force or eco and applies it to the next buy', () => {
    for (const seed of ['eco-1', 'eco-2', 'eco-3', 'eco-4']) {
      const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng(seed), controllers: { a: 'human', b: 'human' } });
      const pistol = playNextRound(state);
      const loser = pistol.winner === 'a' ? 'b' : 'a';
      const pending = pendingDecision(state);
      expect(pending).toMatchObject({ type: 'eco-call', teamId: loser, side: loser, roundNumber: 2 });
      expect(() => applyDecision(state, { type: 'side', side: 'ct' })).toThrow(MapDecisionError);
      applyDecision(state, { type: 'eco-call', call: 'force' });
      const second = playNextRound(state);
      expect(second.economy[loser].buy).toBe('force');
      expect(second.economy[pistol.winner].buy).not.toBe('pistol');
    }
    const saver = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('eco-save'), controllers: { a: 'human', b: 'human' } });
    const pistol = playNextRound(saver);
    const loser = pistol.winner === 'a' ? 'b' : 'a';
    applyDecision(saver, { type: 'eco-call', call: 'eco' });
    expect(playNextRound(saver).economy[loser].buy).toBe('eco');
  });

  it('allows one tactical timeout per half and marks the round it precedes', () => {
    const state = playRounds(3, 'timeout');
    expect(getTimeoutsRemaining(state, 'a')).toBe(1);
    expect(requestTimeout(state, 'a')).toBe(true);
    expect(getTimeoutsRemaining(state, 'a')).toBe(0);
    expect(requestTimeout(state, 'a')).toBe(false);
    if (pendingDecision(state)) autoDecide(state);
    const round = playNextRound(state);
    expect(round.timeout).toBe('a');
    expect(state.decisions.filter((decision) => decision.kind === 'timeout' && decision.teamId === 'a')).toHaveLength(1);
    // The second half hands the timeout back.
    while (state.rounds.length < 12 && !isMapFinished(state)) {
      if (pendingDecision(state)) autoDecide(state);
      playNextRound(state);
    }
    expect(state.details.at(-1)?.tags).toContain('half-end');
    if (pendingDecision(state)) autoDecide(state);
    playNextRound(state);
    expect(getTimeoutsRemaining(state, 'a')).toBe(1);
  });

  it('is deterministic for the same seed and decisions, and diverges with different decisions', () => {
    const run = (side: 'ct' | 't') => {
      const state = createMapState(team('a', 92), team('b', 90), { rng: createSeededRng('det'), mapId: 'inferno', sidePickerTeamId: 'a', controllers: { a: 'human', b: 'bot' } });
      applyDecision(state, { type: 'side', side });
      return playMapToEnd(state);
    };
    expect(run('ct')).toEqual(run('ct'));
    expect(run('ct').rounds).not.toEqual(run('t').rounds);
  });

  it('produces valid MR12 maps with halves, overtime blocks and comeback flags', () => {
    let comebacks = 0;
    let overtimes = 0;
    for (let index = 0; index < 300; index += 1) {
      const map = simulateMap(team('a', 90), team('b', 90), createSeededRng(`valid-${index}`), 1, { mapId: 'dust2' });
      expect(Math.max(map.scoreA, map.scoreB)).toBeGreaterThanOrEqual(13);
      expect(map.scoreA).not.toBe(map.scoreB);
      expect(map.rounds.at(-1)).toMatchObject({ a: map.scoreA, b: map.scoreB });
      expect(map.halves![0]).toEqual(expect.objectContaining({}));
      expect(map.halves![0].a + map.halves![0].b).toBe(12);
      const halfSum = map.halves!.reduce((sum, half) => sum + half.a + half.b, 0);
      expect(halfSum).toBe(map.rounds.length);
      if (map.overtime) {
        overtimes += 1;
        expect(map.rounds.length).toBeGreaterThan(24);
        expect(Math.abs(map.scoreA - map.scoreB)).toBeGreaterThanOrEqual(1);
      } else {
        expect(map.rounds.length).toBeLessThanOrEqual(24);
      }
      if (map.comeback) {
        comebacks += 1;
        const winner = map.comeback;
        const trailedBy = Math.max(...map.rounds.map((round) => (winner === 'a' ? round.b - round.a : round.a - round.b)));
        const firstHalfLoss = winner === 'a' ? map.halves![0].b - map.halves![0].a : map.halves![0].a - map.halves![0].b;
        expect(Math.max(trailedBy, firstHalfLoss)).toBeGreaterThanOrEqual(4);
        expect(map.winnerId).toBe(winner);
      }
    }
    expect(comebacks).toBeGreaterThan(5);
    expect(overtimes).toBeGreaterThan(5);
  });

  it('keeps the pistol close to even, favours the pistol winner in round two and resets round three', () => {
    const N = 1500;
    let pistolFavourite = 0;
    let secondToPistolWinner = 0;
    let thirdToPistolWinner = 0;
    let thirdRounds = 0;
    for (let index = 0; index < N; index += 1) {
      const details = simulateMap(team('a', 93), team('b', 90), createSeededRng(`pistol-${index}`), 1).details!;
      if (details[0].winner === 'a') pistolFavourite += 1;
      if (details[1].winner === details[0].winner) secondToPistolWinner += 1;
      if (details[2]) {
        thirdRounds += 1;
        if (details[2].winner === details[0].winner) thirdToPistolWinner += 1;
      }
    }
    expect(pistolFavourite / N).toBeGreaterThan(0.46);
    expect(pistolFavourite / N).toBeLessThan(0.6);
    expect(secondToPistolWinner / N).toBeGreaterThanOrEqual(0.65);
    expect(thirdToPistolWinner / thirdRounds).toBeGreaterThan(0.42);
    expect(thirdToPistolWinner / thirdRounds).toBeLessThan(0.58);
  });

  it('gives full buys a real edge over ecos', () => {
    let fullVsEco = 0;
    let fullWins = 0;
    for (let index = 0; index < 400; index += 1) {
      for (const round of simulateMap(team('a', 90), team('b', 90), createSeededRng(`buy-${index}`), 1).details!) {
        const buys = [round.economy.a.buy, round.economy.b.buy];
        if (buys.includes('full') && buys.includes('eco')) {
          fullVsEco += 1;
          if (round.economy[round.winner].buy === 'full') fullWins += 1;
        }
      }
    }
    expect(fullVsEco).toBeGreaterThan(100);
    expect(fullWins / fullVsEco).toBeGreaterThanOrEqual(0.72);
  });
});

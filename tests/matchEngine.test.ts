import { describe, expect, it } from 'vitest';
import {
  advanceIncrementalMap,
  completeIncrementalMap,
  createIncrementalMap,
  getHalfId,
  getLegalBuys,
  recommendRoundDecision,
  tacticalPauseThreshold,
  toMapResult
} from '../src/lib/game/match-engine';
import type { CombatTeam, RoundDecision } from '../src/lib/game/types';

const team = (id: string, style: CombatTeam['style'] = 'balanced'): CombatTeam => ({
  id, name: id, power: 82, mental: 82, clutch: 82, experience: 82, igl: 84, style,
  lineup: Array.from({ length: 5 }, (_, index) => ({ playerId: `${id}-${index}`, selectedSlotRole: index === 0 ? 'igl' : index === 1 ? 'awper' : 'rifler' }))
});

describe('incremental match engine', () => {
  it('is deterministic and serializable round by round', () => {
    const initial = createIncrementalMap({ teamA: team('a'), teamB: team('b'), seed: 'same-seed', mapId: 'mirage' });
    const first = completeIncrementalMap(initial);
    const resumed = completeIncrementalMap(JSON.parse(JSON.stringify(advanceIncrementalMap(initial))));
    expect(resumed).toEqual(first);
    expect(toMapResult(first).events).toHaveLength(first.rounds.length);
  });

  it('offers only affordable buys and never creates or loses money outside the economy settlement', () => {
    expect(getLegalBuys(800)).toEqual(['eco']);
    expect(getLegalBuys(2_700)).toEqual(['eco', 'force']);
    expect(getLegalBuys(5_000)).toEqual(['eco', 'force', 'full']);
    const result = completeIncrementalMap(createIncrementalMap({ teamA: team('a'), teamB: team('b'), seed: 'economy' }));
    for (const event of result.events) for (const economy of [event.economy.a, event.economy.b]) {
      expect(economy.spent).toBeLessThanOrEqual(economy.moneyBefore);
      expect(economy.moneyAfter).toBeGreaterThanOrEqual(0);
      expect(economy.moneyAfter).toBeLessThanOrEqual(16_000);
    }
  });

  it('makes a full buy materially stronger than an eco over many deterministic seeds', () => {
    let fullWins = 0;
    let ecoWins = 0;
    const full: RoundDecision = { buy: 'full', tacticalPause: false };
    const eco: RoundDecision = { buy: 'eco', tacticalPause: false };
    for (let index = 0; index < 240; index += 1) {
      let base = createIncrementalMap({ teamA: team('a'), teamB: team('b'), seed: `buy-${index}` });
      base = advanceIncrementalMap(base);
      base.stateA.money = base.stateB.money = 8_000;
      if (advanceIncrementalMap(base, { a: full, b: eco }).events.at(-1)?.winner === 'a') fullWins += 1;
      if (advanceIncrementalMap(base, { a: eco, b: full }).events.at(-1)?.winner === 'a') ecoWins += 1;
    }
    expect(fullWins).toBeGreaterThan(ecoWins + 35);
  });

  it('implements style thresholds, strong-map opening force and crisis rules', () => {
    expect(tacticalPauseThreshold('tactical')).toBe(3);
    expect(tacticalPauseThreshold('balanced')).toBe(4);
    expect(tacticalPauseThreshold('aggressive')).toBe(5);
    const aggressive = recommendRoundDecision({ team: team('a', 'aggressive'), money: 3_000, score: 1, opponentScore: 0, opponentRoundStreak: 0, pauseAvailable: true, strongMap: true, pistolRound: false, seed: 'strong-map' });
    expect(aggressive.buy).toBe('force');
    const crisis = recommendRoundDecision({ team: team('a', 'tactical'), money: 3_000, score: 3, opponentScore: 9, opponentRoundStreak: 2, pauseAvailable: true, strongMap: false, pistolRound: false, seed: 'crisis' });
    expect(crisis).toEqual({ buy: 'force', tacticalPause: true });
  });

  it('limits tactical pauses to one per half and applies the boost to two rounds', () => {
    let state = createIncrementalMap({ teamA: team('a'), teamB: team('b'), seed: 'pause' });
    state = advanceIncrementalMap(state);
    state.stateA.money = 8_000;
    state = advanceIncrementalMap(state, { a: { buy: 'full', tacticalPause: true } });
    expect(state.events.at(-1)?.economy.a.tacticalPause).toBe(true);
    expect(state.stateA.pauseBoostRounds).toBe(1);
    state = advanceIncrementalMap(state, { a: { buy: 'full', tacticalPause: true } });
    expect(state.events.at(-1)?.economy.a.tacticalPause).toBe(false);
    expect(getHalfId(0)).toBe(0);
    expect(getHalfId(12)).toBe(1);
  });

  it('emits only structured clean-view highlight categories', () => {
    const types = new Set<string>();
    for (let index = 0; index < 80; index += 1) {
      const result = completeIncrementalMap(createIncrementalMap({ teamA: team('a'), teamB: team('b'), seed: `highlight-${index}` }));
      result.events.forEach((event) => { if (event.highlight) types.add(event.highlight.type); });
    }
    expect([...types].every((type) => ['clutch', 'ace', '4k', '3k'].includes(type))).toBe(true);
    expect(types.size).toBeGreaterThan(1);
  });
});

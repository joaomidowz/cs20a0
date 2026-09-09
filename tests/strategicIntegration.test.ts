import { describe, expect, it } from 'vitest';
import { getTeamPlayers, teams, players } from '../src/lib/game/data';
import { createBotMapStrategy, getCurrentVetoAction } from '../src/lib/game/map-veto';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { calculateHistoricalTeamPower, buildMajorRun } from '../src/lib/game/simulation';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { advanceStrategicRound, applyStrategicVeto, completeStrategicSeries, createStrategicSeries, resolveAutomaticVetos, strategicRoundContext, type StrategicSeriesBook } from '../src/lib/game/strategic-series';

function initial(seed = 'strategic-integration') {
  const a = calculateHistoricalTeamPower(teams[0], players);
  const b = calculateHistoricalTeamPower(teams[1], players);
  return createStrategicSeries(a, b, 3, 'stage3', 'test-match', { mode: 'premier', seed, strategies: new Map([[a.id, createBotMapStrategy(teams[0])], [b.id, createBotMapStrategy(teams[1])]]) });
}

describe('strategic integration', () => {
  it.each(Array.from({ length: 8 }, (_, bits) => [Boolean(bits & 1), Boolean(bits & 2), Boolean(bits & 4)]))('supports independent maps=%s pause=%s economy=%s', (autoMapPicksAndVetos, autoPause, autoEconomy) => {
    let state = initial();
    const id = state.result.teamA.id;
    const preferences = { [id]: { autoMapPicksAndVetos, autoPause, autoEconomy } };
    state = resolveAutomaticVetos(state, preferences);
    if (!autoMapPicksAndVetos) {
      expect(state.map).toBeNull();
      expect(getCurrentVetoAction(state.veto)?.actorId).toBe(id);
      while (!state.veto.finished) state = applyStrategicVeto(state);
      state = resolveAutomaticVetos(state, preferences);
    }
    expect(state.map?.round).toBe(0);
    state = advanceStrategicRound(state);
    const ctx = strategicRoundContext(state, 'a');
    const buy = autoEconomy ? ctx.recommendation.buy : 'eco';
    state = advanceStrategicRound(state, { a: { buy, tacticalPause: autoPause ? ctx.recommendation.tacticalPause : true } });
    expect(state.map?.events.at(-1)?.economy.a.buy).toBe(buy);
    expect(state.map?.events.at(-1)?.economy.a.tacticalPause).toBe(autoPause ? ctx.recommendation.tacticalPause : true);
    expect(state.result.winnerId).toBe('');
  });

  it('resumes deterministic rounds and validates purchases before changing any state', () => {
    const state = resolveAutomaticVetos(initial(), {});
    expect(() => advanceStrategicRound(state, { a: { buy: 'full', tacticalPause: false } })).toThrow('Illegal');
    expect(state.map?.round).toBe(0);
    const first = advanceStrategicRound(state);
    expect(completeStrategicSeries(JSON.parse(JSON.stringify(first)))).toEqual(completeStrategicSeries(first));
  });

  it('applies actual map choices before constructing map strength and events', () => {
    let state = initial();
    while (!state.veto.finished) {
      const action = getCurrentVetoAction(state.veto)!;
      const map = action.action === 'pick' ? state.veto.available.at(-1)! : state.veto.available[0];
      state = applyStrategicVeto(state, map);
    }
    state = resolveAutomaticVetos(state, {});
    expect(state.map?.mapId).toBe(state.result.veto?.find(step => step.action === 'pick')?.mapId);
    expect(state.map?.events).toEqual([]);
  });

  it('holds future Swiss pairings until human results exist, then preserves completed decisions', () => {
    const roster = getTeamPlayers(teams[0]).slice(0, 5);
    const lineup = roster.map(p => ({ playerId: p.id, selectedSlotRole: getEligibleSlotRoles(p)[0] }));
    const live: StrategicSeriesBook = {};
    const options = { mode: 'premier' as const, selectedMaps: getDefaultMapSelection(roster, teams), live };
    const first = buildMajorRun(roster, 'balanced', teams, players, 'incremental-major', lineup, options);
    expect(first.tournament?.rounds).toHaveLength(1);
    expect(first.matches[0].winnerId).toBe('');
    const id = first.matches[0].id;
    live[id] = completeStrategicSeries(live[id]);
    const second = buildMajorRun(roster, 'balanced', teams, players, 'incremental-major', lineup, options);
    expect(second.tournament?.rounds).toHaveLength(2);
    expect(second.matches[0].winnerId).toBe(live[id].result.winnerId);
    expect(second.matches[1].winnerId).toBe('');
  });
});

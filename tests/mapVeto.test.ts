import { describe, expect, it } from 'vitest';
import { MAP_POOL } from '../src/lib/game/maps';
import { getStrategyMapBonus, resolveMapVeto, type MapStrategy } from '../src/lib/game/map-veto';
import type { MapAffinity, MapId } from '../src/lib/game/types';

const strategy = (teamId: string, selectedMaps: [MapId, MapId, MapId], bot = false): MapStrategy => {
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  affinities[selectedMaps[0]] = '++';
  affinities[selectedMaps[1]] = '+';
  affinities[selectedMaps[2]] = '+';
  return { teamId, selectedMaps, affinities, bot };
};

const teamA = strategy('team-a', ['ancient', 'mirage', 'nuke']);
const teamB = strategy('team-b', ['anubis', 'cache', 'inferno'], true);

describe('map veto', () => {
  it.each([
    { bestOf: 1 as const, actions: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'], played: 1 },
    { bestOf: 3 as const, actions: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'], played: 3 },
    { bestOf: 5 as const, actions: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'], played: 5 }
  ])('resolves a valid BO$bestOf sequence', ({ bestOf, actions, played }) => {
    const result = resolveMapVeto({ bestOf, teamA, teamB, seed: `bo${bestOf}` });

    expect(result.steps.map((step) => step.action)).toEqual(actions);
    expect(result.playedMaps).toHaveLength(played);
    expect(new Set(result.steps.map((step) => step.mapId))).toEqual(new Set(MAP_POOL));
    expect(result.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('is deterministic for the same seed and strategies', () => {
    const first = resolveMapVeto({ bestOf: 3, teamA, teamB, seed: 'same-veto' });
    const second = resolveMapVeto({ bestOf: 3, teamA, teamB, seed: 'same-veto' });
    expect(second).toEqual(first);
  });

  it('uses the strongest affinity tier when scoring a selected map', () => {
    const strongest = strategy('team-strongest', ['ancient', 'mirage', 'nuke']);
    strongest.affinities.ancient = '+++';

    expect(getStrategyMapBonus(strongest, 'ancient', 'premier')).toBe(1.5);
    expect(getStrategyMapBonus(strongest, 'ancient', 'pro')).toBe(4.5);
    expect(getStrategyMapBonus(strongest, 'cache', 'pro')).toBe(0);
  });
});

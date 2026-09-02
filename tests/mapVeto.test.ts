import { describe, expect, it } from 'vitest';
import { MAP_POOL } from '../src/lib/game/maps';
import { resolveMapVeto, type MapStrategy } from '../src/lib/game/map-veto';
import type { MapAffinity, MapId } from '../src/lib/game/types';

const strategy = (teamId: string, selectedMaps: [MapId, MapId, MapId], bot = false): MapStrategy => {
  const affinities = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, 'EVEN'])) as Record<MapId, MapAffinity>;
  const sevenMapPool: MapId[] = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke'];
  const familiarity = Object.fromEntries(MAP_POOL.map((mapId) => [mapId, sevenMapPool.includes(mapId) ? 20 : 0])) as Record<MapId, number>;
  affinities[selectedMaps[0]] = '+++';
  affinities[selectedMaps[1]] = '+';
  affinities[selectedMaps[2]] = '+';
  return { teamId, selectedMaps, affinities, familiarity, bot };
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
    expect(new Set(result.steps.map((step) => step.mapId)).size).toBe(result.steps.length);
    expect(result.steps.map((step) => step.order)).toEqual(result.steps.map((_, index) => index + 1));
  });

  it('is deterministic for the same seed and strategies', () => {
    const first = resolveMapVeto({ bestOf: 3, teamA, teamB, seed: 'same-veto' });
    const second = resolveMapVeto({ bestOf: 3, teamA, teamB, seed: 'same-veto' });
    expect(second).toEqual(first);
  });

  it('alternates preliminary bans until a union larger than seven reaches the standard veto', () => {
    const allA = strategy('all-a', ['cache', 'cobblestone', 'train']);
    const allB = strategy('all-b', ['ancient', 'anubis', 'vertigo']);
    for (const mapId of MAP_POOL) {
      allA.affinities[mapId] = mapId === 'vertigo' ? 'EVEN' : '+';
      allB.affinities[mapId] = mapId === 'cobblestone' ? 'EVEN' : '+';
      allA.familiarity[mapId] = mapId === 'vertigo' ? 0 : 20;
      allB.familiarity[mapId] = mapId === 'cobblestone' ? 0 : 20;
    }
    const result = resolveMapVeto({ bestOf: 3, teamA: allA, teamB: allB, seed: 'historical-union' });
    expect(result.steps).toHaveLength(11);
    expect(result.steps.slice(0, 4).map((step) => step.action)).toEqual(['ban', 'ban', 'ban', 'ban']);
    expect(new Set(result.steps.map((step) => step.mapId)).size).toBe(11);
    expect(result.playedMaps).toHaveLength(3);
  });
});

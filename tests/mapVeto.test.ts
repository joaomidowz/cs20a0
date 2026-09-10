import { describe, expect, it } from 'vitest';
import { MAP_POOL } from '../src/lib/game/maps';
import { buildVetoPlan, getVetoAvailableMaps, resolveMapVeto, type MapStrategy } from '../src/lib/game/map-veto';
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

  it('trims a shared pool larger than seven to the seven most familiar maps, like a real active-duty pool', () => {
    const allA = strategy('all-a', ['cache', 'cobblestone', 'train']);
    const allB = strategy('all-b', ['ancient', 'anubis', 'vertigo']);
    for (const mapId of MAP_POOL) {
      allA.affinities[mapId] = mapId === 'vertigo' ? 'EVEN' : '+';
      allB.affinities[mapId] = mapId === 'cobblestone' ? 'EVEN' : '+';
      allA.familiarity[mapId] = mapId === 'vertigo' ? 0 : 20;
      allB.familiarity[mapId] = mapId === 'cobblestone' ? 0 : 20;
    }
    // Nine shared maps: the two least familiar ones leave the pool before the veto starts.
    allA.familiarity.overpass = 5;
    allB.familiarity.train = 5;
    const available = getVetoAvailableMaps(allA, allB);
    expect(available).toHaveLength(7);
    expect(available).not.toEqual(expect.arrayContaining(['overpass']));
    expect(available).not.toEqual(expect.arrayContaining(['train']));
    expect(available.some((mapId) => mapId === 'vertigo' || mapId === 'cobblestone')).toBe(false);

    const bo3 = resolveMapVeto({ bestOf: 3, teamA: allA, teamB: allB, seed: 'historical-union' });
    expect(bo3.steps.map((step) => step.action)).toEqual(['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider']);
    expect(new Set(bo3.steps.map((step) => step.mapId)).size).toBe(7);
    expect(bo3.playedMaps).toHaveLength(3);

    // BO5 follows the rulebook: ban, ban, pick, pick, pick, pick and the remaining map as the fifth decider.
    const bo5 = resolveMapVeto({ bestOf: 5, teamA: allA, teamB: allB, seed: 'historical-union' });
    expect(bo5.steps.map((step) => `${step.action}:${step.teamId ?? '-'}`)).toEqual(['ban:all-a', 'ban:all-b', 'pick:all-a', 'pick:all-b', 'pick:all-a', 'pick:all-b', 'decider:-']);
    expect(bo5.playedMaps).toHaveLength(5);
  });

  it('fills the pool with one-sided maps only when the shared pool is short, so a 2018 bot cannot force Cobblestone', () => {
    const modern = strategy('modern', ['ancient', 'anubis', 'mirage']);
    const legacy = strategy('legacy', ['cobblestone', 'train', 'cache'], true);
    for (const mapId of MAP_POOL) {
      modern.familiarity[mapId] = ['ancient', 'anubis', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'vertigo'].includes(mapId) ? 100 : 0;
      legacy.familiarity[mapId] = ['cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train'].includes(mapId) ? 100 : 0;
    }
    const available = getVetoAvailableMaps(modern, legacy);
    expect(available).toHaveLength(7);
    expect(available).toEqual(expect.arrayContaining(['dust2', 'inferno', 'mirage', 'nuke', 'overpass']));
    const result = resolveMapVeto({ bestOf: 1, teamA: modern, teamB: legacy, seed: 'era-clash' });
    const decider = result.steps.at(-1)!;
    expect(decider.action).toBe('decider');
    expect(modern.familiarity[decider.mapId]).toBeGreaterThan(0);
    expect(legacy.familiarity[decider.mapId]).toBeGreaterThan(0);
  });

  it('builds the same plan the resolver follows', () => {
    expect(buildVetoPlan(3, 7).map((step) => `${step.action}:${step.actor}`)).toEqual(['ban:a', 'ban:b', 'pick:a', 'pick:b', 'ban:a', 'ban:b']);
    expect(buildVetoPlan(1, 9).map((step) => step.action)).toEqual(['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'ban']);
    // A preliminary ban never makes the same team act twice in a row.
    expect(buildVetoPlan(3, 8).map((step) => `${step.action}:${step.actor}`)).toEqual(['ban:a', 'ban:b', 'ban:a', 'pick:b', 'pick:a', 'ban:b', 'ban:a']);
    expect(buildVetoPlan(5, 7).map((step) => `${step.action}:${step.actor}`)).toEqual(['ban:a', 'ban:b', 'pick:a', 'pick:b', 'pick:a', 'pick:b']);
  });
});

import { describe, expect, it } from 'vitest';
import { MIRAGE_POINTS } from '../src/lib/game/replay/golden/mirage-data';
import { createMirageNavigation } from '../src/lib/game/replay/golden/navigation';

describe('Mirage golden navigation', () => {
  it('decodes the 192 by 192 collision grid', () => {
    const navigation = createMirageNavigation();
    expect(navigation.gridSize).toBe(192);
    expect(navigation.worldSize).toBe(1_024);
    expect(navigation.walkableCells).toBeGreaterThan(1_000);
  });

  it('keeps canonical spawns and sites connected through walkable cells', () => {
    const navigation = createMirageNavigation();
    for (const destination of [MIRAGE_POINTS.siteA, MIRAGE_POINTS.siteB, MIRAGE_POINTS.mid]) {
      const path = navigation.findPath(MIRAGE_POINTS.tSpawn, destination);
      expect(path.length).toBeGreaterThan(2);
      expect(path.every((point) => navigation.isFree(point.x, point.y))).toBe(true);
    }
  });

  it('blocks line of sight through radar walls', () => {
    const navigation = createMirageNavigation();
    expect(navigation.hasWallBetween({ x: 677, y: 960 }, { x: 768.5, y: 193.6 })).toBe(true);
  });
});

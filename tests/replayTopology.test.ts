import { describe, expect, it } from 'vitest';
import { MAP_POOL } from '../src/lib/game/maps';
import type { MapId } from '../src/lib/game/types';
import { MAP_TOPOLOGY_SOURCES, getMapGraph } from '../src/lib/game/replay/topology/maps';
import { createRadarPlan, hashRadarPlan } from '../src/lib/game/replay/topology/radar';

const expectedCounts: Record<MapId, { nodes: number; edges: number }> = {
  ancient: { nodes: 11, edges: 14 },
  anubis: { nodes: 15, edges: 19 },
  cache: { nodes: 14, edges: 17 },
  dust2: { nodes: 23, edges: 26 },
  inferno: { nodes: 19, edges: 23 },
  mirage: { nodes: 17, edges: 23 },
  nuke: { nodes: 15, edges: 20 }
};

const edgeKey = (first: string, second: string) =>
  first < second ? `${first}|${second}` : `${second}|${first}`;

function declaredTopology(source: string) {
  const nodes = new Set<string>();
  const directedEdges: Array<[string, string]> = [];
  for (const line of source.trim().split(/\r?\n/).slice(1)) {
    const match = line.match(/^\s*([a-z0-9_]+)\s+\([^)]+\)\s+@\s+\d+,\d+\s+->\s+(.+)$/i);
    if (!match) throw new Error(`Invalid topology fixture line: ${line}`);
    nodes.add(match[1]);
    for (const neighbor of match[2].split(',').map((value) => value.trim())) {
      directedEdges.push([match[1], neighbor]);
    }
  }
  return {
    nodes,
    edges: new Set(directedEdges.map(([first, second]) => edgeKey(first, second))),
    directedEdges
  };
}

describe('replay map topologies', () => {
  it('matches the approved schematic radar snapshots', () => {
    expect(Object.fromEntries(MAP_POOL.map((mapId) => [
      mapId,
      hashRadarPlan(createRadarPlan(getMapGraph(mapId), 'radar-golden-v1'))
    ]))).toEqual({
      ancient: '5e0c5d1a',
      anubis: '34d5cafc',
      cache: '6ce45cc6',
      dust2: '251eebad',
      inferno: 'ba6acd4f',
      mirage: 'e9dbd87a',
      nuke: '6b55edf9'
    });
  });

  it.each(MAP_POOL)('compiles exactly the named topology declared for %s', (mapId) => {
    const source = MAP_TOPOLOGY_SOURCES[mapId];
    const declared = declaredTopology(source);
    const graph = getMapGraph(mapId);
    const compiledNodes = new Set(graph.nodes.map((node) => node.id));
    const compiledEdges = new Set(graph.edges.map((edge) => edgeKey(edge.from, edge.to)));

    expect(graph.mapId).toBe(mapId);
    expect(graph.nodes).toHaveLength(expectedCounts[mapId].nodes);
    expect(graph.edges).toHaveLength(expectedCounts[mapId].edges);
    expect(compiledNodes).toEqual(declared.nodes);
    expect(compiledEdges).toEqual(declared.edges);
    for (const [from, to] of declared.directedEdges) {
      expect(compiledEdges.has(edgeKey(from, to))).toBe(true);
    }
  });

  it('uses only the user-supplied vertical transitions and levels for Nuke', () => {
    const graph = getMapGraph('nuke');
    const levelByNode = new Map(graph.nodes.map((node) => [node.id, node.level]));
    const verticalEdges = graph.edges
      .filter((edge) => edge.kind === 'vertical')
      .map((edge) => edgeKey(edge.from, edge.to))
      .sort();

    expect([...levelByNode.entries()].filter(([, level]) => level === -1).map(([id]) => id).sort()).toEqual([
      'b_site',
      'double_doors',
      'ramp_lower',
      'secret',
      'vents'
    ]);
    expect([...levelByNode.entries()].filter(([, level]) => level === 0).map(([id]) => id).sort()).toEqual([
      'a_site',
      'ct_spawn',
      'garage',
      'heaven',
      'hut',
      'outside',
      'ramp',
      'silo',
      'squeaky',
      't_spawn'
    ]);
    expect(verticalEdges).toEqual([
      'a_site|vents',
      'ct_spawn|double_doors',
      'outside|secret',
      'ramp|ramp_lower',
      'secret|t_spawn'
    ]);
  });

  it.each(MAP_POOL)('creates a deterministic topology-preserving radar for %s', (mapId) => {
    const graph = getMapGraph(mapId);
    const first = createRadarPlan(graph, 'radar-seed');
    const second = createRadarPlan(graph, 'radar-seed');
    const alternate = createRadarPlan(graph, 'alternate-seed');

    expect(first.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(first.edges.map((edge) => edge.id)).toEqual(graph.edges.map((edge) => edge.id));
    expect(first.nodes.every((node) => node.x >= 0 && node.x <= 1 && node.y >= 0 && node.y <= 1)).toBe(true);
    expect(first.nodes.every((node) => node.roomWidth > 0 && node.roomHeight > 0)).toBe(true);
    expect(first.edges.every((edge) => edge.corridorWidth >= 34 / 500 && edge.corridorWidth <= 54 / 500)).toBe(true);
    expect(hashRadarPlan(first)).toBe(hashRadarPlan(second));
    expect(hashRadarPlan(first)).not.toBe(hashRadarPlan(alternate));
  });

  it('uses the supplied radar images for visual orientation without changing topology', () => {
    const cache = createRadarPlan(getMapGraph('cache'), 'image-layout');
    const nuke = createRadarPlan(getMapGraph('nuke'), 'image-layout');
    const x = (radar: ReturnType<typeof createRadarPlan>, nodeId: string) =>
      radar.nodes.find((node) => node.id === nodeId)?.x ?? 0;

    expect(x(cache, 't_spawn')).toBeGreaterThan(x(cache, 'ct_spawn'));
    expect(x(nuke, 't_spawn')).toBeLessThan(x(nuke, 'ct_spawn'));
  });

  it('carries optional room polygons into the normalized radar with rectangle fallback', () => {
    const graph = getMapGraph('ancient');
    const shapedNode = graph.nodes.find((node) => node.id === 'a_site');
    const fallbackNode = graph.nodes.find((node) => node.id === 'donut');
    const radar = createRadarPlan(graph, 'shape-test');

    expect(shapedNode?.shape?.length).toBeGreaterThanOrEqual(3);
    expect(fallbackNode?.shape).toBeUndefined();
    expect(radar.nodes.find((node) => node.id === 'a_site')?.shape?.every((point) =>
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
  });
});

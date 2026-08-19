import type { MapId } from '../../types';
import type { MapGraph, MapGraphEdge, MapGraphNode, MapNodeKind, MapTopologyMetadata } from './types';

const NODE_KINDS = new Set<MapNodeKind>([
  'spawn:T',
  'spawn:CT',
  'site:A',
  'site:B',
  'lane',
  'choke',
  'angle'
]);

const edgeKey = (first: string, second: string) =>
  first < second ? `${first}|${second}` : `${second}|${first}`;

interface ParsedNode extends MapGraphNode {
  neighbors: string[];
}

export function parseMapTopology(
  source: string,
  mapId: MapId,
  metadata: MapTopologyMetadata = {}
): MapGraph {
  const lines = source.trim().split(/\r?\n/);
  const header = lines.shift();
  if (header !== `${mapId}:`) throw new Error(`Topology header must be ${mapId}:`);

  const parsedNodes = new Map<string, ParsedNode>();
  const coordinateOwners = new Map<string, string>();
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*([a-z0-9_]+)\s+\(([^)]+)\)\s+@\s+(\d+),(\d+)\s+->\s+(.+)$/i);
    if (!match) throw new Error(`Invalid ${mapId} topology at line ${index + 2}: ${line}`);
    const [, id, rawKind, rawX, rawY, rawNeighbors] = match;
    const kind = rawKind as MapNodeKind;
    if (!NODE_KINDS.has(kind)) throw new Error(`Unknown node kind ${rawKind} in ${mapId}`);
    if (parsedNodes.has(id)) throw new Error(`Duplicate node ${id} in ${mapId}`);
    const coordinateKey = `${rawX},${rawY}`;
    if (coordinateOwners.has(coordinateKey)) {
      throw new Error(`Duplicate coordinate ${coordinateKey} in ${mapId}`);
    }
    coordinateOwners.set(coordinateKey, id);
    parsedNodes.set(id, {
      id,
      kind,
      x: Number(rawX),
      y: Number(rawY),
      level: metadata.levels?.[id] ?? 0,
      ...(metadata.shapes?.[id] ? { shape: metadata.shapes[id] } : {}),
      neighbors: rawNeighbors.split(',').map((neighbor) => neighbor.trim())
    });
  }

  for (const id of Object.keys(metadata.levels ?? {})) {
    if (!parsedNodes.has(id)) throw new Error(`Level metadata references unknown node ${id} in ${mapId}`);
  }
  for (const [id, shape] of Object.entries(metadata.shapes ?? {})) {
    if (!parsedNodes.has(id)) throw new Error(`Shape metadata references unknown node ${id} in ${mapId}`);
    if (shape.length < 3 || shape.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
      throw new Error(`Shape metadata for ${id} in ${mapId} must contain at least three finite points`);
    }
  }

  const verticalEdges = new Set((metadata.verticalEdges ?? []).map(([first, second]) => edgeKey(first, second)));
  const compiledEdges = new Map<string, MapGraphEdge>();
  for (const node of parsedNodes.values()) {
    const seenNeighbors = new Set<string>();
    for (const neighborId of node.neighbors) {
      if (neighborId === node.id) throw new Error(`Self edge at ${node.id} in ${mapId}`);
      if (seenNeighbors.has(neighborId)) throw new Error(`Duplicate adjacency ${node.id}->${neighborId} in ${mapId}`);
      seenNeighbors.add(neighborId);
      const neighbor = parsedNodes.get(neighborId);
      if (!neighbor) throw new Error(`Unknown adjacency ${node.id}->${neighborId} in ${mapId}`);
      if (!neighbor.neighbors.includes(node.id)) {
        throw new Error(`Asymmetric adjacency ${node.id}->${neighborId} in ${mapId}`);
      }
      const id = edgeKey(node.id, neighborId);
      compiledEdges.set(id, {
        id,
        from: node.id < neighborId ? node.id : neighborId,
        to: node.id < neighborId ? neighborId : node.id,
        kind: verticalEdges.has(id) ? 'vertical' : 'horizontal'
      });
    }
  }

  for (const verticalEdge of verticalEdges) {
    if (!compiledEdges.has(verticalEdge)) {
      throw new Error(`Vertical metadata references unknown edge ${verticalEdge} in ${mapId}`);
    }
  }

  const firstNode = parsedNodes.keys().next().value as string | undefined;
  const reached = new Set<string>();
  const pending = firstNode ? [firstNode] : [];
  while (pending.length) {
    const current = pending.pop();
    if (!current || reached.has(current)) continue;
    reached.add(current);
    pending.push(...(parsedNodes.get(current)?.neighbors ?? []));
  }
  if (reached.size !== parsedNodes.size) throw new Error(`Disconnected topology for ${mapId}`);

  const requiredKinds: MapNodeKind[] = ['spawn:T', 'spawn:CT', 'site:A', 'site:B'];
  for (const requiredKind of requiredKinds) {
    if (![...parsedNodes.values()].some((node) => node.kind === requiredKind)) {
      throw new Error(`Missing ${requiredKind} in ${mapId}`);
    }
  }

  const nodes = [...parsedNodes.values()].map(({ neighbors: _neighbors, ...node }) => node);
  return {
    version: 1,
    mapId,
    nodes,
    edges: [...compiledEdges.values()].sort((left, right) => left.id.localeCompare(right.id)),
    source
  };
}

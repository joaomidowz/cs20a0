import type { MapGraph } from './types';

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function findMapRoute(graph: MapGraph, startId: string, targetId: string, seed: string): string[] {
  if (startId === targetId) return [startId];
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }
  if (!adjacency.has(startId) || !adjacency.has(targetId)) {
    throw new Error(`Cannot route between unknown nodes ${startId} and ${targetId}`);
  }

  const queue: string[][] = [[startId]];
  const visited = new Set([startId]);
  while (queue.length) {
    const path = queue.shift();
    if (!path) break;
    const current = path[path.length - 1];
    const neighbors = [...(adjacency.get(current) ?? [])]
      .sort((left, right) => hashText(`${seed}:${current}:${left}`) - hashText(`${seed}:${current}:${right}`));
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      const nextPath = [...path, neighbor];
      if (neighbor === targetId) return nextPath;
      visited.add(neighbor);
      queue.push(nextPath);
    }
  }
  throw new Error(`No route between ${startId} and ${targetId} in ${graph.mapId}`);
}

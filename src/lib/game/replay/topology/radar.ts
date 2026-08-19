import type { MapGraph, RadarPlan, RadarPoint } from './types';
import { getImageAnnotatedPoint } from './layouts';

const round = (value: number) => Number(value.toFixed(6));

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRadarPlan(graph: MapGraph, seed: string): RadarPlan {
  const annotatedNodes = graph.nodes.map((node) => ({
    node,
    point: getImageAnnotatedPoint(graph.mapId, node)
  }));
  const geometryPoints = annotatedNodes.flatMap(({ node, point }) => [point, ...(node.shape ?? [])]);
  const xs = geometryPoints.map((point) => point.x);
  const ys = geometryPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const extent = Math.max(width, height);
  const padding = 0.08;
  const scale = 1 - padding * 2;
  const normalizePoint = (point: RadarPoint): RadarPoint => ({
    x: round(padding + ((extent - width) / 2 + point.x - minX) / extent * scale),
    y: round(padding + ((extent - height) / 2 + point.y - minY) / extent * scale)
  });
  const roomGeometry = {
    'site:A': { roomWidth: 82 / 500, roomHeight: 64 / 500, cornerRadius: 10 / 500 },
    'site:B': { roomWidth: 82 / 500, roomHeight: 64 / 500, cornerRadius: 10 / 500 },
    'spawn:T': { roomWidth: 72 / 500, roomHeight: 54 / 500, cornerRadius: 12 / 500 },
    'spawn:CT': { roomWidth: 72 / 500, roomHeight: 54 / 500, cornerRadius: 12 / 500 },
    lane: { roomWidth: 58 / 500, roomHeight: 46 / 500, cornerRadius: 9 / 500 },
    choke: { roomWidth: 44 / 500, roomHeight: 40 / 500, cornerRadius: 7 / 500 },
    angle: { roomWidth: 48 / 500, roomHeight: 42 / 500, cornerRadius: 8 / 500 }
  } as const;
  const nodes = annotatedNodes.map(({ node, point }) => ({
    ...node,
    ...normalizePoint(point),
    ...(node.shape ? { shape: node.shape.map(normalizePoint) } : {}),
    ...roomGeometry[node.kind]
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) throw new Error(`Radar edge ${edge.id} references an unknown node`);
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.max(0.0001, Math.hypot(deltaX, deltaY));
    const edgeHash = hashText(`${seed}:${graph.mapId}:${edge.id}`);
    const direction = edgeHash % 2 === 0 ? 1 : -1;
    const curve = (0.006 + ((edgeHash >>> 1) % 4) * 0.002) * direction;
    const midpoint: RadarPoint = {
      x: round((from.x + to.x) / 2 + (-deltaY / length) * curve),
      y: round((from.y + to.y) / 2 + (deltaX / length) * curve)
    };
    const corridorPixels = {
      'site:A': 54,
      'site:B': 54,
      'spawn:T': 48,
      'spawn:CT': 48,
      lane: 42,
      choke: 34,
      angle: 38
    } as const;
    const corridorWidth = edge.kind === 'vertical'
      ? 38 / 500
      : Math.max(34, Math.min(54, (corridorPixels[from.kind] + corridorPixels[to.kind]) / 2)) / 500;
    return {
      ...edge,
      corridorWidth: round(corridorWidth),
      path: [
        { x: from.x, y: from.y },
        midpoint,
        { x: to.x, y: to.y }
      ] as [RadarPoint, RadarPoint, RadarPoint]
    };
  });

  return {
    version: 1,
    mapId: graph.mapId,
    seed,
    nodes,
    edges,
    levels: [...new Set(nodes.map((node) => node.level))].sort((left, right) => right - left)
  };
}

export function hashRadarPlan(plan: RadarPlan): string {
  return hashText(JSON.stringify(plan)).toString(16).padStart(8, '0');
}

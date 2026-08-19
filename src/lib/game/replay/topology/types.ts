import type { MapId } from '../../types';

export type MapNodeKind = 'spawn:T' | 'spawn:CT' | 'site:A' | 'site:B' | 'lane' | 'choke' | 'angle';
export type MapEdgeKind = 'horizontal' | 'vertical';

export interface MapGraphNode {
  id: string;
  kind: MapNodeKind;
  x: number;
  y: number;
  level: number;
  shape?: RadarPoint[];
}

export interface MapGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: MapEdgeKind;
}

export interface MapGraph {
  version: 1;
  mapId: MapId;
  nodes: MapGraphNode[];
  edges: MapGraphEdge[];
  source: string;
}

export interface MapTopologyMetadata {
  levels?: Record<string, number>;
  verticalEdges?: Array<[string, string]>;
  shapes?: Record<string, RadarPoint[]>;
}

export interface RadarPoint {
  x: number;
  y: number;
}

export interface RadarNode extends MapGraphNode {
  x: number;
  y: number;
  roomWidth: number;
  roomHeight: number;
  cornerRadius: number;
}

export interface RadarEdge extends MapGraphEdge {
  path: [RadarPoint, RadarPoint, RadarPoint];
  corridorWidth: number;
}

export interface RadarPlan {
  version: 1;
  mapId: MapId;
  seed: string;
  nodes: RadarNode[];
  edges: RadarEdge[];
  levels: number[];
}

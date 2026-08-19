import ancientSource from './fixtures/ancient.topology.txt?raw';
import anubisSource from './fixtures/anubis.topology.txt?raw';
import cacheSource from './fixtures/cache.topology.txt?raw';
import dust2Source from './fixtures/dust2.topology.txt?raw';
import infernoSource from './fixtures/inferno.topology.txt?raw';
import mirageSource from './fixtures/mirage.topology.txt?raw';
import nukeSource from './fixtures/nuke.topology.txt?raw';
import nukeMetadata from './fixtures/nuke.levels.json';
import type { MapId } from '../../types';
import { parseMapTopology } from './parser';
import type { MapGraph, MapTopologyMetadata } from './types';
import { IMAGE_ANNOTATED_ROOM_SHAPES } from './layouts';

export const MAP_TOPOLOGY_SOURCES: Record<MapId, string> = {
  ancient: ancientSource,
  anubis: anubisSource,
  cache: cacheSource,
  dust2: dust2Source,
  inferno: infernoSource,
  mirage: mirageSource,
  nuke: nukeSource
};

const nukeTopologyMetadata: MapTopologyMetadata = {
  levels: nukeMetadata.levels,
  verticalEdges: nukeMetadata.verticalEdges.map((edge) => {
    if (edge.length !== 2) throw new Error('Nuke vertical edges must have exactly two endpoints');
    return [edge[0], edge[1]];
  }),
  shapes: IMAGE_ANNOTATED_ROOM_SHAPES.nuke
};

const metadataByMap: Partial<Record<MapId, MapTopologyMetadata>> = {
  ancient: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.ancient },
  anubis: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.anubis },
  cache: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.cache },
  dust2: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.dust2 },
  inferno: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.inferno },
  mirage: { shapes: IMAGE_ANNOTATED_ROOM_SHAPES.mirage },
  nuke: nukeTopologyMetadata
};

const graphs = new Map<MapId, MapGraph>();

export function getMapGraph(mapId: MapId): MapGraph {
  const cached = graphs.get(mapId);
  if (cached) return cached;
  const graph = parseMapTopology(MAP_TOPOLOGY_SOURCES[mapId], mapId, metadataByMap[mapId]);
  graphs.set(mapId, graph);
  return graph;
}

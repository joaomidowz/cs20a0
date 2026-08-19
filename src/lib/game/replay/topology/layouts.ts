import type { MapId } from '../../types';
import type { MapGraphNode, RadarPoint } from './types';

// Visual annotations follow the seven user-supplied radar images. They never
// add or remove graph edges; the versioned topology fixtures remain authoritative.
const imageCoordinateOverrides: Partial<Record<MapId, Record<string, RadarPoint>>> = {
  cache: {
    t_spawn: { x: 21, y: 12 },
    a_main: { x: 17, y: 8 },
    highway: { x: 13, y: 6 },
    a_site: { x: 8, y: 4 },
    quad: { x: 5, y: 5 },
    connector: { x: 10, y: 8 },
    mid: { x: 14, y: 11 },
    ct_mid: { x: 9, y: 11 },
    garage: { x: 18, y: 16 },
    b_main: { x: 15, y: 19 },
    b_site: { x: 10, y: 21 },
    checkers: { x: 7, y: 17 },
    vents: { x: 8, y: 14 },
    ct_spawn: { x: 3, y: 12 }
  },
  nuke: {
    t_spawn: { x: 3, y: 12 },
    outside: { x: 7, y: 12 },
    silo: { x: 6, y: 8 },
    garage: { x: 10, y: 10 },
    ramp: { x: 12, y: 11 },
    a_site: { x: 13, y: 13 },
    squeaky: { x: 10, y: 14 },
    hut: { x: 16, y: 12 },
    heaven: { x: 15, y: 10 },
    vents: { x: 15, y: 15 },
    secret: { x: 6, y: 16 },
    b_site: { x: 12, y: 18 },
    ramp_lower: { x: 10, y: 17 },
    double_doors: { x: 16, y: 17 },
    ct_spawn: { x: 20, y: 13 }
  }
};

const octagonalRoom = (x: number, y: number, width: number, height: number, cut = 0.8): RadarPoint[] => [
  { x: x - width / 2 + cut, y: y - height / 2 },
  { x: x + width / 2 - cut, y: y - height / 2 },
  { x: x + width / 2, y: y - height / 2 + cut },
  { x: x + width / 2, y: y + height / 2 - cut },
  { x: x + width / 2 - cut, y: y + height / 2 },
  { x: x - width / 2 + cut, y: y + height / 2 },
  { x: x - width / 2, y: y + height / 2 - cut },
  { x: x - width / 2, y: y - height / 2 + cut }
];

// Polygons annotate the major rooms visible in the references. Remaining nodes
// intentionally exercise the generator's rounded-rectangle fallback.
export const IMAGE_ANNOTATED_ROOM_SHAPES: Partial<Record<MapId, Record<string, RadarPoint[]>>> = {
  ancient: {
    a_site: octagonalRoom(5, 8, 4.2, 3.3),
    b_site: octagonalRoom(19, 10, 4.4, 3.5, 1.1),
    t_spawn: octagonalRoom(12, 22, 4.8, 3.2, 1.2),
    ct_spawn: octagonalRoom(12, 3, 5, 3.2, 1)
  },
  anubis: {
    a_site: octagonalRoom(19, 6, 4.5, 3.7, 1.2),
    b_site: octagonalRoom(5, 10, 4.2, 3.5),
    t_spawn: octagonalRoom(12, 22, 5.4, 3.2, 1.3),
    ct_spawn: octagonalRoom(11, 4, 4.8, 3.2)
  },
  cache: {
    a_site: octagonalRoom(8, 4, 4.8, 3.6),
    b_site: octagonalRoom(10, 21, 4.6, 3.5, 1.1),
    t_spawn: octagonalRoom(21, 12, 4.4, 3.6),
    ct_spawn: octagonalRoom(3, 12, 4.4, 3.6)
  },
  dust2: {
    a_site: octagonalRoom(18, 7, 4.7, 3.5, 1.1),
    b_site: octagonalRoom(5, 8, 4.5, 3.6),
    t_spawn: octagonalRoom(11, 22, 5.2, 3.4, 1.3),
    ct_spawn: octagonalRoom(12, 4, 4.8, 3.2)
  },
  inferno: {
    a_site: octagonalRoom(17, 8, 4.6, 3.6, 1.1),
    b_site: octagonalRoom(4, 9, 4.5, 3.7),
    t_spawn: octagonalRoom(12, 22, 5, 3.4, 1.2),
    ct_spawn: octagonalRoom(9, 4, 4.7, 3.2)
  },
  mirage: {
    a_site: octagonalRoom(5, 11, 4.7, 3.8, 1.1),
    b_site: octagonalRoom(19, 11, 4.7, 3.8),
    t_spawn: octagonalRoom(12, 22, 5.1, 3.4, 1.2),
    ct_spawn: octagonalRoom(11, 5, 4.6, 3.2)
  },
  nuke: {
    a_site: octagonalRoom(13, 13, 4.8, 3.8, 1.1),
    b_site: octagonalRoom(12, 18, 4.7, 3.5),
    t_spawn: octagonalRoom(3, 12, 4.5, 3.6),
    ct_spawn: octagonalRoom(20, 13, 4.5, 3.6)
  }
};

export function getImageAnnotatedPoint(mapId: MapId, node: MapGraphNode): RadarPoint {
  return imageCoordinateOverrides[mapId]?.[node.id] ?? { x: node.x, y: node.y };
}

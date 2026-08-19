import type { ReplayFrameV1 } from '../types';
import type { RadarPlan, RadarPoint } from '../topology/types';
import { worldToScreen, type ViewportTransform } from './transform';

export type ReplayHit = { kind: 'player' | 'callout'; id: string };

const distance = (first: RadarPoint, second: RadarPoint) =>
  Math.hypot(first.x - second.x, first.y - second.y);

export function hitTestReplay(
  frame: ReplayFrameV1,
  radar: RadarPlan,
  transform: ViewportTransform,
  screenPoint: RadarPoint
): ReplayHit | null {
  const player = frame.players
    .map((candidate) => ({ candidate, distance: distance(worldToScreen(transform, candidate), screenPoint) }))
    .filter(({ distance: candidateDistance }) => candidateDistance <= 14)
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  if (player) return { kind: 'player', id: player.playerId };

  const node = radar.nodes
    .map((candidate) => {
      const point = worldToScreen(transform, candidate);
      const inside = Math.abs(point.x - screenPoint.x) <= candidate.roomWidth * transform.scale / 2
        && Math.abs(point.y - screenPoint.y) <= candidate.roomHeight * transform.scale / 2;
      return { candidate, distance: distance(point, screenPoint), inside };
    })
    .filter(({ inside }) => inside)
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  return node ? { kind: 'callout', id: node.id } : null;
}

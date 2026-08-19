import type { MapGraph, RadarPlan } from './topology/types';
import { createRadarPlan } from './topology/radar';
import type {
  ReplayBombFrameV1,
  ReplayEventV1,
  ReplayFrameV1,
  ReplayGrenadeEventV1,
  ReplayGrenadeFrameV1,
  ReplayPlanV1,
  ReplayPlayerFrameV1,
  ReplayRouteV1,
  ReplayV1
} from './types';

const round = (value: number) => Number(value.toFixed(6));
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export interface ReplayPosition {
  x: number;
  y: number;
  level: number;
}

export function interpolateRoutePosition(
  route: ReplayRouteV1,
  radar: RadarPlan,
  atMs: number
): ReplayPosition {
  const stopOffset = route.stopOffset ?? { x: 0, y: 0 };
  const points = route.nodeIds.map((nodeId) => {
    const node = radar.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Route references unknown radar node ${nodeId}`);
    return node;
  });
  if (!points.length) throw new Error(`Player ${route.playerId} has an empty route`);
  if (points.length === 1 || atMs <= route.startAtMs) {
    return { x: points[0].x, y: points[0].y, level: points[0].level };
  }
  const finalPoint = points[points.length - 1];
  if (atMs >= route.endAtMs) {
    return {
      x: round(finalPoint.x + stopOffset.x),
      y: round(finalPoint.y + stopOffset.y),
      level: finalPoint.level
    };
  }

  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return { x: finalPoint.x, y: finalPoint.y, level: finalPoint.level };
  const progress = clamp((atMs - route.startAtMs) / Math.max(1, route.endAtMs - route.startAtMs), 0, 1);
  let remaining = progress * totalLength;
  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index];
    if (remaining <= segmentLength || index === lengths.length - 1) {
      const localProgress = clamp(remaining / Math.max(0.000001, segmentLength), 0, 1);
      const from = points[index];
      const to = points[index + 1];
      return {
        x: round(from.x + (to.x - from.x) * localProgress + stopOffset.x * progress),
        y: round(from.y + (to.y - from.y) * localProgress + stopOffset.y * progress),
        level: localProgress < 0.5 ? from.level : to.level
      };
    }
    remaining -= segmentLength;
  }
  return { x: finalPoint.x, y: finalPoint.y, level: finalPoint.level };
}

function playerFrame(
  plan: ReplayPlanV1,
  roundIndex: number,
  radar: RadarPlan,
  playerId: string,
  relativeAtMs: number
): ReplayPlayerFrameV1 {
  const roundPlan = plan.rounds[roundIndex];
  const player = plan.players.find((candidate) => candidate.id === playerId);
  const route = roundPlan.routes.find((candidate) => candidate.playerId === playerId);
  if (!player || !route) throw new Error(`Missing replay player or route for ${playerId}`);
  let hp = 100;
  let killed = false;
  for (const event of roundPlan.events) {
    if (event.atMs > relativeAtMs) break;
    if (event.type === 'damage' && event.targetPlayerId === playerId && !killed) {
      hp = Math.max(0, hp - Math.min(hp, event.damage));
    }
    if (event.type === 'kill' && event.victimPlayerId === playerId) {
      hp = 0;
      killed = true;
    }
  }
  const position = interpolateRoutePosition(route, radar, relativeAtMs);
  return {
    playerId,
    organizationId: player.organizationId,
    side: player.organizationId === roundPlan.tOrganizationId ? 'T' : 'CT',
    ...position,
    hp,
    alive: hp > 0 && !killed
  };
}

function grenadeFrames(
  roundEvents: ReplayEventV1[],
  playerFrames: ReplayPlayerFrameV1[],
  radar: RadarPlan,
  relativeAtMs: number
): ReplayGrenadeFrameV1[] {
  return roundEvents
    .filter((event): event is ReplayGrenadeEventV1 =>
      event.type === 'grenade' && relativeAtMs >= event.atMs && relativeAtMs < event.atMs + 1_500)
    .map((event) => {
      const source = playerFrames.find((player) => player.playerId === event.playerId);
      const target = radar.nodes.find((node) => node.id === event.targetNodeId);
      if (!source || !target) throw new Error(`Cannot expand grenade ${event.id}`);
      const progress = clamp((relativeAtMs - event.atMs) / 1_500, 0, 1);
      return {
        eventId: event.id,
        grenadeType: event.grenadeType,
        x: round(source.x + (target.x - source.x) * progress),
        y: round(source.y + (target.y - source.y) * progress),
        level: progress < 0.5 ? source.level : target.level,
        progress: round(progress)
      };
    });
}

function bombFrame(
  plan: ReplayPlanV1,
  roundIndex: number,
  relativeAtMs: number
): ReplayBombFrameV1 {
  const roundPlan = plan.rounds[roundIndex];
  const plant = roundPlan.events.find((event) => event.type === 'plant');
  const resolution = roundPlan.events.find((event) => event.type === 'defuse' || event.type === 'explosion');
  if (resolution && relativeAtMs >= resolution.atMs) {
    return {
      state: resolution.type === 'defuse' ? 'defused' : 'exploded',
      siteNodeId: resolution.siteNodeId
    };
  }
  if (plant && relativeAtMs >= plant.atMs) return { state: 'planted', siteNodeId: plant.siteNodeId };
  const carrier = plan.players.find((player) => player.organizationId === roundPlan.tOrganizationId);
  return { state: 'carried', ...(carrier ? { carrierPlayerId: carrier.id } : {}) };
}

export function expandReplayPlan(plan: ReplayPlanV1, graph: MapGraph): ReplayV1 {
  if (plan.mapId !== graph.mapId) throw new Error(`Replay ${plan.id} does not match graph ${graph.mapId}`);
  const radar = createRadarPlan(graph, plan.id);
  const frames: ReplayFrameV1[] = [];
  const events: ReplayEventV1[] = [];
  const tickMs = 1_000 / plan.tickRate;
  let offsetMs = 0;
  let frameIndex = 0;

  plan.rounds.forEach((roundPlan, roundIndex) => {
    for (const event of roundPlan.events) events.push({ ...event, atMs: offsetMs + event.atMs });
    const frameTimes: number[] = [];
    for (let relativeAtMs = 0; relativeAtMs < roundPlan.durationMs; relativeAtMs += tickMs) {
      frameTimes.push(relativeAtMs);
    }
    frameTimes.push(roundPlan.durationMs);
    for (const relativeAtMs of frameTimes) {
      const players = plan.players.map((player) =>
        playerFrame(plan, roundIndex, radar, player.id, relativeAtMs));
      frames.push({
        index: frameIndex++,
        roundNumber: roundPlan.number,
        atMs: offsetMs + relativeAtMs,
        players,
        grenades: grenadeFrames(roundPlan.events, players, radar, relativeAtMs),
        bomb: bombFrame(plan, roundIndex, relativeAtMs)
      });
    }
    offsetMs += roundPlan.durationMs;
  });

  return {
    version: 1,
    planId: plan.id,
    mapId: plan.mapId,
    tickRate: 4,
    durationMs: offsetMs,
    frames,
    events
  };
}

export function sliceReplayThroughRound(replay: ReplayV1, visibleRounds: number): ReplayV1 {
  const maximumRound = Math.max(0, Math.floor(visibleRounds));
  const frames = replay.frames.filter((frame) => frame.roundNumber <= maximumRound);
  const events = replay.events.filter((event) => event.roundNumber <= maximumRound);
  const durationMs = frames.at(-1)?.atMs ?? 0;
  return { ...replay, durationMs, frames, events };
}

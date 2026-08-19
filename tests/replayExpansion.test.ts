import { describe, expect, it } from 'vitest';
import { canonicalReplayHash } from '../src/lib/game/replay/canonical';
import {
  expandReplayPlan,
  interpolateRoutePosition,
  sliceReplayThroughRound
} from '../src/lib/game/replay/expand';
import { createReplayPlan } from '../src/lib/game/replay/plan';
import { getMapGraph } from '../src/lib/game/replay/topology/maps';
import { createRadarPlan } from '../src/lib/game/replay/topology/radar';
import type { CombatTeam, RoundScore, SeriesResult } from '../src/lib/game/types';

function team(id: string): CombatTeam {
  return {
    id,
    organizationId: id,
    name: id,
    power: 84,
    mental: 84,
    clutch: 84,
    experience: 84,
    lineup: Array.from({ length: 5 }, (_, index) => ({
      playerId: `${id}-${index + 1}`,
      selectedSlotRole: index === 0 ? 'awper' : index === 1 ? 'igl' : index === 2 ? 'entry' : index === 3 ? 'support' : 'rifler'
    }))
  };
}

function rounds(): RoundScore[] {
  const result: RoundScore[] = [];
  let a = 0;
  let b = 0;
  while (a < 13 && b < 13) {
    if ((a + b) % 3 === 0) b += 1;
    else a += 1;
    result.push({ a, b, overtime: false });
  }
  return result;
}

function series(): SeriesResult {
  const mapRounds = rounds();
  return {
    id: 'replay-expansion-series',
    phase: 'stage3',
    bestOf: 3,
    teamA: team('alpha'),
    teamB: team('bravo'),
    scoreA: 1,
    scoreB: 0,
    winnerId: 'alpha',
    maps: [{
      map: 1,
      mapId: 'ancient',
      scoreA: mapRounds.at(-1)?.a ?? 0,
      scoreB: mapRounds.at(-1)?.b ?? 0,
      winnerId: 'alpha',
      rounds: mapRounds,
      overtime: false
    }],
    userMatch: true
  };
}

describe('replay expansion', () => {
  it('expands the same plan twice to the same canonical replay at 4 Hz', () => {
    const plan = createReplayPlan(series(), 0);
    const graph = getMapGraph(plan.mapId);
    const first = expandReplayPlan(plan, graph);
    const second = expandReplayPlan(plan, graph);

    expect(first).toEqual(second);
    expect(first.tickRate).toBe(4);
    expect(canonicalReplayHash(first)).toBe(canonicalReplayHash(second));
    expect(first.frames.length).toBeGreaterThan(plan.rounds.length * 100);
    expect(first.events).toHaveLength(plan.rounds.reduce((total, round) => total + round.events.length, 0));
    expect(first.frames.every((frame) => !('events' in frame))).toBe(true);
  }, 15_000);

  it('interpolates a route before, between and after its movement window', () => {
    const graph = getMapGraph('ancient');
    const radar = createRadarPlan(graph, 'route-seed');
    const route = {
      playerId: 'p1',
      tacticalRole: 'entry' as const,
      nodeIds: ['t_spawn', 'a_main'],
      startAtMs: 100,
      endAtMs: 1_100,
      stopOffset: { x: 0, y: 0 }
    };
    const start = radar.nodes.find((node) => node.id === 't_spawn');
    const end = radar.nodes.find((node) => node.id === 'a_main');

    expect(interpolateRoutePosition(route, radar, 0)).toEqual({ x: start?.x, y: start?.y, level: start?.level });
    expect(interpolateRoutePosition(route, radar, 600)).toEqual({
      x: Number((((start?.x ?? 0) + (end?.x ?? 0)) / 2).toFixed(6)),
      y: Number((((start?.y ?? 0) + (end?.y ?? 0)) / 2).toFixed(6)),
      level: 0
    });
    expect(interpolateRoutePosition(route, radar, 2_000)).toEqual({ x: end?.x, y: end?.y, level: end?.level });
  });

  it('tracks active grenades, deaths and bomb state in continuous frames', () => {
    const plan = createReplayPlan(series(), 0);
    const replay = expandReplayPlan(plan, getMapGraph(plan.mapId));
    const grenade = replay.events.find((event) => event.type === 'grenade');
    const kill = replay.events.find((event) => event.type === 'kill');
    const plant = replay.events.find((event) => event.type === 'plant');
    const objective = replay.events.find((event) => event.type === 'defuse' || event.type === 'explosion');
    const grenadeFrame = replay.frames.find((frame) => grenade && frame.atMs >= grenade.atMs + 250);
    const deathFrame = replay.frames.find((frame) => kill && frame.atMs >= kill.atMs);
    const plantedFrame = replay.frames.find((frame) => plant && objective && frame.atMs >= plant.atMs && frame.atMs < objective.atMs);
    const objectiveFrame = replay.frames.find((frame) => objective && frame.atMs >= objective.atMs);

    expect(grenadeFrame?.grenades.length).toBeGreaterThan(0);
    expect(deathFrame?.players.find((player) => kill?.type === 'kill' && player.playerId === kill.victimPlayerId)?.alive).toBe(false);
    expect(plantedFrame?.bomb.state).toBe('planted');
    expect(objectiveFrame?.bomb.state).toBe(objective?.type === 'defuse' ? 'defused' : 'exploded');
  });

  it('removes future rounds when the viewer has received only a prefix', () => {
    const plan = createReplayPlan(series(), 0);
    const replay = expandReplayPlan(plan, getMapGraph(plan.mapId));
    const visible = sliceReplayThroughRound(replay, 3);

    expect(visible.events.every((event) => event.roundNumber <= 3)).toBe(true);
    expect(visible.frames.every((frame) => frame.roundNumber <= 3)).toBe(true);
    expect(visible.durationMs).toBeLessThan(replay.durationMs);
  });
});

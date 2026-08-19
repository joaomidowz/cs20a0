import { describe, expect, it } from 'vitest';
import { createReplayPlan, getRoundSides } from '../src/lib/game/replay/plan';
import { aggregateReplayStats } from '../src/lib/game/replay/stats';
import { getMapGraph } from '../src/lib/game/replay/topology/maps';
import type { CombatTeam, MapResult, RoundScore, SeriesResult } from '../src/lib/game/types';

function team(id: string): CombatTeam {
  return {
    id,
    organizationId: id,
    name: id.toUpperCase(),
    power: 85,
    mental: 85,
    clutch: 85,
    experience: 85,
    lineup: Array.from({ length: 5 }, (_, index) => ({
      playerId: `${id}-player-${index + 1}`,
      selectedSlotRole: index === 0 ? 'awper' : index === 1 ? 'igl' : index === 2 ? 'entry' : index === 3 ? 'support' : 'lurker'
    }))
  };
}

function regulationRounds(): RoundScore[] {
  let a = 0;
  let b = 0;
  const rounds: RoundScore[] = [];
  for (let index = 0; index < 22; index += 1) {
    if (index % 2 === 0) a += 1;
    else b += 1;
    rounds.push({ a, b, overtime: false });
  }
  rounds.push({ a: ++a, b, overtime: false });
  rounds.push({ a: ++a, b, overtime: false });
  return rounds;
}

const map: MapResult = {
  map: 1,
  mapId: 'mirage',
  scoreA: 13,
  scoreB: 11,
  winnerId: 'alpha',
  rounds: regulationRounds(),
  overtime: false
};

const series: SeriesResult = {
  id: 'stage3-1-alpha-bravo',
  phase: 'stage3',
  bestOf: 3,
  teamA: team('alpha'),
  teamB: team('bravo'),
  scoreA: 1,
  scoreB: 0,
  winnerId: 'alpha',
  maps: [map],
  userMatch: true
};

describe('replay plan', () => {
  it('derives a deterministic plan without contradicting the simulated map', () => {
    const first = createReplayPlan(series, 0);
    const second = createReplayPlan(series, 0);

    expect(first).toEqual(second);
    expect(first.id).toBe('stage3-1-alpha-bravo:0');
    expect(first.mapId).toBe('mirage');
    expect(first.result).toEqual({ scoreA: 13, scoreB: 11, winnerOrganizationId: 'alpha' });
    expect(first.rounds).toHaveLength(24);
    expect(first.rounds.at(-1)?.winnerOrganizationId).toBe('alpha');
    expect(first.organizations.map((organization) => organization.id)).toEqual(['alpha', 'bravo']);
    expect(first.players).toHaveLength(10);
  });

  it('assigns regulation and overtime sides in deterministic blocks', () => {
    expect(getRoundSides(series, 1)).toEqual({ tOrganizationId: 'alpha', ctOrganizationId: 'bravo' });
    expect(getRoundSides(series, 12)).toEqual({ tOrganizationId: 'alpha', ctOrganizationId: 'bravo' });
    expect(getRoundSides(series, 13)).toEqual({ tOrganizationId: 'bravo', ctOrganizationId: 'alpha' });
    expect(getRoundSides(series, 24)).toEqual({ tOrganizationId: 'bravo', ctOrganizationId: 'alpha' });
    expect(getRoundSides(series, 25)).toEqual({ tOrganizationId: 'alpha', ctOrganizationId: 'bravo' });
    expect(getRoundSides(series, 28)).toEqual({ tOrganizationId: 'bravo', ctOrganizationId: 'alpha' });
  });

  it('uses only declared graph edges in every player route', () => {
    const plan = createReplayPlan(series, 0);
    const graph = getMapGraph('mirage');
    const graphEdges = new Set(graph.edges.map((edge) => edge.id));
    const edgeKey = (first: string, second: string) =>
      first < second ? `${first}|${second}` : `${second}|${first}`;

    for (const round of plan.rounds) {
      for (const route of round.routes) {
        for (let index = 1; index < route.nodeIds.length; index += 1) {
          expect(graphEdges.has(edgeKey(route.nodeIds[index - 1], route.nodeIds[index]))).toBe(true);
        }
      }
    }
  });

  it('contains all minimum discrete event categories without embedding them in frames', () => {
    const eventTypes = new Set(createReplayPlan(series, 0).rounds.flatMap((round) => round.events.map((event) => event.type)));
    expect(eventTypes).toEqual(new Set([
      'shot',
      'damage',
      'kill',
      'grenade',
      'plant',
      'defuse',
      'explosion',
      'round-end'
    ]));
  });

  it('emits victim-level damage that is not a kills multiplied by 100 estimate', () => {
    const plan = createReplayPlan(series, 0);
    const damageEvents = plan.rounds.flatMap((round) => round.events.filter((event) => event.type === 'damage'));
    const report = aggregateReplayStats(plan);
    const nonZeroDamage = report.players.map((player) => player.damage).filter((damage) => damage > 0);

    expect(damageEvents.length).toBeGreaterThan(plan.rounds.flatMap((round) => round.events.filter((event) => event.type === 'kill')).length);
    expect(new Set(damageEvents.map((event) => event.type === 'damage' ? event.targetPlayerId : '')).size).toBeGreaterThan(2);
    expect(nonZeroDamage.every((damage) => damage % 100 === 0)).toBe(false);
  });

  it('declares tactical splits, CT setups, roles, timing noise and dispersed stopping points', () => {
    const plan = createReplayPlan(series, 0);
    const splitKinds = new Set(plan.rounds.map((round) => round.tSplit));
    const executeTimes = new Set(plan.rounds.map((round) => round.executeAtMs));
    const graph = getMapGraph(plan.mapId);

    expect([...splitKinds].every((split) => ['5-0', '4-1', '3-2', '2-1-2'].includes(split))).toBe(true);
    expect(splitKinds.size).toBeGreaterThan(1);
    expect(executeTimes.size).toBeGreaterThan(1);
    expect(plan.players.map((player) => player.tacticalRole)).toEqual(expect.arrayContaining(['entry', 'trade', 'support', 'awp', 'lurk']));

    for (const round of plan.rounds) {
      expect(round.ctSetup.a + round.ctSetup.b + round.ctSetup.mid).toBe(5);
      expect(new Set(round.routes.map((route) => route.nodeIds.at(-1))).size).toBeGreaterThanOrEqual(3);
      expect(round.routes.every((route) => Math.abs(route.stopOffset.x) <= 0.025 && Math.abs(route.stopOffset.y) <= 0.025)).toBe(true);
      const tLurk = round.routes.find((route) =>
        route.tacticalRole === 'lurk' && plan.players.find((player) => player.id === route.playerId)?.organizationId === round.tOrganizationId);
      expect(tLurk?.startAtMs).toBeGreaterThanOrEqual(6_000);
      expect(tLurk?.startAtMs).toBeLessThanOrEqual(10_000);
      const awpRoute = round.routes.find((route) => route.tacticalRole === 'awp');
      const awpStop = graph.nodes.find((node) => node.id === awpRoute?.nodeIds.at(-1));
      expect(awpStop?.kind).toBe('angle');
      const tEntry = round.routes.find((route) => route.tacticalRole === 'entry' &&
        plan.players.find((player) => player.id === route.playerId)?.organizationId === round.tOrganizationId);
      const tTrade = round.routes.find((route) => route.tacticalRole === 'trade' &&
        plan.players.find((player) => player.id === route.playerId)?.organizationId === round.tOrganizationId);
      expect(tTrade?.nodeIds).toEqual(tEntry?.nodeIds);
      expect(tTrade?.startAtMs).toBeGreaterThan(tEntry?.startAtMs ?? 0);
    }
  });

  it('falls back to advancing rifler and delayed support when awp and lurk are absent', () => {
    const fallbackSeries: SeriesResult = {
      ...series,
      teamA: {
        ...series.teamA,
        lineup: series.teamA.lineup?.map((slot, index) => ({
          ...slot,
          selectedSlotRole: index === 0 ? 'entry' : index === 1 ? 'support' : 'rifler'
        }))
      }
    };
    const plan = createReplayPlan(fallbackSeries, 0);
    const fallbackPlayers = plan.players.filter((player) => player.organizationId === 'alpha');
    const alphaT = plan.rounds.find((round) => round.tOrganizationId === 'alpha');
    const delayedSupport = alphaT?.routes.find((route) => route.tacticalRole === 'support');

    expect(fallbackPlayers.some((player) => player.tacticalRole === 'awp')).toBe(false);
    expect(fallbackPlayers.some((player) => player.tacticalRole === 'lurk')).toBe(false);
    expect(fallbackPlayers.filter((player) => player.tacticalRole === 'rifler').length).toBeGreaterThan(0);
    expect(delayedSupport?.startAtMs).toBeGreaterThanOrEqual(6_000);
  });
});

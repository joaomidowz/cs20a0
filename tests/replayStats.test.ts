import { describe, expect, it } from 'vitest';
import { aggregateReplayStats, reconcileReplayStats } from '../src/lib/game/replay/stats';
import type { ReplayEventV1, ReplayPlanV1, ReplayRoundPlanV1 } from '../src/lib/game/replay/types';
import type { PlayerRunStats } from '../src/lib/game/types';

const players = [
  { id: 'p1', organizationId: 'alpha', role: 'entry' as const, tacticalRole: 'entry' as const },
  { id: 'p2', organizationId: 'bravo', role: 'entry' as const, tacticalRole: 'entry' as const },
  { id: 'p3', organizationId: 'bravo', role: 'rifler' as const, tacticalRole: 'trade' as const },
  { id: 'p4', organizationId: 'bravo', role: 'support' as const, tacticalRole: 'support' as const }
];

function round(number: number, events: ReplayEventV1[]): ReplayRoundPlanV1 {
  return {
    number,
    durationMs: 10_000,
    winnerOrganizationId: number === 4 ? 'bravo' : 'alpha',
    tOrganizationId: 'alpha',
    ctOrganizationId: 'bravo',
    tSplit: '4-1',
    ctSetup: { a: 2, b: 2, mid: 1 },
    executeAtMs: 5_000,
    routes: [],
    loadouts: [],
    events
  };
}

function plan(): ReplayPlanV1 {
  const base = (roundNumber: number, atMs: number, sequence: number, id: string) => ({
    id,
    roundNumber,
    atMs,
    sequence,
    nodeId: 'a_site'
  });
  return {
    version: 1,
    id: 'stats-plan',
    seriesId: 'stats-series',
    mapIndex: 0,
    mapId: 'ancient',
    tickRate: 4,
    organizations: [
      { id: 'alpha', name: 'Alpha', style: 'balanced' },
      { id: 'bravo', name: 'Bravo', style: 'balanced' }
    ],
    players,
    result: { scoreA: 5, scoreB: 1, winnerOrganizationId: 'alpha' },
    rounds: [
      round(1, [
        { ...base(1, 100, 0, 'r1-d1'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 60, weapon: 'ak47' },
        { ...base(1, 100, 1, 'r1-d2'), type: 'damage', sourcePlayerId: 'p3', targetPlayerId: 'p2', damage: 60, weapon: 'm4a1' },
        { ...base(1, 100, 2, 'r1-k1'), type: 'kill', killerPlayerId: 'p3', victimPlayerId: 'p2', weapon: 'm4a1' },
        { ...base(1, 100, 3, 'r1-late'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 30, weapon: 'ak47' }
      ]),
      round(2, [
        { ...base(2, 500, 0, 'r2-he-1'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 40, weapon: 'he' },
        { ...base(2, 500, 1, 'r2-he-2'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p4', damage: 55, weapon: 'he' }
      ]),
      round(3, [
        { ...base(3, 100, 0, 'r3-m1'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 30, weapon: 'molotov' },
        { ...base(3, 200, 1, 'r3-m2'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 30, weapon: 'molotov' },
        { ...base(3, 300, 2, 'r3-m3'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 30, weapon: 'molotov' },
        { ...base(3, 400, 3, 'r3-m4'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 30, weapon: 'molotov' }
      ]),
      round(4, [
        { ...base(4, 1_000, 0, 'r4-k1'), type: 'kill', killerPlayerId: 'p1', victimPlayerId: 'p2', weapon: 'ak47' },
        { ...base(4, 3_500, 1, 'r4-k2'), type: 'kill', killerPlayerId: 'p3', victimPlayerId: 'p1', weapon: 'm4a1' }
      ]),
      round(5, [
        { ...base(5, 0, 0, 'r5-d1'), type: 'damage', sourcePlayerId: 'p1', targetPlayerId: 'p2', damage: 40, weapon: 'ak47' },
        { ...base(5, 6_001, 1, 'r5-k1'), type: 'kill', killerPlayerId: 'p3', victimPlayerId: 'p2', weapon: 'm4a1' }
      ]),
      round(6, [
        { ...base(6, 1_000, 0, 'r6-k1'), type: 'kill', killerPlayerId: 'p1', victimPlayerId: 'p2', weapon: 'ak47', flashAssistantPlayerId: 'p4' }
      ])
    ]
  };
}

describe('replay event statistics', () => {
  it('caps simultaneous lethal damage and ignores damage after the kill in the same tick', () => {
    const report = aggregateReplayStats(plan());
    const p1 = report.players.find((player) => player.playerId === 'p1');
    const p3 = report.players.find((player) => player.playerId === 'p3');

    expect(p1?.damage).toBe(295);
    expect(p3?.damage).toBe(40);
    expect(p3?.kills).toBe(3);
  });

  it('counts HE damage per victim and molotov ticks without double counting HP', () => {
    const p1 = aggregateReplayStats(plan()).players.find((player) => player.playerId === 'p1');
    expect(p1?.damage).toBe(60 + 40 + 55 + 100 + 40);
  });

  it('handles trades, damage assist expiry and flash assists independently', () => {
    const report = aggregateReplayStats(plan());
    const p1 = report.players.find((player) => player.playerId === 'p1');
    const p3 = report.players.find((player) => player.playerId === 'p3');
    const p4 = report.players.find((player) => player.playerId === 'p4');

    expect(p1?.assists).toBe(1);
    expect(p3?.trades).toBe(1);
    expect(p4?.flashAssists).toBe(1);
  });

  it('produces an explicit shadow reconciliation without replacing legacy stats', () => {
    const derived = aggregateReplayStats(plan());
    const nonZeroDamage = derived.players.map((player) => player.damage).filter((damage) => damage > 0);
    const legacy: PlayerRunStats[] = players.map((player) => ({
      playerId: player.id,
      assignedRole: player.role,
      runRating: 1,
      kills: 10,
      deaths: 8,
      kdRatio: 1.25,
      adr: 75,
      impact: 1,
      clutches: 0,
      openingKills: 0,
      mvpCount: 0,
      consistency: 80,
      mapsPlayed: 1,
      mapsWon: 1,
      mapsLost: 0,
      roundsWon: 5,
      roundsLost: 1
    }));
    const reconciliation = reconcileReplayStats(legacy, derived);

    expect(reconciliation.some((entry) => entry.metric === 'kills' && entry.legacyValue !== entry.eventValue)).toBe(true);
    expect(reconciliation.every((entry) => entry.rulesVersion === 'replay-stats-v1')).toBe(true);
    expect(reconciliation.filter((entry) => entry.difference !== 0).every((entry) => entry.knownReason === 'offline-replay-model')).toBe(true);
    expect(nonZeroDamage.every((damage) => damage % 100 === 0)).toBe(false);
    expect(legacy[0].kills).toBe(10);
  });
});

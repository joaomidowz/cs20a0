import { describe, expect, it } from 'vitest';
import { createMirageNavigation } from '../src/lib/game/replay/golden/navigation';
import { simulateGoldenMirage } from '../src/lib/game/replay/golden/simulate';
import { readGoldenPlayerSnapshot } from '../src/lib/game/replay/golden/snapshot';
import { createGoldenReplayPlanFixture } from './helpers/goldenMirage';

describe('Mirage golden simulation', () => {
  it('is deterministic for the same replay plan', () => {
    const plan = createGoldenReplayPlanFixture();

    const first = simulateGoldenMirage(plan);
    const second = simulateGoldenMirage(plan);

    expect([...first.rounds[0].snapshots]).toEqual([...second.rounds[0].snapshots]);
    expect(first.rounds[0].events).toEqual(second.rounds[0].events);
  });

  it('finishes every round with the official winner', () => {
    const plan = createGoldenReplayPlanFixture({ winners: ['alpha', 'beta', 'alpha', 'alpha'] });

    const replay = simulateGoldenMirage(plan);

    expect(replay.rounds.map((round) => round.winnerOrganizationId)).toEqual([
      'alpha',
      'beta',
      'alpha',
      'alpha'
    ]);
    expect(replay.validation.mismatchedRoundWinners).toEqual([]);
  });

  it('keeps every live snapshot on a free grid cell', () => {
    const replay = simulateGoldenMirage(createGoldenReplayPlanFixture());
    const navigation = createMirageNavigation();
    const round = replay.rounds[0];
    const stride = round.playerIds.length * 7;

    for (let frame = 0; frame < round.frames; frame += 1) {
      for (let player = 0; player < round.playerIds.length; player += 1) {
        const offset = frame * stride + player * 7;
        if ((round.snapshots[offset + 4] & 1) === 0) continue;
        expect(navigation.isFree(round.snapshots[offset], round.snapshots[offset + 1])).toBe(true);
      }
    }
    expect(replay.validation.blockedPlayerSnapshots).toBe(0);
  });

  it('starts pistol halves with sidearms instead of free rifles', () => {
    const winners = Array.from({ length: 13 }, (_, index) => index % 2 ? 'beta' : 'alpha');
    const replay = simulateGoldenMirage(createGoldenReplayPlanFixture({ winners }));

    for (const round of [replay.rounds[0], replay.rounds[12]]) {
      expect(round.startState.every((state) =>
        state.inventory.primary === (state.side === 'T' ? 'glock' : 'usp'))).toBe(true);
    }
  });

  it('purchases and consumes emitted utility in the live inventory snapshots', () => {
    const round = simulateGoldenMirage(createGoldenReplayPlanFixture()).rounds[0];
    const throwEvent = round.events.find((event) => event.type === 'grenade');

    expect(throwEvent).toBeDefined();
    const playerIndex = round.playerIds.indexOf(throwEvent!.playerId!);
    const start = round.startState[playerIndex].inventory.grenades[throwEvent!.grenade!];
    const afterThrow = readGoldenPlayerSnapshot(
      round,
      Math.ceil(throwEvent!.tick / round.frameStrideTicks),
      playerIndex
    );

    expect(start).toBeGreaterThan(0);
    expect(afterThrow.grenades[throwEvent!.grenade!]).toBeLessThan(start);
  });

  it('never emits a bomb explosion without an earlier successful plant', () => {
    const winners = Array.from({ length: 16 }, (_, index) => index % 3 ? 'alpha' : 'beta');
    const replay = simulateGoldenMirage(createGoldenReplayPlanFixture({ winners }));

    for (const round of replay.rounds) {
      for (const explosion of round.events.filter((event) => event.type === 'explode')) {
        expect(round.events.some((event) => event.type === 'plant' && event.tick < explosion.tick)).toBe(true);
      }
    }
  });

  it('keeps entry ahead, lurker separate and AWPer on the AWP', () => {
    const round = simulateGoldenMirage(
      createGoldenReplayPlanFixture({ winners: ['alpha', 'alpha', 'alpha'] })
    ).rounds[2];

    expect(round.startState.some((state) => state.inventory.primary === 'awp')).toBe(true);
    expect(round.roleMetrics.entryFirstChokeCrossing).toBe(true);
    expect(round.roleMetrics.lurkerSeparateUntilMs).toBeGreaterThan(8_000);
    expect(round.roleMetrics.awperAwpShare).toBeGreaterThan(0.8);
  });
});

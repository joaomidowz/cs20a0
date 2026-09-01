import { describe, expect, it } from 'vitest';
import { advanceSandboxMajor, createSandboxMajor } from '../src/lib/game/sandbox/major';
import type { SandboxLineupSelection, SandboxMajorState } from '../src/lib/game/sandbox/types';

const selection: SandboxLineupSelection = {
  organizationId: 'astralis-2016',
  style: 'tactical',
  players: [
    { playerId: 'fallen-2016', selectedSlotRole: 'igl' },
    { playerId: 's1mple-2018', selectedSlotRole: 'awper' },
    { playerId: 'donk-2024', selectedSlotRole: 'entry' },
    { playerId: 'ropz-2017', selectedSlotRole: 'lurker' },
    { playerId: 'perfecto-2021', selectedSlotRole: 'support' }
  ]
};

const canonical = (state: SandboxMajorState) => state.matches.map((match) => ({
  id: match.id,
  teamA: match.teamA.id,
  teamB: match.teamB.id,
  winnerId: match.winnerId,
  replayable: match.replayable
}));

describe('Sandbox Major', () => {
  it('creates the same complete Major field and matches from the same seed', () => {
    const first = createSandboxMajor(selection, 'sandbox-major-seed');
    const second = createSandboxMajor(selection, 'sandbox-major-seed');

    expect(canonical(second)).toEqual(canonical(first));
    expect(first.matches.length).toBeGreaterThan(20);
    expect(first.userTeam.id).toBe('sandbox-a');
    expect(first.userTeam.organizationId).toBe(selection.organizationId);
    expect(first.matches.some((match) => match.replayable)).toBe(true);
    expect(first.matches.every((match) => match.veto?.length === 7)).toBe(true);
    expect(first.matches.flatMap((match) => match.maps).every((map) => map.mapId)).toBe(true);
    expect(first.matches.every((match) => {
      const userMatch = match.teamA.id === 'sandbox-a' || match.teamB.id === 'sandbox-a';
      return match.replayable === userMatch;
    })).toBe(true);
  });

  it('uses historical teams as opponents and leaves bot-only matches without a replay marker', () => {
    const state = createSandboxMajor(selection, 'historical-opponents');
    const botMatches = state.matches.filter((match) => !match.replayable);
    const opponentIds = new Set(state.matches
      .flatMap((match) => [match.teamA, match.teamB])
      .filter((team) => team.id !== 'sandbox-a')
      .map((team) => team.id));

    expect(opponentIds.size).toBe(15);
    expect([...opponentIds].every((id) => id !== selection.organizationId)).toBe(true);
    expect(botMatches.length).toBeGreaterThan(0);
    expect(botMatches.every((match) => match.replayable === false)).toBe(true);
  });

  it('resolves bot results and stops at each user match without mutating prior state', () => {
    const first = createSandboxMajor(selection, 'sandbox-advance');
    const snapshot = structuredClone(first);

    expect(first.finished).toBe(false);
    expect(first.matches[first.currentMatchIndex]?.replayable).toBe(true);
    expect(first.matches.slice(0, first.currentMatchIndex).every((match) => match.resolved)).toBe(true);

    const next = advanceSandboxMajor(first);

    expect(first).toEqual(snapshot);
    expect(next.currentMatchIndex).toBeGreaterThan(first.currentMatchIndex);
    expect(next.matches.slice(0, next.currentMatchIndex).every((match) => match.resolved)).toBe(true);
    expect(next.finished || next.matches[next.currentMatchIndex]?.replayable).toBe(true);
  });
});

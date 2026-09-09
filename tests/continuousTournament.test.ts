import { describe, expect, it } from 'vitest';
import { createPlayoffDependencies, getReadyPlayoffNodes, pairContinuousSwiss, type ContinuousSwissStanding } from '../src/lib/game/online/tournament';

const standing = (id: string, wins: number, losses: number, opponents: string[] = []): ContinuousSwissStanding => ({
  organizationId: id, name: id, seed: Number(id.replace(/\D/g, '')) || 1, wins, losses, buchholz: wins * 2, status: 'active', opponents
});

describe('continuous tournament scheduling', () => {
  it('pairs ready teams at the same record and waits instead of crossing early', () => {
    const standings = [standing('t1', 2, 0), standing('t2', 2, 0), standing('t3', 1, 1), standing('t4', 0, 2)];
    const result = pairContinuousSwiss(standings, standings.map((item) => item.organizationId));
    expect(result.pairings.map((pair) => pair.map((item) => item.organizationId))).toEqual([['t1', 't2']]);
    expect(result.waitingIds).toEqual(['t3', 't4']);
    expect(result.usedFallback).toBe(false);
  });

  it('avoids rematches until the explicit deadlock fallback', () => {
    const standings = [standing('t1', 1, 1, ['t2']), standing('t2', 1, 1, ['t1'])];
    expect(pairContinuousSwiss(standings, ['t1', 't2']).pairings).toEqual([]);
    const fallback = pairContinuousSwiss(standings, ['t1', 't2'], true);
    expect(fallback.pairings).toHaveLength(1);
    expect(fallback.usedFallback).toBe(true);
  });

  it('unlocks each playoff side independently and the final only after both semifinals', () => {
    const nodes = createPlayoffDependencies(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(getReadyPlayoffNodes(nodes, {}).map((node) => node.id)).toEqual(['qf1', 'qf2', 'qf3', 'qf4']);
    expect(getReadyPlayoffNodes(nodes, { qf1: 'a', qf2: 'd' }).map((node) => node.id)).toContain('sf1');
    expect(getReadyPlayoffNodes(nodes, { qf1: 'a', qf2: 'd', sf1: 'a', qf3: 'b', qf4: 'c' }).map((node) => node.id)).toContain('sf2');
    expect(getReadyPlayoffNodes(nodes, { qf1: 'a', qf2: 'd', sf1: 'a', qf3: 'b', qf4: 'c', sf2: 'b' }).map((node) => node.id)).toEqual(['final']);
  });
});

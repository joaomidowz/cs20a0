// tests/playerCareerRegions.test.ts
// Cada região com a sua pirâmide; lan house e tier C só contra times da região; lan house com você + 4.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { sceneEventField, userRegion } from '../src/lib/game/playerCareer/live';
import { matesOf } from '../src/lib/game/playerCareer/squad';

const base = (seed: string, country = 'Brazil') => createPlayerCareer({ nick: 't', country, role: 'rifler', seed });
const at = (orgId: string, seed: string, country = 'Brazil'): PlayerCareerState =>
  startSeason({ ...base(seed, country), orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
const regionOfTeam = (orgId: string) => sceneOrgs.find((org) => org.id === orgId)?.region;

describe('pirâmide por região', () => {
  it('toda região tem Tier 2 e Challenger suficientes para montar chave regional', () => {
    const count = (region: string, level: number) => sceneOrgs.filter((org) => org.region === region && org.level === level).length;
    expect(count('sa', 2)).toBeGreaterThanOrEqual(8);
    expect(count('sa', 3)).toBeGreaterThanOrEqual(16);
    expect(count('na', 3)).toBeGreaterThanOrEqual(10);
    expect(count('oce', 3)).toBeGreaterThanOrEqual(6);
    expect(count('asia', 2)).toBeGreaterThanOrEqual(6);
    expect(sceneOrgs.every((org) => org.region)).toBe(true);
    // Academia não sobe pela redistribuição.
    expect(sceneOrgs.find((org) => org.name === 'RED Canids Academy')?.level).toBe(4);
  });
});

describe('adversários pela região', () => {
  it('lan house: você + 4, nicks gerados (nada de "Mate 1"), e a chave é toda da sua região', () => {
    for (const role of ['rifler', 'awper', 'igl'] as const) {
      const career = startSeason({ ...createPlayerCareer({ nick: 't', country: 'Brazil', role, seed: `lan-${role}` }), orgId: 'lan-house', pendingDraw: null, drawDone: true, seatsTaken: [] });
      const mates = matesOf(career);
      expect(mates).toHaveLength(4);
      expect(mates.every((mate) => !/^Mate \d/.test(mate.player.nickname ?? ''))).toBe(true);
      expect(new Set(mates.map((mate) => mate.player.role)).size).toBe(4);
      for (const team of sceneEventField(career, 0).filter((entry) => !entry.isUser)) expect(regionOfTeam(team.orgId)).toBe('sa');
    }
  });

  it('CCT/GC (tier C) só enfrenta a região, em qualquer região', () => {
    for (const [country, region] of [['Brazil', 'sa'], ['United States', 'na'], ['Australia', 'oce']] as const) {
      const org = sceneOrgs.find((candidate) => candidate.region === region && candidate.level === 4)!;
      const career = at(org.id, `cct-${region}`, country);
      expect(userRegion(career)).toBe(region);
      for (const index of [0, 1, 2]) for (const team of sceneEventField(career, index).filter((entry) => !entry.isUser)) expect(regionOfTeam(team.orgId), team.name).toBe(region);
    }
  });

  it('Challenger (tier B): maioria da região, com alguns de fora', () => {
    const org = sceneOrgs.find((candidate) => candidate.region === 'sa' && candidate.level === 3)!;
    let local = 0;
    let total = 0;
    for (const seed of ['b-1', 'b-2', 'b-3']) {
      const career = at(org.id, seed);
      for (const team of sceneEventField(career, 0).filter((entry) => !entry.isUser)) {
        total += 1;
        if (regionOfTeam(team.orgId) === 'sa') local += 1;
      }
    }
    expect(local / total).toBeGreaterThanOrEqual(0.6);
    expect(local).toBeLessThan(total);
  });
});

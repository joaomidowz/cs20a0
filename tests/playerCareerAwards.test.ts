// tests/playerCareerAwards.test.ts
// Prêmios de cada campeonato pelo kill feed do campo inteiro: campeão, MVP (do campeão, ou do vice que jogou
// muito mais), suas jogadas e o mata-mata; a sala de troféus conta títulos por tier e MVPs.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, recordEventResult, startSeason, trophyCase, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { simulateSceneEvent } from '../src/lib/game/playerCareer/live';
import { celebrateResult } from '../src/lib/game/playerCareer/squad';

function seasonAtOrg(level: number, seed: string, overall = 80): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, overall, seatsTaken: [] });
}

describe('prêmios do campeonato', () => {
  it('todo mata-mata fecha com campeão, MVP do campeão ou do vice e chave de 7 séries', () => {
    for (const level of [0, 3, 4]) {
      const state = seasonAtOrg(level, `aw-${level}`);
      const index = state.calendar!.findIndex((entry) => entry.format === 'bracket8');
      const { result } = simulateSceneEvent(state, index);
      expect(result.champion).toBeTruthy();
      expect(result.bracket).toHaveLength(7);
      const final = result.bracket!.find((line) => line.phase === 'final')!;
      expect([final.a, final.b]).toContain(result.champion);
      expect(result.mvp).toBeDefined();
      expect([final.a, final.b]).toContain(result.mvp!.team);
      expect(result.mvp!.rating).toBeGreaterThan(0.8);
      // A sua série aparece marcada na chave.
      expect(result.bracket!.some((line) => line.you)).toBe(true);
      if (result.placement === 'Campeão') expect(result.champion).toBe(sceneOrgs.find((org) => org.id === state.orgId)!.name);
    }
  }, 30000);

  it('MVP seu marca "you" e rende fãs e moral; ace vira fã também', () => {
    const state = { ...seasonAtOrg(1, 'aw-fame'), fame: 0, morale: 60 };
    const plain = celebrateResult(state, 'Quartas', 1);
    const mvp = celebrateResult(state, 'Quartas', 1, { mvp: true });
    const ace = celebrateResult(state, 'Quartas', 1, { aces: 1 });
    expect(mvp.fame!).toBeGreaterThan(plain.fame!);
    expect(mvp.morale!).toBeGreaterThan(plain.morale!);
    expect(ace.fame!).toBeGreaterThan(plain.fame!);
  });
});

describe('sala de troféus', () => {
  it('conta títulos por tier, MVPs e aces, inclusive da temporada em curso', () => {
    let state = seasonAtOrg(0, 'trophy-1');
    const calendar = state.calendar!;
    const major = calendar.find((entry) => entry.format === 'major')!;
    state = recordEventResult(state, major.index, { name: major.name, placement: 'Campeão', rating: 1.3, seriesWins: 6, seriesLosses: 1, tier: 'Major', mvp: { nick: 'tester', team: 'x', rating: 1.4, you: true }, plays: { aces: 2, quads: 0, clutches: 1 } });
    const other = calendar.find((entry) => entry.tier === 'A')!;
    state = recordEventResult(state, other.index, { name: other.name, placement: 'Campeão', rating: 1.1, seriesWins: 3, seriesLosses: 0, tier: 'A' });
    const trophies = trophyCase(state);
    expect(trophies.byTier.Major).toBe(1);
    expect(trophies.byTier.A).toBe(1);
    expect(trophies.total).toBe(2);
    expect(trophies.mvps).toBe(1);
    expect(trophies.aces).toBe(2);
  });

  it('título antigo sem tier cai no tier pelo nível do time', () => {
    const state = seasonAtOrg(4, 'trophy-2');
    const legacy = { ...state, calendar: null, history: [{ seasonNumber: 1, year: 2026, orgId: state.orgId, orgName: 'x', orgLevel: 4, tournaments: [{ name: 'Etapa 1', placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0 }], seasonRating: 1.2, overallBefore: 60, overallAfter: 62, titles: 1, injury: null, agingNote: null }] };
    expect(trophyCase(legacy).byTier.C).toBe(1);
  });
});

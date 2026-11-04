// tests/playerCareerMaps.test.ts
// Perfil de mapas na Carreira: cada time tem os seus 3 mapas fortes; o seu soma o treino; o campeonato usa isso
// no veto e no bônus de força.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { MAP_TRAIN_CAP, mapProfile } from '../src/lib/game/playerCareer/careerMaps';
import { careerMapPool, startSceneEvent } from '../src/lib/game/playerCareer/live';
import { recordEventResult } from '../src/lib/game/playerCareer/engine';
import { trainMap } from '../src/lib/game/playerCareer/squad';

const at = (seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  return startSeason({ ...base, orgId: sceneOrgs.find((org) => org.level === 1)!.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('perfil de mapas', () => {
  it('fixo por time e ano, com o pool do ano; times diferentes têm mapas diferentes', () => {
    const pool = careerMapPool(2026);
    const vitality = mapProfile('vitality-2026', 2026, pool);
    expect(vitality).toEqual(mapProfile('vitality-2026', 2026, pool));
    expect(vitality.map((map) => map.mapId).sort()).toEqual([...pool].sort());
    expect(vitality[0].score).toBeGreaterThanOrEqual(vitality.at(-1)!.score);
    const tops = new Set(sceneOrgs.slice(0, 20).map((org) => mapProfile(org.id, 2026, pool)[0].mapId));
    expect(tops.size).toBeGreaterThan(3);
  });

  it('treinar um mapa: +8 por semana, uma vez por semana, até +30; o mapa sobe no seu perfil', () => {
    let career = at('maps-1');
    const pool = careerMapPool(career.year);
    const worst = mapProfile(career.orgId, career.year, pool).at(-1)!;
    const first = trainMap(career, worst.mapId);
    expect(first.state.mapTraining?.[worst.mapId]).toBe(8);
    expect(trainMap(first.state, worst.mapId).state).toBe(first.state);
    career = first.state;
    for (let index = 0; index < 6; index += 1) {
      career = recordEventResult(career, index, { name: 'x', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
      career = trainMap(career, worst.mapId).state;
    }
    expect(career.mapTraining?.[worst.mapId]).toBe(MAP_TRAIN_CAP);
    const after = mapProfile(career.orgId, career.year, pool, career.mapTraining);
    expect(after.findIndex((map) => map.mapId === worst.mapId)).toBeLessThan(pool.length - 1);
  });

  it('o campeonato usa os perfis: os 3 mapas escolhidos de cada time são os fortes dele', () => {
    const career = { ...at('maps-2'), mapTraining: {} };
    const { campaign } = startSceneEvent(career, 0);
    const strategies = campaign.engine.options.mapContext!.strategies;
    const pool = careerMapPool(career.year);
    for (const [teamId, strategy] of strategies) {
      const profile = mapProfile(teamId === campaign.userTeamId ? career.orgId : teamId, career.year, pool);
      expect(strategy.selectedMaps).toEqual(profile.slice(0, 3).map((map) => map.mapId));
    }
  });
});

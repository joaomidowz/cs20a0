// tests/playerCareerResultField.test.ts
// O resultado do seu campeonato guarda a chave inteira (plano 03): colocação de todos, o seu time, o mês e os melhores.
import { describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, ensureCircuitFrom, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { simulateSceneEvent } from '../src/lib/game/playerCareer/live';

function career(seed: string, level = 4): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return { ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] };
}

describe('o resultado do seu campeonato guarda a chave inteira', () => {
  it('colocação de todos os times, o seu time, o mês e os melhores do campeonato', () => {
    const state = startSeason(career('circuit-result'));
    const index = state.calendar!.findIndex((entry) => entry.format === 'bracket8');
    const { result } = simulateSceneEvent(state, index);
    expect(result.placements).toHaveLength(8);
    expect(new Set(result.placements!.map((entry) => entry.orgId)).size).toBe(8);
    const place = { 'Campeão': 1, Vice: 2, Semis: 3, Quartas: 5 }[result.placement as 'Campeão' | 'Vice' | 'Semis' | 'Quartas'];
    expect(result.placements!.find((entry) => entry.orgId === state.orgId)?.place).toBe(place);
    expect(result.placements!.filter((entry) => entry.place === 1)).toHaveLength(1);
    expect(result.orgId).toBe(state.orgId);
    expect(result.month).toBe(state.calendar![index].month);
    expect(result.topPlayers!.length).toBeGreaterThan(0);
    expect(result.topPlayers!.length).toBeLessThanOrEqual(8);
    // A linha de todos que jogaram, na régua do MVP: você com o nick da carreira e o seu rating.
    expect(result.lines!.length).toBeGreaterThanOrEqual(40);
    expect(result.lines!.find((line) => line.nick === 'tester')).toMatchObject({ orgId: state.orgId, rating: result.rating });
    expect(result.lines!.every((line) => line.rounds > 0)).toBe(true);
  });

  it('carreira nova começa o circuito na temporada 1; save antigo começa na temporada em que abriu', () => {
    expect(createPlayerCareer({ nick: 'a', country: 'Brazil', role: 'igl', seed: 'circuit-from' }).circuitFrom).toBe(1);
    const { circuitFrom: _drop, ...old } = { ...career('circuit-old'), seasonNumber: 6 };
    expect(ensureCircuitFrom(old as PlayerCareerState).circuitFrom).toBe(6);
    expect(ensureCircuitFrom({ ...career('circuit-keep'), circuitFrom: 2, seasonNumber: 6 }).circuitFrom).toBe(2);
  });
});

// tests/playerCareerCircuitEngine.test.ts
// O campeonato do mundo no motor completo (plano 03): determinístico, igual em pedaços, e só o que já aconteceu.
import { afterEach, describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import {
  circuitReady, clearWorldCache, computeWorldResult, ensureWorldResults, pendingWorldEvents, startWorldRun, stepWorldRun, storeWorldResult,
  worldEventsOf, worldResult, type WorldEvent, type WorldEventResult
} from '../src/lib/game/playerCareer/circuit';

function career(seed: string, level = 4): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === level)!;
  return { ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] };
}

/** O relógio no mês: o próximo campeonato seu (fora do circuito) é no mês seguinte; 12 = calendário todo jogado. */
function atMonth(state: PlayerCareerState, month: number): PlayerCareerState {
  return {
    ...state,
    calendar: month >= 12
      ? [{ index: 0, name: 'Folga do teste', status: 'PLAYED' }]
      : [{ index: 0, name: 'Copa do teste', status: 'UPCOMING', month: month + 1 }]
  };
}

function fakeResult(event: WorldEvent, placements: Array<{ orgId: string; place: number }>): WorldEventResult {
  return {
    key: event.key, season: event.season, name: event.name, tier: event.tier, month: event.month,
    field: placements.map((entry) => ({ orgId: entry.orgId, via: 'invite' as const })), placements,
    champion: placements.find((entry) => entry.place === 1)?.orgId ?? '', runnerUp: placements.find((entry) => entry.place === 2)?.orgId ?? '',
    mvp: null, topPlayers: [], userPlayed: false
  };
}

afterEach(() => clearWorldCache());

describe('o campeonato do mundo no motor completo', () => {
  it('mesma seed, mesmo campeão e mesmas colocações; placements coerentes com a chave', () => {
    const state = atMonth(career('circuit-determinism'), 1);
    const event = worldEventsOf(state, 1)[0];
    const first = computeWorldResult(state, event);
    clearWorldCache();
    const second = computeWorldResult(state, event);
    // Todos que jogaram ficam guardados (o rating da temporada no ranking).
    expect(first.lines!.length).toBeGreaterThanOrEqual(40);
    expect(second).toEqual(first);
    expect(first.placements).toHaveLength(first.field.length);
    expect(first.placements.find((entry) => entry.place === 1)?.orgId).toBe(first.champion);
    expect(first.placements.find((entry) => entry.place === 2)?.orgId).toBe(first.runnerUp);
    expect(first.field.map((slot) => slot.orgId)).toContain(first.champion);
    expect(first.mvp && first.field.some((slot) => slot.orgId === first.mvp!.orgId)).toBe(true);
    expect(first.topPlayers.length).toBeLessThanOrEqual(8);
    expect(first.userPlayed).toBe(false);
  });

  it('em pedaços dá exatamente o mesmo resultado (o relógio só decide onde pausar)', () => {
    const state = atMonth(career('circuit-slices'), 1);
    const event = worldEventsOf(state, 1)[0];
    const whole = computeWorldResult(state, event);
    const run = startWorldRun(state, event);
    let tick = 0;
    let pieces = 0;
    let result: WorldEventResult | null = null;
    while (!result) {
      result = stepWorldRun(run, 40, () => tick++);
      pieces += 1;
    }
    expect(pieces).toBeGreaterThan(1);
    expect(result).toEqual(whole);
  });
});

describe('o que falta jogar', () => {
  it('só o que já aconteceu, em ordem; depois de jogar, pronto e nada a refazer', () => {
    const state = atMonth(career('circuit-pending'), 1);
    const pending = pendingWorldEvents(state);
    expect(pending.map((event) => event.key)).toEqual(worldEventsOf(state, 1).filter((event) => event.month <= 1).map((event) => event.key));
    expect(circuitReady(state)).toBe(false);
    expect(ensureWorldResults(state).map((result) => result.key)).toEqual(pending.map((event) => event.key));
    expect(circuitReady(state)).toBe(true);
    expect(ensureWorldResults(state)).toEqual([]);
    expect(worldResult(state, pending[0])).not.toBeNull();
  });

  it('cache apagado: volta até a temporada que falta (o ranking de cada ano precisa do anterior)', () => {
    const state = { ...atMonth(career('circuit-chain'), 1), seasonNumber: 3 };
    const thirdSoFar = worldEventsOf(state, 3).filter((event) => event.month <= 1).length;
    expect(pendingWorldEvents(state)).toHaveLength(worldEventsOf(state, 1).length + worldEventsOf(state, 2).length + thirdSoFar);
    const champion = sceneOrgs[0].id;
    for (const event of worldEventsOf(state, 1)) storeWorldResult(state.seed, fakeResult(event, [{ orgId: champion, place: 1 }]));
    expect(pendingWorldEvents(state)).toHaveLength(worldEventsOf(state, 2).length + thirdSoFar);
    expect(pendingWorldEvents({ ...state, circuitFrom: 3 })).toHaveLength(thirdSoFar);
  });
});

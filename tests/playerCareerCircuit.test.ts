// tests/playerCareerCircuit.test.ts
// O circuito do mundo (plano 03): relógio, campeonatos da temporada, nada do futuro, a chave pelo ranking do mês
// anterior e o cache versionado no localStorage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sceneOrgById, sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { notQualified } from '../src/lib/game/playerCareer/live';
import {
  WORLD_SIM_VERSION, circuitClock, clearWorldCache, fieldClock, loadWorldCache, persistWorldCache, storeWorldResult, userEntryOf, worldCacheKey,
  worldEventsOf, worldFieldOf, worldResult, worldResultsUntil, type WorldEvent, type WorldEventResult
} from '../src/lib/game/playerCareer/circuit';
import { rankOrderAt } from '../src/lib/game/playerCareer/ranking';

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

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); }
  };
}

afterEach(() => {
  clearWorldCache();
  vi.unstubAllGlobals();
});

describe('relógio, campeonatos e nada do futuro', () => {
  it('os campeonatos da temporada: chave do tamanho do formato, convites e vagas de qualificatória', () => {
    const events = worldEventsOf(career('circuit-events'), 1);
    expect(events.map((event) => event.key)).toEqual(events.map((_, index) => `1:${index}`));
    for (const event of events) expect(event.invites + event.qualifierSlots).toBe({ bracket8: 8, swiss16: 16, major: 32 }[event.format]);
    expect(events.find((event) => event.tier === 'Major')).toMatchObject({ invites: 24, qualifierSlots: 8 });
  });

  it('o relógio é o mês antes do seu próximo campeonato', () => {
    const fresh = career('circuit-clock');
    expect(circuitClock(fresh)).toEqual({ season: 1, month: 0 });
    expect(circuitClock(atMonth(fresh, 5))).toEqual({ season: 1, month: 5 });
    expect(circuitClock(atMonth(fresh, 12))).toEqual({ season: 1, month: 12 });
    expect(circuitClock({ ...fresh, seasonNumber: 3, history: [{ seasonNumber: 2 } as PlayerCareerState['history'][number]] })).toEqual({ season: 2, month: 12 });
  });

  it('nenhum resultado do futuro: só aparece o que é até o relógio', () => {
    const state = atMonth(career('circuit-spoiler'), 3);
    const events = worldEventsOf(state, 1);
    const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!.id;
    for (const event of events) storeWorldResult(state.seed, fakeResult(event, [{ orgId: vitality, place: 1 }]));
    const visible = worldResultsUntil(state, 1, 12);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((result) => result.month <= 3)).toBe(true);
    expect(visible).toHaveLength(events.filter((event) => event.month <= 3).length);
    expect(worldResultsUntil(state, 2, 12)).toEqual([]);
  });

  it('o seu campeonato do mundo vem do save, nunca do cache; Major sem vaga não é seu', () => {
    const state = startSeason(career('circuit-own', 0));
    const index = state.calendar!.findIndex((entry) => entry.format !== 'major');
    const entry = state.calendar![index];
    const event = worldEventsOf(state, 1).find((candidate) => `${candidate.name} 2026` === entry.name)!;
    expect(userEntryOf(state, event)?.entry?.index).toBe(index);
    const other = sceneOrgs.find((org) => org.name === 'Spirit')!.id;
    storeWorldResult(state.seed, fakeResult(event, [{ orgId: other, place: 1 }]));
    const played = recordEventResult(state, index, {
      name: entry.name, placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0, tier: entry.tier, orgId: state.orgId, month: entry.month,
      placements: [{ orgId: state.orgId, place: 1 }, { orgId: other, place: 2 }]
    });
    const mine = worldResultsUntil(played, 1, 12).find((result) => result.key === event.key)!;
    expect(mine.userPlayed).toBe(true);
    expect(mine.champion).toBe(state.orgId);
    const major = state.calendar!.findIndex((candidate) => candidate.format === 'major');
    const out = recordEventResult(state, major, notQualified(state, major).result);
    const majorEvent = worldEventsOf(state, 1).find((candidate) => `${candidate.name} 2026` === state.calendar![major].name)!;
    expect(userEntryOf(out, majorEvent)).toBeNull();
  });
});

describe('a chave do campeonato do mundo', () => {
  it('Major: 32 times diferentes, 24 convidados pelo ranking e 8 da qualificatória, sem o seu time quando você não joga', () => {
    const state = atMonth(career('circuit-major-field'), 0);
    const major = worldEventsOf(state, 1).find((event) => event.format === 'major')!;
    const field = worldFieldOf(state, major);
    expect(field).toHaveLength(32);
    expect(new Set(field.map((slot) => slot.orgId)).size).toBe(32);
    expect(field.filter((slot) => slot.via === 'invite')).toHaveLength(24);
    expect(field.filter((slot) => slot.via === 'qualifier')).toHaveLength(8);
    const top = rankOrderAt(state, fieldClock(state, major)).filter((orgId) => orgId !== state.orgId).slice(0, 24);
    expect(field.filter((slot) => slot.via === 'invite').map((slot) => slot.orgId)).toEqual(top);
    expect(field.some((slot) => slot.orgId === state.orgId)).toBe(false);
  });

  it('todo campeonato do ano: tamanho do formato e ninguém repetido', () => {
    const state = atMonth(career('circuit-fields'), 0);
    for (const event of worldEventsOf(state, 1)) {
      const field = worldFieldOf(state, event);
      expect(field).toHaveLength(event.invites + event.qualifierSlots);
      expect(new Set(field.map((slot) => slot.orgId)).size).toBe(field.length);
    }
  });

  it('o seu campeonato do mundo tem o seu time: convidado pelo ranking ou pela vaga do calendário', () => {
    const state = startSeason(career('circuit-user-field', 0));
    const own = state.calendar!.filter((entry) => entry.format !== 'major');
    expect(own.length).toBeGreaterThan(0);
    for (const entry of own) {
      const event = worldEventsOf(state, 1).find((candidate) => `${candidate.name} 2026` === entry.name)!;
      const slot = worldFieldOf(state, event).find((candidate) => candidate.orgId === state.orgId);
      expect(slot && ['invite', 'user'].includes(slot.via)).toBe(true);
    }
  });
});

describe('cache no localStorage', () => {
  it('grava só a temporada atual e a anterior, na chave da versão, e apaga o de outras carreiras e versões', () => {
    const storage = memoryStorage({ 'cs13a0-player-career-world:v0:circuit-cache': '{}', 'cs13a0-player-career-world:v1:outra-carreira': '{}', 'cs13a0-player-career-v1': '{"seed":"x"}' });
    vi.stubGlobal('localStorage', storage);
    const state = career('circuit-cache');
    const champion = sceneOrgs[0].id;
    for (const season of [1, 2, 3]) storeWorldResult(state.seed, fakeResult(worldEventsOf(state, season)[0], [{ orgId: champion, place: 1 }]));
    persistWorldCache(state.seed, 3);
    const saved = JSON.parse(storage.getItem(worldCacheKey(state.seed))!) as { version: number; seed: string; results: WorldEventResult[] };
    expect(worldCacheKey(state.seed)).toBe(`cs13a0-player-career-world:v${WORLD_SIM_VERSION}:circuit-cache`);
    expect(saved.version).toBe(WORLD_SIM_VERSION);
    expect(saved.results.map((result) => result.season).sort()).toEqual([2, 3]);
    expect(storage.getItem('cs13a0-player-career-world:v0:circuit-cache')).toBeNull();
    expect(storage.getItem('cs13a0-player-career-world:v1:outra-carreira')).toBeNull();
    expect(storage.getItem('cs13a0-player-career-v1')).toBe('{"seed":"x"}');
    clearWorldCache();
    expect(worldResult({ ...state, seasonNumber: 3 }, worldEventsOf(state, 3)[0])?.champion).toBe(champion);
  });

  it('cache de outra versão ou estragado é ignorado (o circuito joga de novo)', () => {
    const state = career('circuit-stale');
    const event = worldEventsOf(state, 1)[0];
    const stale = { version: WORLD_SIM_VERSION + 1, seed: state.seed, results: [fakeResult(event, [{ orgId: sceneOrgs[0].id, place: 1 }])] };
    vi.stubGlobal('localStorage', memoryStorage({ [worldCacheKey(state.seed)]: JSON.stringify(stale) }));
    expect(worldResult(state, event)).toBeNull();
    clearWorldCache();
    vi.stubGlobal('localStorage', memoryStorage({ [worldCacheKey(state.seed)]: '{não é json' }));
    loadWorldCache(state.seed);
    expect(worldResult(state, event)).toBeNull();
    expect(sceneOrgById.get(sceneOrgs[0].id)).toBeTruthy();
  });
});

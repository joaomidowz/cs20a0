// tests/playerCareerCircuitJob.test.ts
// O circuito fora da tela (plano 03): o trabalho do Worker devolve um resultado por campeonato, na ordem, e o runner
// sem Worker roda em pedaços e grava no cache.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { circuitReady, clearWorldCache, computeWorldResult, pendingWorldEvents, worldCacheKey, worldEventsOf, worldResult } from '../src/lib/game/playerCareer/circuit';
import { runCircuitJob, type CircuitMessage } from '../src/lib/game/playerCareer/circuitJob';
import { circuitProgress, scheduleCircuit, stopCircuit } from '../src/lib/game/playerCareer/circuitRunner';

function atJanuary(seed: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === 4)!;
  return { ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [], calendar: [{ index: 0, name: 'Copa do teste', status: 'UPCOMING', month: 2 }] };
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
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
  stopCircuit();
  clearWorldCache();
  vi.unstubAllGlobals();
});

describe('o trabalho do Worker', () => {
  it('devolve um resultado por campeonato, na ordem, igual ao motor na tela; o que já tem resultado não é refeito', () => {
    const state = atJanuary('job-order');
    const keys = pendingWorldEvents(state).map((event) => event.key);
    expect(keys.length).toBeGreaterThan(0);
    const messages: CircuitMessage[] = [];
    runCircuitJob({ id: 7, state, known: [], keys }, (message) => messages.push(message));
    expect(messages.map((message) => message.type)).toEqual([...keys.map(() => 'result'), 'done']);
    const first = messages[0] as Extract<CircuitMessage, { type: 'result' }>;
    clearWorldCache();
    expect(first.result).toEqual(computeWorldResult(state, worldEventsOf(state, 1)[0]));
    clearWorldCache();
    const again: CircuitMessage[] = [];
    runCircuitJob({ id: 8, state, known: [first.result], keys: [first.result.key] }, (message) => again.push(message));
    expect(again).toEqual([{ type: 'done', id: 8 }]);
  });

  it('erro vira mensagem, não derruba o Worker', () => {
    const messages: CircuitMessage[] = [];
    runCircuitJob({ id: 3, state: undefined as unknown as PlayerCareerState, known: [], keys: ['1:0'] }, (message) => messages.push(message));
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('error');
  });
});

describe('o runner sem Worker', () => {
  it('roda em pedaços nos intervalos, deixa o circuito pronto e grava no localStorage', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const state = atJanuary('runner-idle');
    expect(circuitReady(state)).toBe(false);
    scheduleCircuit(state);
    await vi.waitFor(() => expect(circuitReady(state)).toBe(true), { timeout: 20000, interval: 25 });
    expect(get(circuitProgress).pending).toBe(0);
    expect(worldResult(state, worldEventsOf(state, 1)[0])).not.toBeNull();
    expect(storage.getItem(worldCacheKey(state.seed))).toContain(worldEventsOf(state, 1)[0].key);
  });
});

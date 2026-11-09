// src/lib/game/playerCareer/circuitRunner.ts
// Quem roda o circuito do mundo na página: manda o que falta para o Web Worker (circuit.worker.ts), guarda cada
// resultado no cache (memória + localStorage) e avisa a tela pelo circuitProgress. Sem Worker (navegador sem suporte ou
// erro no Worker), roda na própria página em pedaços de até 8 ms nos intervalos ociosos, sem travar a tela.
import { writable } from 'svelte/store';
import type { PlayerCareerState } from './engine';
import { cachedWorldResults, circuitClock, pendingWorldEvents, persistWorldCache, startWorldRun, stepWorldRun, storeWorldResult, type WorldEvent, type WorldEventResult, type WorldRun } from './circuit';
import type { CircuitJob, CircuitMessage } from './circuitJob';

export interface CircuitProgress { pending: number; tick: number }
/** Muda a cada resultado novo: a página relê ranking, chaves e a trava do "jogar". */
export const circuitProgress = writable<CircuitProgress>({ pending: 0, tick: 0 });

/** Fatia máxima de trabalho na página quando não há Worker. */
const IDLE_SLICE_MS = 8;

let worker: Worker | null = null;
let noWorker = false;
let jobId = 0;
let busy: string | null = null;
let latest: PlayerCareerState | null = null;

function report() {
  const pending = latest ? pendingWorldEvents(latest).length : 0;
  circuitProgress.update((progress) => ({ pending, tick: progress.tick + 1 }));
}

function accept(seed: string, result: WorldEventResult) {
  storeWorldResult(seed, result);
  if (latest?.seed === seed) persistWorldCache(seed, circuitClock(latest).season);
  report();
}

function finished() {
  busy = null;
  if (latest) scheduleCircuit(latest);
}

function ensureWorker(): Worker | null {
  if (worker || noWorker) return worker;
  try {
    worker = new Worker(new URL('./circuit.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<CircuitMessage>) => {
      const message = event.data;
      if (message.id !== jobId || !latest) return;
      if (message.type === 'result') return accept(latest.seed, message.result);
      if (message.type === 'error') {
        console.error('[carreira] circuito do mundo no Worker:', message.message);
        fallBackToIdle();
      }
      finished();
    };
    worker.onerror = () => { fallBackToIdle(); finished(); };
  } catch {
    noWorker = true;
    worker = null;
  }
  return worker;
}

function fallBackToIdle() {
  worker?.terminate();
  worker = null;
  noWorker = true;
}

type IdleTask = (remaining: () => number) => void;
/** Cada fatia para em 8 ms, mesmo quando o navegador oferece um intervalo ocioso maior (até 50 ms). */
const idle = (task: IdleTask) => {
  const slice = (available: () => number) => {
    const start = performance.now();
    task(() => Math.min(available(), IDLE_SLICE_MS - (performance.now() - start)));
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback((deadline) => slice(() => deadline.timeRemaining()), { timeout: 250 });
  else setTimeout(() => slice(() => IDLE_SLICE_MS), 16);
};

/** Sem Worker: um campeonato por vez, em fatias de até 8 ms (o ranking de cada um precisa dos anteriores). */
function runIdle(state: PlayerCareerState, events: WorldEvent[]) {
  const id = ++jobId;
  let index = 0;
  let run: WorldRun | null = null;
  const step: IdleTask = (remaining) => {
    if (id !== jobId) return;
    while (index < events.length) {
      if (remaining() <= 1) return idle(step);
      run ??= startWorldRun(state, events[index]);
      const result = stepWorldRun(run, Math.min(IDLE_SLICE_MS, Math.max(1, remaining())));
      if (!result) return idle(step);
      accept(state.seed, result);
      run = null;
      index += 1;
    }
    finished();
  };
  idle(step);
}

/** Agenda o que falta do circuito para a carreira (a página chama a cada mudança; repetir é de graça). Um trabalho por
 *  vez: quando ele acaba, agenda de novo com a carreira mais nova. */
export function scheduleCircuit(state: PlayerCareerState): void {
  if (latest && latest.seed !== state.seed) stopCircuit();
  latest = state;
  const pending = pendingWorldEvents(state);
  circuitProgress.update((progress) => (progress.pending === pending.length ? progress : { ...progress, pending: pending.length }));
  if (!pending.length || busy) return;
  busy = `${state.seed}|${pending.map((event) => event.key).join(',')}`;
  const target = ensureWorker();
  if (!target) return runIdle(state, pending);
  jobId += 1;
  const job: CircuitJob = { id: jobId, state, known: cachedWorldResults(state.seed), keys: pending.map((event) => event.key) };
  target.postMessage(job);
}

/** Para tudo (troca de carreira, saída da página). */
export function stopCircuit(): void {
  jobId += 1;
  busy = null;
  worker?.terminate();
  worker = null;
}

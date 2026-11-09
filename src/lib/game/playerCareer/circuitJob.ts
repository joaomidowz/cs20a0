// src/lib/game/playerCareer/circuitJob.ts
// O trabalho do circuito fora da tela: recebe a carreira e os resultados que a página já tem, joga os campeonatos que
// faltam (do mais antigo para o mais novo, porque a chave de cada um sai do ranking com os anteriores) e devolve um
// por um. Sem DOM e sem localStorage: roda no Web Worker (circuit.worker.ts) e nos testes.
import type { PlayerCareerState } from './engine';
import { computeWorldResult, storeWorldResult, worldEventByKey, worldResult, type WorldEventResult } from './circuit';

export interface CircuitJob { id: number; state: PlayerCareerState; known: WorldEventResult[]; keys: string[] }
export type CircuitMessage =
  | { type: 'result'; id: number; result: WorldEventResult }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };

export function runCircuitJob(job: CircuitJob, emit: (message: CircuitMessage) => void): void {
  try {
    for (const result of job.known) storeWorldResult(job.state.seed, result);
    for (const key of job.keys) {
      const event = worldEventByKey(job.state, key);
      if (!event || worldResult(job.state, event)) continue;
      const result = computeWorldResult(job.state, event);
      storeWorldResult(job.state.seed, result);
      emit({ type: 'result', id: job.id, result });
    }
    emit({ type: 'done', id: job.id });
  } catch (error) {
    emit({ type: 'error', id: job.id, message: error instanceof Error ? error.message : String(error) });
  }
}

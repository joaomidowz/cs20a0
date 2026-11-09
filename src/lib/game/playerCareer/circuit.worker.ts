// src/lib/game/playerCareer/circuit.worker.ts
// O Web Worker do circuito do mundo: repassa o trabalho para runCircuitJob (circuitJob.ts) e devolve as mensagens.
import { runCircuitJob, type CircuitJob, type CircuitMessage } from './circuitJob';

const scope = self as unknown as { onmessage: ((event: MessageEvent<CircuitJob>) => void) | null; postMessage: (message: CircuitMessage) => void };
scope.onmessage = (event) => runCircuitJob(event.data, (message) => scope.postMessage(message));

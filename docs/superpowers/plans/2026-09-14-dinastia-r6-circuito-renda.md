# Dinastia R6: campeonatos menores e renda — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entre o resultado de cada Major e a janela de transferências, a Dinastia oferece campeonatos menores (Elite por convite, Aberto por inscrição) de 8 times em eliminatória MD3. Eles são simulados na hora e pagam prêmio em dólar inteiro, que já entra no caixa antes da janela.

**Architecture:**
- O motor ganha uma opção `playoffBestOf`. Sem ela, nada muda.
- `src/lib/game/dynasty/circuit.ts` é puro e cuida de convites por status, sorteio de adversários por pool de tier, prêmios, crédito idempotente e disponibilidade do 2º Aberto.
- A simulação de um evento reusa `createMajorField` (com `userTeam` e `seedsWithoutStyle`) e `runOnlineTournament` com `entryStage: 'playoffs'`.
- A página ganha a fase `'circuit'` com `DynastyCircuit.svelte`, e a janela abre depois dela.

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest.

**Referências:** plano aprovado `/home/itcenterai/.claude/plans/certo-quero-que-mande-harmonic-catmull.md` (Fase 6 e "Números de desenho > Circuito"). Formatos reais simplificados: [BLAST Open Fall 2026](https://liquipedia.net/counterstrike/BLAST/Open/2026/Fall) e [IEM Beijing 2026](https://blast.tv/cs/tournaments/iem-china-2026) para o tier Elite; [CCT Challengers](https://liquipedia.net/counterstrike/CCT/2026/Europe/Challengers_2) para o tier Aberto.

## Global Constraints

- **Branch e commits:** trabalhar em `feat/dinastia`. Commits `feat: ...` em pt-BR, terminados com:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
  `git add` só com caminhos explícitos; nunca incluir `.superpowers/` nem `docs/superpowers/plans/2026-09-14-offline-accounts-and-campaigns.md`.
- **Gate de cada tarefa:** `npm run validate`, com `git status --short tests/__snapshots__` vazio. Nunca rodar vitest com `-u`.
- **Outros modos:** Normal, Ranked, PRO, Sandbox e online não mudam. `tests/normalRunGolden.test.ts` passa intacto e o protocolo online 9 não muda. `playoffBestOf` é opcional e só a Dinastia passa.
- **Dinheiro:** dólar inteiro, sem ponto flutuante gravado.
- **Determinismo:** mesma seed, mesmo `majorNumber` e mesma escalação produzem os mesmos convites, adversários e resultados.
- **Save:**
  - `DynastyState.circuit` é opcional e normalizado em `ensureDynastyState`.
  - A fase `'circuit'` sem estado de circuito volta para `'result'`.
  - Crédito uma vez só por evento.
- **Stats do circuito:** não alimentam evolução, histórico de rating nem cartas.
- **Nomes de evento:** genéricos, sem marcas reais ("Elite Series", "Open Cup").
- **Interface:** textos em pt-BR, en e es, locais no componente, como os demais `Dynasty*`. 375 px sem scroll horizontal. `prefers-reduced-motion` respeitado. CSS escopado, sem regra global nova.
- **Dicas (Fase 5):** o contexto `circuit` é gancho opcional. Se `src/lib/game/dynasty/tips.ts` já existir quando a Tarefa 5 for executada, mostrar a dica com `nextTip('circuit', seen)`. Se não existir, não criar dependência.

## Números

**Convites**, conforme a colocação do Major que acabou de ser liquidado (`history.at(-1).placement`):

| Colocação | Eventos |
|---|---|
| `placementChampion`, `placementRunnerUp`, `placement3to4`, `placement5to8` (Legend) | Elite 1 e Elite 2, ambos por convite |
| `placementStage3` | Elite 1 (convite) e Aberto 1 (inscrição) |
| `placementStage1`, `placementStage2` | Aberto 1 (inscrição) e Aberto 2 (inscrição, liberado só se o Aberto 1 terminar em campeão ou vice) |

**Adversários:** 7 por evento, sem repetir dentro do evento.
- Elite: pools dos Stages 2 e 3.
- Aberto: pools dos Stages 1 e 2.
- Se faltar time, completa com o pool vizinho: Stage 1 para o Elite, Stage 3 para o Aberto.

**Prêmios (US$):**

| Tier | Campeão | Vice | Semi | Quartas |
|---|---|---|---|---|
| Elite | 60.000 | 25.000 | 12.000 | 5.000 |
| Aberto | 20.000 | 8.000 | 4.000 | 1.500 |

**Formato:** quartas, semi e final em MD3 (`playoffBestOf: { quarterfinal: 3, semifinal: 3, final: 3 }`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/game/online/tournament-engine.ts` | Opção `playoffBestOf` nos playoffs. |
| `src/lib/game/types.ts` | `CircuitTier`, `CircuitAccess`, `CircuitPlacement`, `CircuitEvent`, `CircuitResult`, `CircuitState`; `DynastyState.circuit?`; `DynastyMajorSummary.circuit?`; fase `'circuit'`. |
| `src/lib/game/dynasty/circuit.ts` | Regras puras: convites, adversários, prêmios, disponibilidade, crédito, pular e encerrar. |
| `src/lib/game/dynasty/circuitPlay.ts` | Simulação de um evento (motor, campo, colocação do usuário). |
| `src/lib/game/dynasty/state.ts` | `createDynastyState` com `circuit: null`; normalização de `circuit`. |
| `src/lib/game/store.ts` | Fase `'circuit'` sem estado volta para `'result'`. |
| `src/lib/components/DynastyCircuit.svelte` | Tela da fase: cards dos eventos, jogar ou pular, chaveamento, prêmio e seguir para a janela. |
| `src/routes/+page.svelte` | Fluxo resultado → circuito → janela. |
| `tests/tournamentEngine.test.ts` | Caso novo de `playoffBestOf`. |
| `tests/dynastyCircuit.test.ts` | Novo: regras puras e simulação. |
| `tests/dynastyState.test.ts` | Caso novo de normalização de `circuit`. |

**Testes existentes que mudam:** nenhum tem expectativa alterada. `tests/tournamentEngine.test.ts` e `tests/dynastyState.test.ts` só ganham casos novos. O caso existente "runs direct playoffs from eight organizations" continua esperando final MD5, o que prova o padrão sem a opção.

---

### Task 1: `playoffBestOf` no motor

**Files:**
- Modify: `src/lib/game/online/tournament-engine.ts` (interface `TournamentEngineOptions`; `startNextRound`, bloco `definitions`)
- Test: `tests/tournamentEngine.test.ts`

**Interfaces:**
- Produces: `TournamentEngineOptions.playoffBestOf?: { quarterfinal: 1 | 3; semifinal: 1 | 3; final: 3 | 5 }`.

- [ ] **Step 1: Teste que falha**

Acrescentar dentro do `describe` que contém "runs direct playoffs from eight organizations", logo depois desse caso:

```ts
  it('accepts a custom playoff format and keeps BO3/BO3/BO5 without it', () => {
    const run = (playoffBestOf?: { quarterfinal: 1 | 3; semifinal: 1 | 3; final: 3 | 5 }) => {
      const engine = createTournamentEngine({ organizations: [organization(0)], botPool: Array.from({ length: 7 }, (_, index) => organization(index + 40, false)), entryStage: 'playoffs', seed: 'custom-playoffs', controllerFor: () => 'bot', interactiveVeto: () => false, ...(playoffBestOf ? { playoffBestOf } : {}) });
      while (!engine.finished) {
        const round = startNextRound(engine);
        for (const series of round.series) runSeriesToEnd(series);
        completeRound(engine);
      }
      return engine.rounds.map((round) => round.series[0].config.bestOf);
    };
    expect(run({ quarterfinal: 3, semifinal: 3, final: 3 })).toEqual([3, 3, 3]);
    expect(run()).toEqual([3, 3, 5]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tournamentEngine.test.ts`
Expected: FAIL. O `svelte-check` e o vitest aceitam o objeto extra, então a falha é `expected [3, 3, 5] to deeply equal [3, 3, 3]`.

- [ ] **Step 3: Implementar**

Em `TournamentEngineOptions`, logo depois de `swissBestOfFor`:

```ts
  /** Playoff series formats. Defaults to BO3 quarterfinals, BO3 semifinals and a BO5 final (every mode but the Dinastia circuit). */
  playoffBestOf?: { quarterfinal: 1 | 3; semifinal: 1 | 3; final: 3 | 5 };
```

Em `startNextRound`, trocar o bloco `definitions` por:

```ts
    const formats = state.options.playoffBestOf ?? { quarterfinal: 3, semifinal: 3, final: 5 };
    const definitions: Array<{ phase: 'quarterfinal' | 'semifinal' | 'final'; bestOf: 1 | 3 | 5 }> = [
      { phase: 'quarterfinal', bestOf: formats.quarterfinal },
      { phase: 'semifinal', bestOf: formats.semifinal },
      { phase: 'final', bestOf: formats.final }
    ];
```

Se `createSeries` tipar `bestOf` como `1 | 3 | 5`, nada mais muda. Se o `svelte-check` reclamar do tipo `3 | 5` em outro ponto, ampliar para `1 | 3 | 5` nesse ponto e registrar no relato.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/tournamentEngine.test.ts tests/normalRunGolden.test.ts && git status --short tests/__snapshots__`
Expected: todos passam; nenhuma linha de snapshot.

- [ ] **Step 5: Gate e commit**

Run: `npm run validate`
Expected: `0 ERRORS 0 WARNINGS`, suíte completa verde, builds ok.

```bash
git add src/lib/game/online/tournament-engine.ts tests/tournamentEngine.test.ts
git commit -m "feat: formato configurável dos playoffs no motor de torneio

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Tipos, regras puras do circuito e save

**Files:**
- Modify: `src/lib/game/types.ts`, `src/lib/game/dynasty/state.ts`
- Create: `src/lib/game/dynasty/circuit.ts`, `tests/dynastyCircuit.test.ts`
- Test: `tests/dynastyState.test.ts` (caso novo)

**Interfaces:**
- Consumes: `stageOfTier` (`src/lib/game/dynasty/field.ts`), `createSeededRng` (`src/lib/game/simulation.ts`), `HistoricalTeam`, `DynastyState`, `DynastyMajorSummary`.
- Produces (`circuit.ts`):
  - `CIRCUIT_PRIZES: Record<CircuitTier, Record<CircuitPlacement, number>>`
  - `CIRCUIT_TEAMS = 7`
  - `circuitPlacementFrom(placementKey: string): CircuitPlacement`
  - `createCircuit(input: { dynasty: DynastyState; teams: HistoricalTeam[]; seed: string }): CircuitState`
  - `isEventAvailable(circuit: CircuitState, event: CircuitEvent): boolean`
  - `isEventDone(circuit: CircuitState, eventId: string): boolean`
  - `settleCircuitEvent(dynasty: DynastyState, result: CircuitResult, rounds: MajorRound[]): DynastyState`
  - `skipCircuitEvent(dynasty: DynastyState, eventId: string): DynastyState`
  - `finishCircuit(dynasty: DynastyState): DynastyState`
- Produces (`state.ts`): `createDynastyState().circuit === null`, e `ensureDynastyState` preserva um `circuit` válido e descarta lixo.

- [ ] **Step 1: Tipos em `src/lib/game/types.ts`**

Em `GamePhase`, depois de `| 'coach-draft'`, acrescentar `| 'circuit'`.

Antes de `export interface DynastyState`, acrescentar:

```ts
export type CircuitTier = 'elite' | 'open';
export type CircuitAccess = 'invite' | 'signup';
export type CircuitPlacement = 'champion' | 'runnerUp' | 'semi' | 'quarter';

/** A smaller event between two Dinastia Majors: eight teams, single elimination. */
export interface CircuitEvent {
  id: string;
  tier: CircuitTier;
  access: CircuitAccess;
  /** 1-based number shown in the event name ("Elite Series #1"). */
  index: number;
  /** Opponents, as historical team ids. The user's organization is the eighth team. */
  teamIds: string[];
  /** Event that must end in champion or runner-up before this one opens (second Open Cup for Challengers). */
  unlockedBy?: string;
}

export interface CircuitResult {
  eventId: string;
  tier: CircuitTier;
  placement: CircuitPlacement;
  /** Whole dollars. */
  prize: number;
}

export interface CircuitState {
  majorNumber: number;
  events: CircuitEvent[];
  results: CircuitResult[];
  skipped: string[];
  /** Bracket of every played event, without kill feeds. */
  brackets: Record<string, MajorRound[]>;
  finished: boolean;
}
```

Em `DynastyState`, depois de `window: WindowState | null;`:

```ts
  /** Smaller events between the current Major's result and its transfer window. */
  circuit?: CircuitState | null;
```

Em `DynastyMajorSummary`, depois de `training?: TrainingFocus | null;`:

```ts
  /** Circuit events played after this Major. */
  circuit?: CircuitResult[];
```

- [ ] **Step 2: Teste que falha**

```ts
// tests/dynastyCircuit.test.ts
import { describe, expect, it } from 'vitest';
import { teams } from '../src/lib/game/data';
import { CIRCUIT_PRIZES, CIRCUIT_TEAMS, circuitPlacementFrom, createCircuit, finishCircuit, isEventAvailable, isEventDone, settleCircuitEvent, skipCircuitEvent } from '../src/lib/game/dynasty/circuit';
import { stageOfTier } from '../src/lib/game/dynasty/field';
import { createDynastyState } from '../src/lib/game/dynasty/state';
import type { DynastyMajorSummary, DynastyState } from '../src/lib/game/types';

const tierOf = new Map(teams.map((team) => [team.id, team.tier ?? null]));
const summary = (placement: string, majorNumber = 1): DynastyMajorSummary => ({
  majorNumber, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup: [], coachId: null, movesMade: 0, stats: []
});
const settled = (placement: string): DynastyState => ({ ...createDynastyState(), prizeCreditedFor: 1, history: [summary(placement)] });

describe('convites do circuito', () => {
  it('Legend recebe dois Elite por convite', () => {
    const circuit = createCircuit({ dynasty: settled('placement5to8'), teams, seed: 'c1' });
    expect(circuit.events.map((event) => [event.tier, event.access, event.index])).toEqual([['elite', 'invite', 1], ['elite', 'invite', 2]]);
    expect(circuit).toMatchObject({ majorNumber: 1, results: [], skipped: [], brackets: {}, finished: false });
  });

  it('eliminado no Stage 3 recebe um Elite e um Aberto', () => {
    const circuit = createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'c2' });
    expect(circuit.events.map((event) => [event.tier, event.access])).toEqual([['elite', 'invite'], ['open', 'signup']]);
  });

  it('Challenger recebe um Aberto e o segundo só abre com final no primeiro', () => {
    const circuit = createCircuit({ dynasty: settled('placementStage1'), teams, seed: 'c3' });
    const [first, second] = circuit.events;
    expect([first.tier, second.tier]).toEqual(['open', 'open']);
    expect(second.unlockedBy).toBe(first.id);
    expect(isEventAvailable(circuit, first)).toBe(true);
    expect(isEventAvailable(circuit, second)).toBe(false);
    const semi = { ...circuit, results: [{ eventId: first.id, tier: 'open' as const, placement: 'semi' as const, prize: 4_000 }] };
    expect(isEventAvailable(semi, second)).toBe(false);
    const final = { ...circuit, results: [{ eventId: first.id, tier: 'open' as const, placement: 'runnerUp' as const, prize: 8_000 }] };
    expect(isEventAvailable(final, second)).toBe(true);
  });

  it('sorteia 7 adversários sem repetir, nos pools do tier e de forma determinística', () => {
    for (let index = 0; index < 20; index += 1) {
      const circuit = createCircuit({ dynasty: settled(index % 2 ? 'placementChampion' : 'placementStage2'), teams, seed: `pool-${index}` });
      for (const event of circuit.events) {
        expect(event.teamIds).toHaveLength(CIRCUIT_TEAMS);
        expect(new Set(event.teamIds).size).toBe(CIRCUIT_TEAMS);
        const allowed = event.tier === 'elite' ? ['stage2', 'stage3'] : ['stage1', 'stage2'];
        expect(event.teamIds.every((id) => allowed.includes(stageOfTier(tierOf.get(id))))).toBe(true);
      }
    }
    const ids = (seed: string) => createCircuit({ dynasty: settled('placementStage3'), teams, seed }).events.map((event) => event.teamIds);
    expect(ids('igual')).toEqual(ids('igual'));
    expect(ids('igual')).not.toEqual(ids('outra'));
  });
});

describe('prêmios e crédito', () => {
  it('prêmios são inteiros e seguem a tabela', () => {
    expect(CIRCUIT_PRIZES).toEqual({
      elite: { champion: 60_000, runnerUp: 25_000, semi: 12_000, quarter: 5_000 },
      open: { champion: 20_000, runnerUp: 8_000, semi: 4_000, quarter: 1_500 }
    });
    for (const tier of Object.values(CIRCUIT_PRIZES)) for (const value of Object.values(tier)) expect(Number.isInteger(value)).toBe(true);
    expect(circuitPlacementFrom('placementChampion')).toBe('champion');
    expect(circuitPlacementFrom('placementRunnerUp')).toBe('runnerUp');
    expect(circuitPlacementFrom('placement3to4')).toBe('semi');
    expect(circuitPlacementFrom('placement5to8')).toBe('quarter');
  });

  it('credita uma vez só por evento, pula e encerra gravando no histórico', () => {
    const dynasty = { ...settled('placement5to8'), cash: 100_000 };
    const circuit = createCircuit({ dynasty, teams, seed: 'credito' });
    const withCircuit: DynastyState = { ...dynasty, circuit };
    const [first, second] = circuit.events;
    const result = { eventId: first.id, tier: first.tier, placement: 'champion' as const, prize: 60_000 };
    const once = settleCircuitEvent(withCircuit, result, []);
    expect(once.cash).toBe(160_000);
    expect(isEventDone(once.circuit!, first.id)).toBe(true);
    expect(settleCircuitEvent(once, result, [])).toBe(once);
    const skipped = skipCircuitEvent(once, second.id);
    expect(skipped.circuit!.skipped).toEqual([second.id]);
    expect(isEventDone(skipped.circuit!, second.id)).toBe(true);
    expect(skipCircuitEvent(skipped, second.id)).toBe(skipped);
    const finished = finishCircuit(skipped);
    expect(finished.circuit!.finished).toBe(true);
    expect(finished.history.at(-1)!.circuit).toEqual([result]);
    expect(finished.cash).toBe(160_000);
  });
});
```

Acrescentar em `tests/dynastyState.test.ts`, dentro do `describe` existente:

```ts
  it('normaliza o circuito salvo e descarta lixo', () => {
    const circuit = { majorNumber: 2, events: [{ id: 'circuit-2-1', tier: 'open', access: 'signup', index: 1, teamIds: ['a'] }], results: [{ eventId: 'circuit-2-1', tier: 'open', placement: 'semi', prize: 4000 }], skipped: [], brackets: {}, finished: false };
    expect(ensureDynastyState({ majorNumber: 2, circuit }).circuit).toEqual(circuit);
    expect(ensureDynastyState({ majorNumber: 2, circuit: { majorNumber: 2, events: 'x' } }).circuit).toBeNull();
    expect(ensureDynastyState({}).circuit).toBeNull();
    expect(createDynastyState().circuit).toBeNull();
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyCircuit.test.ts tests/dynastyState.test.ts`
Expected: FAIL. `dynastyCircuit` falha com `Cannot find module '../src/lib/game/dynasty/circuit'`, e o caso novo de `dynastyState` falha com `expected undefined to be null`.

- [ ] **Step 4: Implementar `circuit.ts`**

```ts
// src/lib/game/dynasty/circuit.ts
import { createSeededRng } from '../simulation';
import type { CircuitEvent, CircuitPlacement, CircuitResult, CircuitState, CircuitTier, DynastyState, HistoricalTeam, MajorRound, MajorStage } from '../types';
import { stageOfTier } from './field';

export const CIRCUIT_TEAMS = 7;

export const CIRCUIT_PRIZES: Readonly<Record<CircuitTier, Readonly<Record<CircuitPlacement, number>>>> = {
  elite: { champion: 60_000, runnerUp: 25_000, semi: 12_000, quarter: 5_000 },
  open: { champion: 20_000, runnerUp: 8_000, semi: 4_000, quarter: 1_500 }
};

/** Opponent pools by tier, strongest first; the last entry is the fallback when the main pools run dry. */
const TIER_POOLS: Readonly<Record<CircuitTier, readonly MajorStage[]>> = {
  elite: ['stage3', 'stage2', 'stage1'],
  open: ['stage2', 'stage1', 'stage3']
};

const LEGEND_PLACEMENTS = new Set(['placementChampion', 'placementRunnerUp', 'placement3to4', 'placement5to8']);

export function circuitPlacementFrom(placementKey: string): CircuitPlacement {
  if (placementKey === 'placementChampion') return 'champion';
  if (placementKey === 'placementRunnerUp') return 'runnerUp';
  if (placementKey === 'placement3to4') return 'semi';
  return 'quarter';
}

function drawOpponents(tier: CircuitTier, teams: HistoricalTeam[], seed: string): string[] {
  const rng = createSeededRng(seed);
  const pools = new Map<MajorStage, HistoricalTeam[]>([['stage1', []], ['stage2', []], ['stage3', []]]);
  for (const team of teams) pools.get(stageOfTier(team.tier))!.push(team);
  const [first, second, fallback] = TIER_POOLS[tier];
  const main = [...pools.get(first)!, ...pools.get(second)!].sort((left, right) => left.id.localeCompare(right.id));
  const backup = [...pools.get(fallback)!].sort((left, right) => left.id.localeCompare(right.id));
  const chosen: string[] = [];
  for (const pool of [main, backup]) {
    while (chosen.length < CIRCUIT_TEAMS && pool.length) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  }
  if (chosen.length < CIRCUIT_TEAMS) throw new Error(`Not enough teams for a ${tier} circuit event`);
  return chosen;
}

/** Invitations for the Major that was just settled: Legends play two Elite events, Stage 3 one of each, Challengers Open Cups. */
export function createCircuit(input: { dynasty: DynastyState; teams: HistoricalTeam[]; seed: string }): CircuitState {
  const { dynasty } = input;
  const placement = dynasty.history.at(-1)?.placement ?? 'placementStage1';
  const plan: Array<{ tier: CircuitTier; access: CircuitEvent['access']; index: number; unlockedByPrevious?: boolean }> = LEGEND_PLACEMENTS.has(placement)
    ? [{ tier: 'elite', access: 'invite', index: 1 }, { tier: 'elite', access: 'invite', index: 2 }]
    : placement === 'placementStage3'
      ? [{ tier: 'elite', access: 'invite', index: 1 }, { tier: 'open', access: 'signup', index: 1 }]
      : [{ tier: 'open', access: 'signup', index: 1 }, { tier: 'open', access: 'signup', index: 2, unlockedByPrevious: true }];
  const events: CircuitEvent[] = [];
  plan.forEach((item, position) => {
    const id = `circuit-${dynasty.majorNumber}-${position + 1}`;
    const teamIds = drawOpponents(item.tier, input.teams, `${input.seed}:circuit:${dynasty.majorNumber}:${position + 1}`);
    events.push({ id, tier: item.tier, access: item.access, index: item.index, teamIds, ...(item.unlockedByPrevious ? { unlockedBy: events[position - 1].id } : {}) });
  });
  return { majorNumber: dynasty.majorNumber, events, results: [], skipped: [], brackets: {}, finished: false };
}

export const isEventDone = (circuit: CircuitState, eventId: string): boolean =>
  circuit.results.some((result) => result.eventId === eventId) || circuit.skipped.includes(eventId);

export function isEventAvailable(circuit: CircuitState, event: CircuitEvent): boolean {
  if (isEventDone(circuit, event.id)) return false;
  if (!event.unlockedBy) return true;
  const gate = circuit.results.find((result) => result.eventId === event.unlockedBy);
  return Boolean(gate && (gate.placement === 'champion' || gate.placement === 'runnerUp'));
}

/** Credits one event once; a second call for the same event returns the same state. */
export function settleCircuitEvent(dynasty: DynastyState, result: CircuitResult, rounds: MajorRound[]): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || isEventDone(circuit, result.eventId)) return dynasty;
  return {
    ...dynasty,
    cash: dynasty.cash + Math.round(result.prize),
    circuit: { ...circuit, results: [...circuit.results, result], brackets: { ...circuit.brackets, [result.eventId]: rounds } }
  };
}

export function skipCircuitEvent(dynasty: DynastyState, eventId: string): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || isEventDone(circuit, eventId)) return dynasty;
  return { ...dynasty, circuit: { ...circuit, skipped: [...circuit.skipped, eventId] } };
}

/** Closes the circuit and records its results on the Major that opened it. */
export function finishCircuit(dynasty: DynastyState): DynastyState {
  const circuit = dynasty.circuit;
  if (!circuit || circuit.finished) return dynasty;
  const history = dynasty.history.map((summary, index) =>
    index === dynasty.history.length - 1 && summary.majorNumber === circuit.majorNumber ? { ...summary, circuit: circuit.results } : summary);
  return { ...dynasty, history, circuit: { ...circuit, finished: true } };
}
```

- [ ] **Step 5: Save em `src/lib/game/dynasty/state.ts`**

Acrescentar `CircuitState` à lista de tipos importados. Em `createDynastyState`, depois de `window: null,`, acrescentar `circuit: null,`.

Logo antes de `export function ensureDynastyState`:

```ts
const isCircuitState = (value: unknown): value is CircuitState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CircuitState>;
  return typeof candidate.majorNumber === 'number' && Array.isArray(candidate.events) && Array.isArray(candidate.results)
    && Array.isArray(candidate.skipped) && typeof candidate.finished === 'boolean'
    && Boolean(candidate.brackets) && typeof candidate.brackets === 'object';
};
```

No objeto devolvido por `ensureDynastyState`, depois da linha de `window`:

```ts
    circuit: isCircuitState(raw.circuit) ? raw.circuit : null,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/dynastyCircuit.test.ts tests/dynastyState.test.ts`
Expected: todos passam.

Se "sorteia 7 adversários" falhar porque o pool Elite tem menos de 7 times num tier, conferir com `node -e "const t=require('./src/lib/data/cs/teams.game.json');console.log(t.filter(x=>['playoff-team','contender','finalist','champion','S','S+'].includes(x.tier)).length)"` (esperado: bem acima de 7) antes de mexer no código.

- [ ] **Step 7: Gate e commit**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected: verde; nenhuma linha de snapshot.

```bash
git add src/lib/game/types.ts src/lib/game/dynasty/circuit.ts src/lib/game/dynasty/state.ts tests/dynastyCircuit.test.ts tests/dynastyState.test.ts
git commit -m "feat: regras do circuito de campeonatos menores da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Simulação de um evento

**Files:**
- Create: `src/lib/game/dynasty/circuitPlay.ts`
- Test: `tests/dynastyCircuit.test.ts` (novo `describe`)

**Interfaces:**
- Consumes:
  - `createMajorField`, `stripSeriesDetails` (`src/lib/game/simulation.ts`);
  - `runOnlineTournament` (`src/lib/game/online/tournament.ts`);
  - `CIRCUIT_PRIZES`, `circuitPlacementFrom` (Task 2);
  - `playoffBestOf` (Task 1).
- Produces:
  - `CircuitPlayInput { event: CircuitEvent; userTeam: CombatTeam; players: Player[]; lineup: SelectedPlayer[]; teams: HistoricalTeam[]; allPlayers: Player[]; seed: string; selectedMaps: MapId[] }`;
  - `playCircuitEvent(input: CircuitPlayInput): { result: CircuitResult; rounds: MajorRound[] }`.

- [ ] **Step 1: Teste que falha**

Acrescentar ao fim de `tests/dynastyCircuit.test.ts`:

```ts
import { players } from '../src/lib/game/data';
import { getTeamPlayers } from '../src/lib/game/data';
import { playCircuitEvent } from '../src/lib/game/dynasty/circuitPlay';
import { buildDynastyUserTeam } from '../src/lib/game/dynasty/seriesPlan';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';

describe('simulação de um evento do circuito', () => {
  const roster = getTeamPlayers(teams[0]).slice(0, 5);
  const lineup = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' as const }));
  const userTeam = buildDynastyUserTeam({ players: roster, lineup, seed: 'circuito', coach: null, teams, plan: { style: 'balanced', tactic: 'standard', study: false } });
  const circuit = createCircuit({ dynasty: settled('placementStage3'), teams, seed: 'circuito' });
  const input = (event = circuit.events[0]) => ({ event, userTeam, players: roster, lineup, teams, allPlayers: players, seed: 'circuito', selectedMaps: getDefaultMapSelection(roster, teams) });

  it('joga 8 times em MD3 até a final e paga pela colocação do usuário', () => {
    const started = performance.now();
    const { result, rounds } = playCircuitEvent(input());
    const elapsed = performance.now() - started;
    console.info(`circuit event simulated in ${elapsed.toFixed(0)} ms`);
    expect(rounds.map((round) => round.phase)).toEqual(['quarterfinal', 'semifinal', 'final']);
    expect(rounds.every((round) => round.series.every((series) => series.bestOf === 3))).toBe(true);
    expect(rounds.flatMap((round) => round.series).every((series) => series.maps.every((map) => !map.details))).toBe(true);
    expect(result.eventId).toBe(circuit.events[0].id);
    expect(result.prize).toBe(CIRCUIT_PRIZES[result.tier][result.placement]);
  });

  it('é determinístico pela seed', () => {
    expect(playCircuitEvent(input()).result).toEqual(playCircuitEvent(input()).result);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyCircuit.test.ts`
Expected: FAIL com `Cannot find module '../src/lib/game/dynasty/circuitPlay'`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/game/dynasty/circuitPlay.ts
import { runOnlineTournament } from '../online/tournament';
import { createMajorField, stripSeriesDetails } from '../simulation';
import type { CircuitEvent, CircuitResult, CombatTeam, HistoricalTeam, MajorRound, MapId, Player, SelectedPlayer } from '../types';
import { CIRCUIT_PRIZES, circuitPlacementFrom } from './circuit';

export interface CircuitPlayInput {
  event: CircuitEvent;
  /** `buildDynastyUserTeam` with the base plan, no study and no temporary training: coach, style and position already applied. */
  userTeam: CombatTeam;
  players: Player[];
  lineup: SelectedPlayer[];
  teams: HistoricalTeam[];
  allPlayers: Player[];
  seed: string;
  selectedMaps: MapId[];
}

/** Eight-team single elimination, every series BO3, all decisions by the bot policies. Kill feeds are dropped from the stored bracket. */
export function playCircuitEvent(input: CircuitPlayInput): { result: CircuitResult; rounds: MajorRound[] } {
  const byId = new Map(input.teams.map((team) => [team.id, team]));
  const eventTeams = input.event.teamIds.map((id) => byId.get(id)).filter((team): team is HistoricalTeam => Boolean(team));
  const { user, field, mapContext, tournamentSeed } = createMajorField(input.players, 'balanced', eventTeams, input.allPlayers, `${input.seed}:${input.event.id}`, input.lineup, {
    selectedMaps: input.selectedMaps,
    mode: 'dynasty',
    userTeam: input.userTeam,
    seedsWithoutStyle: true
  });
  const tournament = runOnlineTournament({
    organizations: [{ id: user.id, name: user.name, seed: 1, team: user, human: true }],
    botPool: field,
    entryStage: 'playoffs',
    seed: `${tournamentSeed}:circuit`,
    mapContext,
    playoffBestOf: { quarterfinal: 3, semifinal: 3, final: 3 }
  });
  const placement = circuitPlacementFrom(tournament.campaigns.find((campaign) => campaign.organizationId === user.id)?.placement ?? 'placement5to8');
  const rounds: MajorRound[] = tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map(stripSeriesDetails) }));
  return { result: { eventId: input.event.id, tier: input.event.tier, placement, prize: CIRCUIT_PRIZES[input.event.tier][placement] }, rounds };
}
```

- [ ] **Step 4: Rodar e medir**

Run: `npx vitest run tests/dynastyCircuit.test.ts 2>&1 | grep -E "circuit event simulated|Tests "`
Expected: todos passam e a linha `circuit event simulated in N ms` aparece.

Registrar N no relato. Se N passar de 300 ms:
- não mudar o formato;
- anotar como risco de travamento de interface na Task 5;
- lá, a página roda `playCircuitEvent` depois de um `await tick()`, com botão desabilitado e texto "Simulando…".

O kill feed já é descartado do chaveamento gravado, então o save não cresce.

- [ ] **Step 5: Gate e commit**

Run: `npm run validate && git status --short tests/__snapshots__`

```bash
git add src/lib/game/dynasty/circuitPlay.ts tests/dynastyCircuit.test.ts
git commit -m "feat: simulação dos eventos do circuito da Dinastia em eliminatória MD3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Tela `DynastyCircuit.svelte`

**Files:**
- Create: `src/lib/components/DynastyCircuit.svelte`

**Interfaces:**
- Consumes:
  - `isEventAvailable`, `isEventDone` (Task 2);
  - `formatUsd` (`src/lib/game/dynasty/prizes.ts`);
  - `buildBracket`, `revealRounds` (`src/lib/game/majorOverview.ts`);
  - `PlayoffBracket.svelte` (props `columns`, `userTeamId`, `championId`, `labels`, `onTeam`);
  - tipos `CircuitState`, `CircuitEvent`, `Language`, `HistoricalTeam`.
- Produces: componente com as props abaixo, usado na Task 5.
  - `circuit: CircuitState`
  - `language: Language`
  - `cash: number`
  - `playing: string | null`
  - `teamById: Map<string, HistoricalTeam>`
  - `onPlay: (eventId: string) => void`
  - `onSkip: (eventId: string) => void`
  - `onContinue: () => void`

- [ ] **Step 1: Componente**

```svelte
<!-- src/lib/components/DynastyCircuit.svelte -->
<script lang="ts">
  import PlayoffBracket from './PlayoffBracket.svelte';
  import { isEventAvailable, isEventDone } from '$lib/game/dynasty/circuit';
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { buildBracket, revealRounds } from '$lib/game/majorOverview';
  import type { CircuitEvent, CircuitState, HistoricalTeam, Language } from '$lib/game/types';

  export let circuit: CircuitState;
  export let language: Language = 'pt-BR';
  export let cash = 0;
  export let playing: string | null = null;
  export let teamById: Map<string, HistoricalTeam> = new Map();
  export let onPlay: (eventId: string) => void = () => {};
  export let onSkip: (eventId: string) => void = () => {};
  export let onContinue: () => void = () => {};

  const copy = {
    'pt-BR': { title: 'Circuito entre Majors', intro: 'Campeonatos menores valem prêmio e já entram no caixa antes da janela.', cash: 'Caixa', elite: 'Elite Series', open: 'Open Cup', invite: 'Convite', signup: 'Inscrição', play: 'Aceitar e jogar', signupPlay: 'Inscrever e jogar', skip: 'Pular', skipped: 'Pulado', locked: 'Libera com final no Open Cup #1', simulating: 'Simulando…', opponents: 'Adversários', prizes: 'Prêmios', champion: 'Campeão', runnerUp: 'Vice', semi: 'Semifinal', quarter: 'Quartas', earned: 'Prêmio', continue: 'Seguir para a janela', quarterfinal: 'Quartas', semifinal: 'Semifinal', final: 'Final', tbd: 'A definir', live: 'Ao vivo', pending: 'Aguardando' },
    es: { title: 'Circuito entre Majors', intro: 'Los torneos menores dan premio y entran en la caja antes de la ventana.', cash: 'Caja', elite: 'Elite Series', open: 'Open Cup', invite: 'Invitación', signup: 'Inscripción', play: 'Aceptar y jugar', signupPlay: 'Inscribirse y jugar', skip: 'Saltar', skipped: 'Saltado', locked: 'Se abre con final en el Open Cup #1', simulating: 'Simulando…', opponents: 'Rivales', prizes: 'Premios', champion: 'Campeón', runnerUp: 'Subcampeón', semi: 'Semifinal', quarter: 'Cuartos', earned: 'Premio', continue: 'Ir a la ventana', quarterfinal: 'Cuartos', semifinal: 'Semifinal', final: 'Final', tbd: 'Por definir', live: 'En vivo', pending: 'Pendiente' },
    en: { title: 'Circuit between Majors', intro: 'Smaller events pay prize money that reaches your cash before the window.', cash: 'Cash', elite: 'Elite Series', open: 'Open Cup', invite: 'Invite', signup: 'Sign-up', play: 'Accept and play', signupPlay: 'Sign up and play', skip: 'Skip', skipped: 'Skipped', locked: 'Unlocks with a final at Open Cup #1', simulating: 'Simulating…', opponents: 'Opponents', prizes: 'Prizes', champion: 'Champion', runnerUp: 'Runner-up', semi: 'Semifinal', quarter: 'Quarterfinal', earned: 'Prize', continue: 'Go to the window', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Final', tbd: 'TBD', live: 'Live', pending: 'Pending' }
  } as const;
  const tierPrizes = { elite: [60_000, 25_000, 12_000, 5_000], open: [20_000, 8_000, 4_000, 1_500] } as const;

  $: c = copy[language];
  $: allDone = circuit.events.every((event) => isEventDone(circuit, event.id) || !isEventAvailable(circuit, event));
  const resultOf = (event: CircuitEvent) => circuit.results.find((result) => result.eventId === event.id) ?? null;
  const columnsOf = (event: CircuitEvent) => buildBracket(revealRounds(circuit.brackets[event.id] ?? [], { liveSeriesId: null, complete: true }));
  const championOf = (event: CircuitEvent) => (circuit.brackets[event.id] ?? []).find((round) => round.phase === 'final')?.series[0]?.winnerId ?? null;
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
</script>

<section class="circuit">
  <header class="circuit-head">
    <div><span class="eyebrow">DINASTIA · CIRCUIT</span><h2>{c.title}</h2><p>{c.intro}</p></div>
    <strong class="cash">{c.cash} <b>{formatUsd(cash, language)}</b></strong>
  </header>

  <div class="events">
    {#each circuit.events as event (event.id)}
      {@const result = resultOf(event)}
      {@const available = isEventAvailable(circuit, event)}
      <article class="event {event.tier}" class:done={Boolean(result)} class:skipped={circuit.skipped.includes(event.id)}>
        <header>
          <span class="tag">{event.access === 'invite' ? c.invite : c.signup}</span>
          <h3>{c[event.tier]} #{event.index}</h3>
        </header>
        <ul class="prizes" aria-label={c.prizes}>
          {#each ['champion', 'runnerUp', 'semi', 'quarter'] as placement, index}
            <li class:hit={result?.placement === placement}><span>{c[placement]}</span><b>{formatUsd(tierPrizes[event.tier][index], language)}</b></li>
          {/each}
        </ul>
        <p class="opponents"><span>{c.opponents}</span> {event.teamIds.map(teamName).join(' · ')}</p>
        {#if result}
          <p class="earned">{c[result.placement]} · {c.earned} <b>{formatUsd(result.prize, language)}</b></p>
          <div class="bracket"><PlayoffBracket columns={columnsOf(event)} userTeamId="user" championId={championOf(event)} labels={{ quarterfinal: c.quarterfinal, semifinal: c.semifinal, final: c.final, tbd: c.tbd, live: c.live, pending: c.pending }} /></div>
        {:else if circuit.skipped.includes(event.id)}
          <p class="muted">{c.skipped}</p>
        {:else if !available}
          <p class="muted">{c.locked}</p>
        {:else}
          <div class="actions">
            <button class="primary" type="button" disabled={playing !== null} on:click={() => onPlay(event.id)}>{playing === event.id ? c.simulating : event.access === 'invite' ? c.play : c.signupPlay}</button>
            <button class="ghost" type="button" disabled={playing !== null} on:click={() => onSkip(event.id)}>{c.skip}</button>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <button class="primary wide" type="button" disabled={!allDone || playing !== null} on:click={onContinue}>{c.continue} →</button>
</section>

<style>
  .circuit { display: grid; gap: 18px; min-width: 0; }
  .circuit-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px; }
  .circuit-head h2, .circuit-head p { margin: 0; } .circuit-head p { color: var(--muted); }
  .cash { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; } .cash b { color: var(--accent); font-size: 1.2rem; }
  .events { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); }
  .event { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 6%, var(--surface)), var(--surface)); }
  .event.elite { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .event.skipped { opacity: .6; }
  .event header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; } .event h3 { margin: 0; font-size: 1.3rem; }
  .tag { padding: 2px 8px; border: 1px solid var(--line); color: var(--muted); font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .prizes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .prizes li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px; background: var(--surface-2); font-size: .74rem; }
  .prizes li.hit { outline: 1px solid var(--accent); } .prizes b { color: var(--accent); }
  .opponents { margin: 0; font-size: .74rem; color: var(--muted); overflow-wrap: anywhere; } .opponents span { color: var(--text); font-weight: 800; text-transform: uppercase; }
  .earned { margin: 0; font-weight: 800; } .earned b { color: var(--accent); }
  .muted { margin: 0; color: var(--muted); font-size: .8rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; } .actions button { flex: 1 1 140px; }
  .bracket { overflow-x: auto; max-width: 100%; }
  @media (prefers-reduced-motion: no-preference) { .event.done { animation: settle .35s ease-out; } }
  @keyframes settle { from { transform: translateY(6px); opacity: .5; } }
</style>
```

- [ ] **Step 2: Typecheck e build**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS` e build ok. O componente ainda não é usado.

Se o `svelte-check` reclamar do índice `c[placement]` ou `c[event.tier]`, trocar os `#each` por listas tipadas `as const` e registrar no relato.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/DynastyCircuit.svelte
git commit -m "feat: tela do circuito de campeonatos menores da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Fase `'circuit'` na página e no store

**Files:**
- Modify: `src/routes/+page.svelte` (imports; `startNextDynastyMajor`; novas funções; bloco da fase)
- Modify: `src/lib/game/store.ts` (normalização da fase)

**Interfaces:**
- Consumes:
  - `createCircuit`, `settleCircuitEvent`, `skipCircuitEvent`, `finishCircuit` (Task 2);
  - `playCircuitEvent` (Task 3);
  - `DynastyCircuit` (Task 4);
  - `buildDynastyUserTeam` (`src/lib/game/dynasty/seriesPlan.ts`);
  - `resolveDynastyPlayer` (`src/lib/game/dynasty/resolve.ts`);
  - `createWindow` (já importado).
- Produces:
  - fluxo resultado → `'circuit'` → `'window'`;
  - funções da página `openTransferWindow()`, `playCircuit(eventId)`, `skipCircuit(eventId)` e `continueFromCircuit()`.

- [ ] **Step 1: Store**

Em `src/lib/game/store.ts`, logo depois da linha que normaliza a fase `'window'`:

```ts
    if ((parsed.phase as string) === 'circuit' && (parsed.mode !== 'dynasty' || !parsed.dynasty?.circuit)) parsed.phase = parsed.mode === 'dynasty' ? 'result' : 'draft';
```

- [ ] **Step 2: Imports da página**

Acrescentar às listas existentes, sem duplicar:

```ts
  import DynastyCircuit from '$lib/components/DynastyCircuit.svelte';
  import { createCircuit, finishCircuit, settleCircuitEvent, skipCircuitEvent } from '$lib/game/dynasty/circuit';
  import { playCircuitEvent } from '$lib/game/dynasty/circuitPlay';
```

`buildDynastyUserTeam` já vem de `$lib/game/dynasty/seriesPlan`. `resolveDynastyPlayer`, `teams`, `players`, `playerById` e `teamById` já estão importados. Confirmar com `grep` antes de acrescentar.

- [ ] **Step 3: Fluxo**

Substituir `startNextDynastyMajor` inteira por estas duas funções, mais as novas:

```ts
  let circuitPlaying: string | null = null;

  /** Opens (or reopens) the transfer window of the current Major. */
  function openTransferWindow() {
    const dynasty = $game.dynasty;
    if (!dynasty) return;
    const transferWindow = dynasty.window?.majorNumber === dynasty.majorNumber
      ? dynasty.window
      : createWindow({ dynasty, lineup: selectedLineup, stats: $game.stats, seed: $game.seed, catalog: players, playerById, coaches, coachById });
    update({ dynasty: { ...dynasty, window: transferWindow }, phase: 'window' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Credits the Major, then runs the smaller-event circuit before the transfer window. Saves already in the window skip it. */
  function startNextDynastyMajor() {
    if (!isDynasty || !$game.dynasty || selectedLineup.length !== 5) return;
    settleDynastyIfNeeded();
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    stopLiveTick();
    awaitingAdvance = false;
    autoPausedHalf = '';
    resultStatsOpen = false;
    const dynasty = $game.dynasty;
    if (dynasty.window?.majorNumber === dynasty.majorNumber) { openTransferWindow(); return; }
    if (dynasty.circuit?.majorNumber === dynasty.majorNumber && dynasty.circuit.finished) { openTransferWindow(); return; }
    const circuit = dynasty.circuit?.majorNumber === dynasty.majorNumber ? dynasty.circuit : createCircuit({ dynasty, teams, seed: $game.seed });
    update({ dynasty: { ...dynasty, circuit }, phase: 'circuit' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function playCircuit(eventId: string) {
    const dynasty = $game.dynasty;
    const event = dynasty?.circuit?.events.find((item) => item.id === eventId);
    if (!dynasty?.circuit || !event || circuitPlaying) return;
    circuitPlaying = eventId;
    await tick();
    try {
      // Base plan, no study and no temporary training: the circuit never touches the Major's choices or evolution.
      const circuitPlayers = selectedLineup.flatMap((selected) => {
        const base = playerById.get(selected.playerId);
        return base ? [resolveDynastyPlayer(base, dynasty.playerOverrides[base.id])] : [];
      });
      const basePlan = dynasty.major?.basePlan ?? { style: $game.style, tactic: 'standard' as const, study: false };
      const userTeam = buildDynastyUserTeam({ players: circuitPlayers, lineup: selectedLineup, seed: `${$game.seed}:circuit`, coach: dynastyCoach, teams, plan: { ...basePlan, study: false } });
      const { result, rounds } = playCircuitEvent({ event, userTeam, players: circuitPlayers, lineup: selectedLineup, teams, allPlayers: players, seed: $game.seed, selectedMaps: $game.selectedMaps });
      update({ dynasty: settleCircuitEvent($game.dynasty!, result, rounds) });
    } finally {
      circuitPlaying = null;
    }
  }

  function skipCircuit(eventId: string) {
    if (!$game.dynasty || circuitPlaying) return;
    update({ dynasty: skipCircuitEvent($game.dynasty, eventId) });
  }

  function continueFromCircuit() {
    if (!$game.dynasty?.circuit || circuitPlaying) return;
    update({ dynasty: finishCircuit($game.dynasty) });
    openTransferWindow();
  }
```

Se `tick` não estiver importado de `svelte`, acrescentar ao import existente.

O botão do resultado continua chamando `startNextDynastyMajor`. Trocar o rótulo `t('dynastyWindow')` desse botão por um rótulo local:

```svelte
{$game.dynasty?.window?.majorNumber === $game.dynasty?.majorNumber || $game.dynasty?.circuit?.finished ? t('dynastyWindow') : ($game.language === 'en' ? 'Circuit' : $game.language === 'es' ? 'Circuito' : 'Circuito')}
```

- [ ] **Step 4: Bloco da fase**

Logo antes de `{:else if $game.phase === 'window' && $game.dynasty?.window}`:

```svelte
  {:else if $game.phase === 'circuit' && $game.dynasty?.circuit}
    <section class="screen shell">
      <DynastyCircuit circuit={$game.dynasty.circuit} language={$game.language} cash={$game.dynasty.cash} playing={circuitPlaying} {teamById} onPlay={playCircuit} onSkip={skipCircuit} onContinue={continueFromCircuit} />
    </section>
```

Gancho opcional da Fase 5: se `src/lib/game/dynasty/tips.ts` e `src/lib/components/DynastyTip.svelte` existirem no momento da execução, acrescentar `<DynastyTip context="circuit" ... />` acima de `<DynastyCircuit>`, com a mesma API usada nas outras telas. Se não existirem, não criar.

- [ ] **Step 5: Verificar**

Run: `npm run check && npx vitest run && npm run build && git status --short tests/__snapshots__`
Expected: `0 ERRORS 0 WARNINGS`, suíte verde, build ok, snapshot intacto.

Verificação no navegador, se houver; senão, registrar que não foi feita:
1. Dinastia até o fim do Major.
2. O botão "Circuito" abre a tela com os eventos certos para a colocação.
3. Jogar um evento credita o prêmio e mostra o chaveamento.
4. Recarregar a página no circuito mantém tudo sem pagar de novo.
5. "Seguir para a janela" abre a janela com o caixa já somado.
6. Em 375 px, sem scroll horizontal.
7. Normal com a seed `dourado-normal-2026` sem mudança.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.svelte src/lib/game/store.ts
git commit -m "feat: circuito de campeonatos menores entre o resultado e a janela da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 6: Gate final, spec e push

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (acrescentar a seção do circuito ao fim de "Sequência de entregas")

- [ ] **Step 1: Gate**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected: svelte-check `0 ERRORS 0 WARNINGS`; vitest com todos os arquivos verdes (inclui `dynastyCircuit`); build do front e do servidor; nenhuma linha de snapshot.

- [ ] **Step 2: Spec**

Acrescentar ao fim da seção "Sequência de entregas":

```markdown
5. **Circuito entre Majors** (plano `docs/superpowers/plans/2026-09-14-dinastia-r6-circuito-renda.md`, implementado): Elite Series por convite e Open Cup por inscrição, 8 times em eliminatória MD3, prêmios de US$ 1.500 a US$ 60.000 creditados antes da janela.
```

- [ ] **Step 3: Commit e push**

```bash
git add docs/superpowers/specs/2026-09-14-dinastia-design.md
git commit -m "docs: aponta o plano do circuito da Dinastia na spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
git push origin feat/dinastia
```

Expected: `feat/dinastia -> feat/dinastia`. `git ls-remote --heads origin main` continua em `c073ac5`.

- [ ] **Step 4: Relato**

Relatar:
- os commits;
- o tempo medido da simulação de um evento;
- as contagens de testes;
- se a verificação no navegador foi feita.

Riscos restantes:
- **Tempo do clique:** a simulação roda no thread principal.
- **Seleção de mapas:** o circuito usa a mesma do Major anterior.
- **Eventos do Challenger:** podem repetir times do Major.

## Riscos

- **Tempo de simulação.**
  - A Task 3 mede um evento de 7 séries MD3.
  - Acima de ~300 ms o clique trava a interface durante a simulação. A página mostra "Simulando…" depois de `tick()`, mas não usa worker.
  - O kill feed nunca é gravado.
- **Mapas.** `$game.selectedMaps` é a seleção do Major que acabou. Uma seleção inválida para a escalação atual faz `createMajorField` rodar sem `mapContext` (veto padrão), o que é aceitável.
- **Pools.** O Elite depende de times com tier de Stage 2 ou 3. Com o dataset atual há folga, mas um dataset reduzido cai no fallback do Stage 1.
- **Save antigo.** Save no resultado de um Major liquidado antes desta entrega cria o circuito ao clicar. Save já na janela pula o circuito.

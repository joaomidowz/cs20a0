# Dinastia C: valor de mercado, janela de transferências, evolução e card de linhagem — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entre um Major e outro da Dinastia, abrir uma janela de transferências com relatório de evolução, propostas, mercado com preços em dólar, alvo livre, troca de coach e reatribuição de posições; aplicar a evolução dos jogadores (versão do ano seguinte ou deriva) sem tocar no dataset; mostrar a linhagem da dinastia no card compartilhável.

**Architecture:** Toda a regra fica em módulos puros de `src/lib/game/dynasty/`: `value.ts` (preço), `resolve.ts` (jogador com deriva), `evolution.ts` (evolução por Major) e `window.ts` (estado imutável da janela, derivado por funções). O `WindowState` é gravado em `DynastyState.window`, então recarregar reproduz a mesma janela. A página ganha a fase `window` entre o resultado e a seleção de mapas, e o elenco da Dinastia passa sempre por `resolveDynastyPlayer`.

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (seções "Estado", "Modo e fluxo", "Valor de mercado do jogador", "Janela de transferências" e "Evolução").

## Global Constraints

- Idioma: docs, textos de UI e mensagens de commit em pt-BR; identificadores em inglês. Commits `feat: assunto em pt-BR`, sem escopo e sem gitmoji, terminados com:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
- Nunca fazer push.
- Gate `npm run validate`. `tests/normalRunGolden.test.ts` passa sem reescrever o snapshot (nunca rodar vitest com `-u`). Normal, Ranked, PRO, Sandbox e online não mudam: `resolveDynastyPlayer` só é chamado quando o modo é `dynasty`, e sem override devolve o mesmo objeto.
- O dataset (`players.game.json`, `teams.game.json`, `coaches.game.json`) nunca é alterado. A deriva vive em `DynastyState.playerOverrides`.
- Dinheiro é inteiro em dólar, arredondado a 5.000 (`roundToStep`).
- Valor do jogador: `50.000 × 1,09^(clamp(overall, 60, 99) − 60)` × raridade (common 1,00; rare 1,05; elite 1,12; legend 1,20; superstar 1,30; goat 1,45) × função (`role` contém `awp` 1,15; senão contém `igl` 1,10; senão 1,00) × (1 + 0,08 por badge `major-champion`, até 2), arredondado a 5.000, piso 30.000, teto 2.500.000.
- Valor do coach: `20.000 × 1,08^(overall − 60)`, arredondado a 5.000, piso 20.000.
- Janela: campeão faz até 1 troca, os demais até 2; troca é 1 saída e 1 entrada; 2 propostas a valor × [0,85; 1,10]; venda sem proposta a 70%; 10 ofertas a valor × [0,90; 1,15], 4 delas para a posição do titular de menor overall resolvido e as outras na faixa da média do elenco ± 8; 1 alvo livre por janela a valor × 1,25; trocar coach custa o valor dele entre 3 ofertas de `offerCoaches`; caixa nunca negativo; seed `${seed}:window:${majorNumber}`.
- Evolução: versão do ano seguinte (mesmo `baseId`, `year + 1`) quando existe; senão `delta = clamp(round((runRating − 1,00) × 12), −4, +4)`, desenvolvimento do coach ≥ 85 soma 1 e ≤ 60 subtrai 1, veterano (experience ≥ 94) limita a [−5, +1]; `driftTotal` fica em [−12, +12]; o delta vai para firepower, clutch, entry, awp, support, consistency, mental e overall; experience sobe 1 por Major; IGL não muda; atributos resolvidos ficam em 1..99. A evolução lê só `PlayerRunStats.runRating` (a entrega D troca o cálculo desse campo, não o nome).
- A entrega D mexe em `runStats.ts`, `majorAwards.ts` e na tela de stats em paralelo: esta entrega não altera esses arquivos.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/game/types.ts` | `WindowState`, `WindowOffer`, `WindowProposal`, `WindowMove`, `EvolutionEntry`; `DynastyState.window` tipado; `experience` na deriva; fase `window`. |
| `src/lib/game/dynasty/value.ts` | `roundToStep`, `playerMarketValue`, `coachMarketValue`. |
| `src/lib/game/dynasty/resolve.ts` | `DRIFT_KEYS`, `resolveDynastyPlayer`. |
| `src/lib/game/dynasty/evolution.ts` | `driftDelta`, `nextVersionOf`, `evolveLineup`. |
| `src/lib/game/dynasty/window.ts` | `createWindow`, `windowLineup`, `windowCash`, `movesLeft`, `salePriceFor`, `buyPriceFor`, `checkMove`, `makeMove`, `undoMove`, `setRole`, `lineupProblems`, `chooseCoach`, `canConfirmWindow`, `confirmWindow`. |
| `src/lib/game/dynasty/state.ts` | Guardar a janela válida ao carregar o save. |
| `src/lib/components/DynastyWindow.svelte` | Tela da janela. |
| `src/lib/game/i18n.ts` | Textos da janela, era e linhagem. |
| `src/lib/game/store.ts` | Fase `window` fora da Dinastia ou sem janela volta para uma fase válida. |
| `src/lib/components/DynastyHeader.svelte` | Nome de era com 2 títulos ou mais. |
| `src/routes/+page.svelte` | Elenco resolvido, "Janela de transferências" no resultado, fase `window`, confirmação, linhagem no card. |
| `src/lib/game/runCard.ts`, `src/lib/components/ShareRunCard.svelte` | `buildDynastyLineage` e seção de linhagem no card. |
| `tests/dynastyValue.test.ts`, `tests/dynastyEvolution.test.ts`, `tests/dynastyWindow.test.ts`, `tests/dynastyLineage.test.ts`, `tests/dynastyState.test.ts` | Testes. |

---

### Task 1: Tipos, valor de mercado e jogador resolvido

**Files:**
- Modify: `src/lib/game/types.ts`
- Create: `src/lib/game/dynasty/value.ts`, `src/lib/game/dynasty/resolve.ts`, `tests/dynastyValue.test.ts`

**Interfaces:**
- Consumes: `Player`, `Coach`, `PlayerOverride` de `types.ts`; `players` de `src/lib/game/data.ts` (só no teste).
- Produces: tipos `EvolutionEntry`, `WindowOffer`, `WindowProposal`, `WindowMove`, `WindowState`; `DynastyState.window: WindowState | null`; `PlayerOverride.drift` aceita `experience`; `GamePhase` com `'window'`; `VALUE_STEP`, `roundToStep(value: number): number`, `playerMarketValue(player: Player): number`, `coachMarketValue(coach: Pick<Coach, 'overall'>): number`; `DRIFT_KEYS`, `DriftKey`, `resolveDynastyPlayer(player: Player, override: PlayerOverride | null | undefined): Player`.

- [ ] **Step 1: Tipos em `src/lib/game/types.ts`**

Em `GamePhase`, acrescentar `| 'window'` depois de `| 'coach-draft'`.

Em `PlayerOverride`, trocar a linha de `drift` por:

```ts
  drift: Partial<Record<'firepower' | 'clutch' | 'entry' | 'awp' | 'support' | 'consistency' | 'mental' | 'overall' | 'experience', number>>;
```

Logo antes de `export interface DynastyState`, acrescentar:

```ts
/** What happened to one lineup player at the start of the transfer window. */
export interface EvolutionEntry {
  fromPlayerId: string;
  toPlayerId: string;
  kind: 'version' | 'drift' | 'stable';
  overallBefore: number;
  overallAfter: number;
}

export interface WindowOffer {
  playerId: string;
  /** Whole dollars. */
  price: number;
  /** Set on the offers drawn for the lineup's weakest position. */
  focusRole: LineupSlotRole | null;
}

export interface WindowProposal {
  playerId: string;
  /** Whole dollars another organization pays for this lineup player. */
  price: number;
}

export interface WindowMove {
  outPlayerId: string;
  inPlayerId: string;
  salePrice: number;
  buyPrice: number;
  kind: 'offer' | 'target';
}

/** Transfer window between two Dinastia Majors. Everything the screen shows derives from this object, so a reload reproduces it. */
export interface WindowState {
  majorNumber: number;
  seed: string;
  cashAtOpen: number;
  maxMoves: number;
  evolution: EvolutionEntry[];
  /** Lineup after the evolution, before any move. */
  baseLineup: SelectedPlayer[];
  /** Overrides after the evolution, keyed by player id. */
  overrides: Record<string, PlayerOverride>;
  proposals: WindowProposal[];
  offers: WindowOffer[];
  coachOfferIds: string[];
  moves: WindowMove[];
  /** Positions the user reassigned in the window, keyed by player id. */
  roleAssignments: Record<string, LineupSlotRole>;
  coachChange: { coachId: string; cost: number } | null;
}
```

Em `DynastyState`, trocar a linha `window: unknown | null;` por:

```ts
  window: WindowState | null;
```

- [ ] **Step 2: Teste que falha**

```ts
// tests/dynastyValue.test.ts
import { describe, expect, it } from 'vitest';
import { players } from '../src/lib/game/data';
import { resolveDynastyPlayer } from '../src/lib/game/dynasty/resolve';
import { coachMarketValue, playerMarketValue, roundToStep } from '../src/lib/game/dynasty/value';
import type { Player } from '../src/lib/game/types';

const player = (overall: number, rarity: string, role: string, badges: string[] = []) =>
  ({ id: 'x-2020', overall, rarity, role, badges }) as Player;

describe('valor de mercado', () => {
  it('arredonda a 5.000', () => {
    expect(roundToStep(112_499)).toBe(110_000);
    expect(roundToStep(112_500)).toBe(115_000);
  });

  it('segue a fórmula da spec com raridade, função e títulos', () => {
    expect(playerMarketValue(player(70, 'common', 'rifler'))).toBe(120_000);
    expect(playerMarketValue(player(90, 'goat', 'awper', ['major-champion']))).toBe(1_195_000);
    expect(playerMarketValue(player(80, 'rare', 'igl'))).toBe(325_000);
    expect(playerMarketValue(player(85, 'elite', 'awper-igl'))).toBe(555_000);
    expect(playerMarketValue(player(55, 'common', 'entry'))).toBe(50_000);
    expect(playerMarketValue(player(99, 'goat', 'awper', ['major-champion', 'major-champion']))).toBe(2_500_000);
  });

  it('cresce com o overall', () => {
    const values = Array.from({ length: 40 }, (_, index) => playerMarketValue(player(60 + index, 'common', 'rifler')));
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
  });

  it('todo jogador do dataset tem valor inteiro, múltiplo de 5.000 e dentro de piso e teto', () => {
    const problems = players.map((item) => [item.id, playerMarketValue(item)] as const)
      .filter(([, value]) => !Number.isInteger(value) || value % 5_000 !== 0 || value < 30_000 || value > 2_500_000);
    expect(problems).toEqual([]);
  });

  it('valor do coach com piso de 20.000', () => {
    expect(coachMarketValue({ overall: 60 })).toBe(20_000);
    expect(coachMarketValue({ overall: 85 })).toBe(135_000);
    expect(coachMarketValue({ overall: 99 })).toBe(400_000);
    expect(coachMarketValue({ overall: 50 })).toBe(20_000);
  });
});

describe('jogador resolvido', () => {
  const base = { id: 'r-2020', overall: 50, firepower: 98, clutch: 80, experience: 93, igl: 40 } as Player;

  it('sem override devolve o mesmo objeto', () => {
    expect(resolveDynastyPlayer(base, undefined)).toBe(base);
    expect(resolveDynastyPlayer(base, null)).toBe(base);
  });

  it('aplica a deriva com limites 1..99 e não altera o original', () => {
    const resolved = resolveDynastyPlayer(base, { drift: { firepower: 4, overall: -60, experience: 1 }, driftTotal: 0, versionsSince: [] });
    expect(resolved.firepower).toBe(99);
    expect(resolved.overall).toBe(1);
    expect(resolved.experience).toBe(94);
    expect(resolved.igl).toBe(40);
    expect(resolved.clutch).toBe(80);
    expect(base.firepower).toBe(98);
  });
});
```

Run: `npx vitest run tests/dynastyValue.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/game/dynasty/resolve"`.

- [ ] **Step 3: `value.ts`**

```ts
// src/lib/game/dynasty/value.ts
import type { Coach, Player } from '../types';

export const VALUE_STEP = 5_000;
const PLAYER_VALUE_FLOOR = 30_000;
const PLAYER_VALUE_CAP = 2_500_000;
const COACH_VALUE_FLOOR = 20_000;

const RARITY_MULTIPLIER: Readonly<Record<string, number>> = {
  common: 1,
  rare: 1.05,
  elite: 1.12,
  legend: 1.2,
  superstar: 1.3,
  goat: 1.45
};

export const roundToStep = (value: number) => Math.round(value / VALUE_STEP) * VALUE_STEP;

/** Market value in whole dollars, from the (resolved) player: overall curve × rarity × position × Major titles. */
export function playerMarketValue(player: Player): number {
  const overall = Math.min(99, Math.max(60, player.overall ?? 70));
  const base = 50_000 * 1.09 ** (overall - 60);
  const rarity = RARITY_MULTIPLIER[(player.rarity ?? 'common').toLowerCase()] ?? 1;
  const role = (player.role ?? '').toLowerCase();
  const position = role.includes('awp') ? 1.15 : role.includes('igl') ? 1.1 : 1;
  const titles = 1 + 0.08 * Math.min(2, (player.badges ?? []).filter((badge) => badge === 'major-champion').length);
  return Math.min(PLAYER_VALUE_CAP, Math.max(PLAYER_VALUE_FLOOR, roundToStep(base * rarity * position * titles)));
}

export const coachMarketValue = (coach: Pick<Coach, 'overall'>) =>
  Math.max(COACH_VALUE_FLOOR, roundToStep(20_000 * 1.08 ** (coach.overall - 60)));
```

- [ ] **Step 4: `resolve.ts`**

```ts
// src/lib/game/dynasty/resolve.ts
import type { Player, PlayerOverride } from '../types';

/** Attributes the Major-to-Major drift moves together. Experience grows on its own and IGL never drifts. */
export const DRIFT_KEYS = ['firepower', 'clutch', 'entry', 'awp', 'support', 'consistency', 'mental', 'overall'] as const;
export type DriftKey = (typeof DRIFT_KEYS)[number] | 'experience';

const clampAttribute = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

/** The only way to read a Dinastia player: the dataset version plus the dynasty's drift. Without an override the same object comes back. */
export function resolveDynastyPlayer(player: Player, override: PlayerOverride | null | undefined): Player {
  if (!override) return player;
  const resolved: Player = { ...player };
  for (const [key, delta] of Object.entries(override.drift) as Array<[DriftKey, number | undefined]>) {
    if (!delta) continue;
    resolved[key] = clampAttribute((player[key] ?? 70) + delta);
  }
  return resolved;
}
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/dynastyValue.test.ts && npm run check`
Expected: `7 passed`; `0 ERRORS 0 WARNINGS`. Se o check reclamar de `window: unknown` em `state.ts` ou no teste de estado, não é esperado: `null` continua válido para `WindowState | null`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/dynasty/value.ts src/lib/game/dynasty/resolve.ts tests/dynastyValue.test.ts
git commit -m "feat: valor de mercado em dólar e jogador resolvido da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Evolução entre Majors

**Files:**
- Create: `src/lib/game/dynasty/evolution.ts`, `tests/dynastyEvolution.test.ts`

**Interfaces:**
- Consumes: `resolveDynastyPlayer`, `DRIFT_KEYS` (Task 1); `getPlayerBaseId` de `src/lib/game/roleRules.ts`; `EvolutionEntry`, `PlayerOverride`, `PlayerRunStats`, `SelectedPlayer`, `Coach`, `Player`.
- Produces: `DRIFT_LIMIT = 12`; `driftDelta(rating: number, development: number | null, experience: number): number`; `nextVersionOf(player: Player, catalog: Player[]): Player | null`; `EvolveInput`; `EvolveResult`; `evolveLineup(input: EvolveInput): EvolveResult`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyEvolution.test.ts
import { describe, expect, it } from 'vitest';
import { driftDelta, evolveLineup, nextVersionOf } from '../src/lib/game/dynasty/evolution';
import type { Coach, Player, PlayerRunStats, SelectedPlayer } from '../src/lib/game/types';

const make = (id: string, baseId: string, year: number, overall: number, experience = 80): Player =>
  ({ id, baseId, nickname: baseId, year, overall, experience, firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, consistency: 80, mental: 80, igl: 30, role: 'rifler' }) as Player;
const stat = (playerId: string, runRating: number) => ({ playerId, runRating }) as PlayerRunStats;

describe('delta de deriva', () => {
  it('segue rating, coach e veterano', () => {
    const cases: Array<[number, number | null, number, number]> = [
      [1.3, 70, 80, 4], [0.7, 70, 80, -4], [1.5, 70, 80, 4], [1.3, 90, 80, 4], [1.1, 90, 80, 2],
      [1.0, 55, 80, -1], [1.3, 70, 95, 1], [0.5, 70, 95, -5], [1.04, 70, 80, 0], [0.96, null, 80, 0]
    ];
    for (const [rating, development, experience, expected] of cases) expect(driftDelta(rating, development, experience)).toBe(expected);
  });
});

describe('versão do ano seguinte', () => {
  it('escolhe a versão de maior overall do ano seguinte', () => {
    const catalog = [make('v-2020', 'v', 2020, 80), make('v-a-2021', 'v', 2021, 84), make('v-b-2021', 'v', 2021, 86), make('v-2022', 'v', 2022, 90)];
    expect(nextVersionOf(catalog[0], catalog)?.id).toBe('v-b-2021');
    expect(nextVersionOf(catalog[3], catalog)).toBeNull();
  });
});

describe('evolução do elenco', () => {
  const version = make('v-2020', 'v', 2020, 80);
  const next = make('v-2021', 'v', 2021, 86);
  const star = make('s-2020', 's', 2020, 90);
  const capped = make('c-2020', 'c', 2020, 70);
  const quiet = make('q-2020', 'q', 2020, 75);
  const catalog = [version, next, star, capped, quiet];
  const playerById = new Map(catalog.map((player) => [player.id, player]));
  const lineup: SelectedPlayer[] = [
    { playerId: 'v-2020', selectedSlotRole: 'rifler' },
    { playerId: 's-2020', selectedSlotRole: 'awper' },
    { playerId: 'c-2020', selectedSlotRole: 'entry' },
    { playerId: 'q-2020', selectedSlotRole: 'support' }
  ];
  const coach = { development: 90 } as Coach;
  const result = evolveLineup({
    lineup,
    overrides: {
      'v-2020': { drift: { overall: 2 }, driftTotal: 2, versionsSince: ['v-2019'] },
      'c-2020': { drift: { overall: 10, firepower: 10 }, driftTotal: 10, versionsSince: [] }
    },
    stats: [stat('v-2020', 1.5), stat('s-2020', 1.1), stat('c-2020', 1.3)],
    coach,
    catalog,
    playerById
  });

  it('troca pela versão seguinte e zera a deriva', () => {
    expect(result.lineup[0]).toEqual({ playerId: 'v-2021', selectedSlotRole: 'rifler' });
    expect(result.overrides['v-2021']).toEqual({ drift: {}, driftTotal: 0, versionsSince: ['v-2019', 'v-2020'] });
    expect(result.overrides['v-2020']).toBeUndefined();
    expect(result.evolution[0]).toEqual({ fromPlayerId: 'v-2020', toPlayerId: 'v-2021', kind: 'version', overallBefore: 82, overallAfter: 86 });
  });

  it('deriva com bônus de coach e soma experiência', () => {
    expect(result.overrides['s-2020']).toEqual({
      drift: { firepower: 2, clutch: 2, entry: 2, awp: 2, support: 2, consistency: 2, mental: 2, overall: 2, experience: 1 },
      driftTotal: 2,
      versionsSince: []
    });
    expect(result.evolution[1]).toEqual({ fromPlayerId: 's-2020', toPlayerId: 's-2020', kind: 'drift', overallBefore: 90, overallAfter: 92 });
  });

  it('respeita o limite acumulado de 12', () => {
    expect(result.overrides['c-2020'].driftTotal).toBe(12);
    expect(result.overrides['c-2020'].drift.overall).toBe(12);
    expect(result.overrides['c-2020'].drift.firepower).toBe(12);
    expect(result.evolution[2]).toMatchObject({ kind: 'drift', overallBefore: 80, overallAfter: 82 });
  });

  it('sem stats usa rating 1,00: com coach de desenvolvimento 90 ainda deriva +1', () => {
    expect(result.overrides['q-2020'].driftTotal).toBe(1);
    expect(result.overrides['q-2020'].drift.experience).toBe(1);
    expect(result.evolution[3]).toMatchObject({ kind: 'drift', overallBefore: 75, overallAfter: 76 });
  });

  it('sem coach e com rating 1,00 fica estável e ganha só experiência', () => {
    const calm = evolveLineup({ lineup: [{ playerId: 'q-2020', selectedSlotRole: 'support' }], overrides: {}, stats: [], coach: null, catalog, playerById });
    expect(calm.overrides['q-2020']).toEqual({ drift: { experience: 1 }, driftTotal: 0, versionsSince: [] });
    expect(calm.evolution[0]).toEqual({ fromPlayerId: 'q-2020', toPlayerId: 'q-2020', kind: 'stable', overallBefore: 75, overallAfter: 75 });
  });

  it('não altera o dataset', () => {
    expect(star.overall).toBe(90);
    expect(capped.firepower).toBe(80);
  });
});
```

Contas do teste: `v-2020` resolvido = 80 + 2 = 82 e vira `v-2021` (86). `s-2020`: rating 1,10 → +1, coach 90 → +2. `c-2020`: rating 1,30 → +4, coach 90 → +5, limite → +4, acumulado 10 + 4 = 14 → corta em 12, aplica +2 (overall 80 → 82). `q-2020`: sem stats → rating 1,00 → 0, coach 90 → +1. Sem coach, o mesmo jogador fica estável.

Run: `npx vitest run tests/dynastyEvolution.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/game/dynasty/evolution"`.

- [ ] **Step 2: Implementar**

```ts
// src/lib/game/dynasty/evolution.ts
import { getPlayerBaseId } from '../roleRules';
import type { Coach, EvolutionEntry, Player, PlayerOverride, PlayerRunStats, SelectedPlayer } from '../types';
import { DRIFT_KEYS, resolveDynastyPlayer } from './resolve';

/** Largest drift a player can carry over the same dataset version, in both directions. */
export const DRIFT_LIMIT = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Overall points a player moves after one Major. `development` is the coach's attribute (null without a coach). */
export function driftDelta(rating: number, development: number | null, experience: number): number {
  let delta = Math.round((rating - 1) * 12) + 0;
  if (development !== null && development >= 85) delta += 1;
  else if (development !== null && development <= 60) delta -= 1;
  return experience >= 94 ? clamp(delta, -5, 1) : clamp(delta, -4, 4);
}

/** Same person one year later; with two versions that year (two Majors), the higher overall, then the id. */
export function nextVersionOf(player: Player, catalog: Player[]): Player | null {
  const baseId = getPlayerBaseId(player);
  const year = (player.year ?? 0) + 1;
  return catalog
    .filter((candidate) => candidate.year === year && getPlayerBaseId(candidate) === baseId)
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0) || left.id.localeCompare(right.id))[0] ?? null;
}

export interface EvolveInput {
  lineup: SelectedPlayer[];
  overrides: Record<string, PlayerOverride>;
  stats: PlayerRunStats[];
  coach: Coach | null;
  catalog: Player[];
  playerById: Map<string, Player>;
}

export interface EvolveResult {
  lineup: SelectedPlayer[];
  overrides: Record<string, PlayerOverride>;
  evolution: EvolutionEntry[];
}

/** Runs once when the transfer window opens. The dataset is never touched: versions swap ids, drift lives in the overrides. */
export function evolveLineup(input: EvolveInput): EvolveResult {
  const lineup: SelectedPlayer[] = [];
  const overrides: Record<string, PlayerOverride> = {};
  const evolution: EvolutionEntry[] = [];
  for (const selected of input.lineup) {
    const base = input.playerById.get(selected.playerId);
    if (!base) {
      lineup.push(selected);
      continue;
    }
    const previous = input.overrides[selected.playerId];
    const before = resolveDynastyPlayer(base, previous);
    const next = nextVersionOf(base, input.catalog);
    if (next) {
      lineup.push({ playerId: next.id, selectedSlotRole: selected.selectedSlotRole });
      overrides[next.id] = { drift: {}, driftTotal: 0, versionsSince: [...(previous?.versionsSince ?? []), base.id] };
      evolution.push({ fromPlayerId: base.id, toPlayerId: next.id, kind: 'version', overallBefore: before.overall ?? 70, overallAfter: next.overall ?? 70 });
      continue;
    }
    const rating = input.stats.find((stat) => stat.playerId === selected.playerId)?.runRating ?? 1;
    const wanted = driftDelta(rating, input.coach?.development ?? null, before.experience ?? 70);
    const total = previous?.driftTotal ?? 0;
    const applied = clamp(total + wanted, -DRIFT_LIMIT, DRIFT_LIMIT) - total;
    const drift: PlayerOverride['drift'] = { ...(previous?.drift ?? {}) };
    if (applied !== 0) for (const key of DRIFT_KEYS) drift[key] = (drift[key] ?? 0) + applied;
    drift.experience = (drift.experience ?? 0) + 1;
    const override: PlayerOverride = { drift, driftTotal: total + applied, versionsSince: previous?.versionsSince ?? [] };
    overrides[selected.playerId] = override;
    lineup.push(selected);
    const after = resolveDynastyPlayer(base, override);
    evolution.push({ fromPlayerId: base.id, toPlayerId: base.id, kind: applied === 0 ? 'stable' : 'drift', overallBefore: before.overall ?? 70, overallAfter: after.overall ?? 70 });
  }
  return { lineup, overrides, evolution };
}
```

- [ ] **Step 3: Rodar**

Run: `npx vitest run tests/dynastyEvolution.test.ts && npm run check`
Expected: `8 passed`; `0 ERRORS 0 WARNINGS`. Se `getPlayerBaseId` normalizar o `baseId` de forma diferente dos ids do teste (por exemplo, removendo hífens), ajustar os ids sintéticos do teste para letras simples e registrar no relato; não mude `getPlayerBaseId`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/dynasty/evolution.ts tests/dynastyEvolution.test.ts
git commit -m "feat: evolução dos jogadores da Dinastia por versão do ano seguinte ou deriva

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Janela de transferências (regras puras)

**Files:**
- Create: `src/lib/game/dynasty/window.ts`, `tests/dynastyWindow.test.ts`
- Modify: `src/lib/game/dynasty/state.ts`, `tests/dynastyState.test.ts` (acrescentar um teste)

**Interfaces:**
- Consumes: `evolveLineup` (Task 2); `resolveDynastyPlayer` (Task 1); `playerMarketValue`, `coachMarketValue`, `roundToStep` (Task 1); `offerCoaches` de `coachOffer.ts`; `createSeededRng` de `simulation.ts`; `getEligibleSlotRoles`, `getPlayerBaseId`, `ROLE_LIMITS` de `roleRules.ts`; `coaches`, `coachById` de `data.ts` (teste).
- Produces: constantes `MARKET_SIZE = 10`, `FOCUS_OFFERS = 4`, `PROPOSALS = 2`, `TARGET_MARKUP = 1.25`, `SALE_WITHOUT_PROPOSAL = 0.7`, `OVERALL_BAND = 8`; tipos `CreateWindowInput`, `IncomingPlayer`, `MoveProblem`; funções `createWindow(input): WindowState`, `windowLineup(state): SelectedPlayer[]`, `windowCash(state): number`, `movesLeft(state): number`, `salePriceFor(state, playerId, playerById): number`, `buyPriceFor(state, incoming, playerById): number | null`, `checkMove(state, outPlayerId, incoming, playerById): MoveProblem | null`, `makeMove(...)`, `undoMove(state, index)`, `setRole(state, playerId, role)`, `lineupProblems(state, playerById): string[]`, `chooseCoach(state, coachId | null, coachById)`, `canConfirmWindow(state, playerById): boolean`, `confirmWindow(dynasty, state, playerById): { dynasty: DynastyState; lineup: SelectedPlayer[] }`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyWindow.test.ts
import { describe, expect, it } from 'vitest';
import { coachById, coaches } from '../src/lib/game/data';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createDynastyState } from '../src/lib/game/dynasty/state';
import { coachMarketValue, playerMarketValue, roundToStep } from '../src/lib/game/dynasty/value';
import {
  canConfirmWindow, checkMove, chooseCoach, confirmWindow, createWindow, FOCUS_OFFERS, lineupProblems, makeMove, MARKET_SIZE,
  movesLeft, salePriceFor, setRole, undoMove, windowCash, windowLineup
} from '../src/lib/game/dynasty/window';
import type { DynastyMajorSummary, DynastyState, LineupSlotRole, Player, PlayerRunStats, SelectedPlayer } from '../src/lib/game/types';

const ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];
const makePlayer = (id: string, role: LineupSlotRole, overall: number): Player => ({
  id, baseId: id, nickname: id, title: '', traits: [], teamId: `${id}-team`, year: 2020, role, overall, rarity: 'common',
  firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, igl: role === 'igl' ? 85 : 30, experience: 80, consistency: 80, mental: 80
});
const catalog = Array.from({ length: 60 }, (_, index) => makePlayer(`c${index}`, ROLES[index % 6], 66 + (index % 25)));
const lineupPlayers = [makePlayer('l0', 'awper', 88), makePlayer('l1', 'igl', 84), makePlayer('l2', 'entry', 80), makePlayer('l3', 'lurker', 76), makePlayer('l4', 'support', 72)];
const playerById = new Map([...catalog, ...lineupPlayers].map((player) => [player.id, player]));
const lineup: SelectedPlayer[] = lineupPlayers.map((player) => ({ playerId: player.id, selectedSlotRole: player.role as LineupSlotRole }));
const stats = [1.3, 1, 0.7, 1, 1].map((runRating, index) => ({ playerId: lineupPlayers[index].id, runRating }) as PlayerRunStats);
const summary = (placement: string) =>
  ({ majorNumber: 1, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup, coachId: null, movesMade: 0, stats }) as DynastyMajorSummary;
const dynastyWith = (cash: number, placement = 'placement5to8'): DynastyState => ({ ...createDynastyState(), cash, prizeCreditedFor: 1, history: [summary(placement)] });
const open = (dynasty: DynastyState, seed = 'janela') => createWindow({ dynasty, lineup, stats, seed, catalog, playerById, coaches, coachById });
const rifler = catalog.find((player) => player.role === 'rifler')!;

describe('abertura da janela', () => {
  it('traz evolução, limite de trocas pela colocação e o caixa', () => {
    const state = open(dynastyWith(250_000));
    expect(state.maxMoves).toBe(2);
    expect(open(dynastyWith(0, 'placementChampion')).maxMoves).toBe(1);
    expect(state.cashAtOpen).toBe(250_000);
    expect(state.evolution.map((entry) => [entry.fromPlayerId, entry.kind, entry.overallBefore, entry.overallAfter])).toEqual([
      ['l0', 'drift', 88, 92], ['l1', 'stable', 84, 84], ['l2', 'drift', 80, 76], ['l3', 'stable', 76, 76], ['l4', 'stable', 72, 72]
    ]);
    expect(windowLineup(state)).toEqual(lineup);
    expect(lineupProblems(state, playerById)).toEqual([]);
  });

  it('monta 10 ofertas, 4 para a posição mais fraca, sem jogadores do elenco e com preço na faixa', () => {
    const state = open(dynastyWith(0));
    expect(state.offers).toHaveLength(MARKET_SIZE);
    const focus = state.offers.filter((offer) => offer.focusRole === 'support');
    expect(focus).toHaveLength(FOCUS_OFFERS);
    expect(focus.every((offer) => getEligibleSlotRoles(playerById.get(offer.playerId)!).includes('support'))).toBe(true);
    expect(state.offers.some((offer) => offer.playerId.startsWith('l'))).toBe(false);
    expect(new Set(state.offers.map((offer) => offer.playerId)).size).toBe(MARKET_SIZE);
    for (const offer of state.offers) {
      const value = playerMarketValue(playerById.get(offer.playerId)!);
      expect(offer.price).toBeGreaterThanOrEqual(roundToStep(value * 0.9));
      expect(offer.price).toBeLessThanOrEqual(roundToStep(value * 1.15));
    }
  });

  it('traz duas propostas por jogadores distintos, três coaches e é determinística', () => {
    const state = open(dynastyWith(0));
    expect(state.proposals).toHaveLength(2);
    expect(new Set(state.proposals.map((proposal) => proposal.playerId)).size).toBe(2);
    expect(state.proposals.every((proposal) => salePriceFor(state, proposal.playerId, playerById) === proposal.price)).toBe(true);
    expect(state.coachOfferIds).toHaveLength(3);
    expect(JSON.stringify(open(dynastyWith(0)))).toBe(JSON.stringify(state));
    expect(JSON.stringify(open(dynastyWith(0), 'outra'))).not.toBe(JSON.stringify(state));
  });
});

describe('trocas', () => {
  const expensive = catalog.reduce((best, player) => ((player.overall ?? 0) > (best.overall ?? 0) ? player : best));

  it('respeitam caixa, limite, venda única e alvo livre com ágio', () => {
    expect(checkMove(open(dynastyWith(0)), 'l4', { kind: 'target', playerId: expensive.id }, playerById)).toBe('no-cash');
    const rich = open(dynastyWith(5_000_000));
    const afterTarget = makeMove(rich, 'l4', { kind: 'target', playerId: expensive.id }, playerById);
    expect(afterTarget.moves[0].buyPrice).toBe(roundToStep(playerMarketValue(expensive) * 1.25));
    expect(windowCash(afterTarget)).toBe(5_000_000 + afterTarget.moves[0].salePrice - afterTarget.moves[0].buyPrice);
    expect(checkMove(afterTarget, 'l3', { kind: 'target', playerId: rifler.id }, playerById)).toBe('target-used');
    expect(checkMove(afterTarget, 'l4', { kind: 'target', playerId: rifler.id }, playerById)).toBe('already-sold');
    expect(checkMove(afterTarget, 'l3', { kind: 'target', playerId: 'l1' }, playerById)).toBe('duplicate-player');
    const offer = afterTarget.offers.find((item) => checkMove(afterTarget, 'l3', { kind: 'offer', playerId: item.playerId }, playerById) === null)!;
    const twoMoves = makeMove(afterTarget, 'l3', { kind: 'offer', playerId: offer.playerId }, playerById);
    expect(movesLeft(twoMoves)).toBe(0);
    expect(checkMove(twoMoves, 'l2', { kind: 'offer', playerId: twoMoves.offers[0].playerId }, playerById)).toBe('no-moves');
    expect(checkMove(afterTarget, 'l2', { kind: 'offer', playerId: 'c-inexistente' }, playerById)).toBe('unknown-player');
    expect(undoMove(twoMoves, 1).moves).toEqual(afterTarget.moves);
    expect(() => makeMove(twoMoves, 'l2', { kind: 'offer', playerId: offer.playerId }, playerById)).toThrow(/no-moves/);
  });

  it('posição herdada inválida exige reatribuir antes de confirmar', () => {
    const state = makeMove(open(dynastyWith(5_000_000)), 'l0', { kind: 'target', playerId: rifler.id }, playerById);
    expect(windowLineup(state)[0]).toEqual({ playerId: rifler.id, selectedSlotRole: 'awper' });
    expect(lineupProblems(state, playerById)).toEqual([`${rifler.id}:ineligible`]);
    expect(canConfirmWindow(state, playerById)).toBe(false);
    const fixed = setRole(state, rifler.id, 'rifler');
    expect(lineupProblems(fixed, playerById)).toEqual([]);
    expect(canConfirmWindow(fixed, playerById)).toBe(true);
    expect(undoMove(fixed, 0).roleAssignments).toEqual({});
  });
});

describe('coach e confirmação', () => {
  it('coach custa o valor e confirmar aplica elenco, caixa, coach, deriva e histórico', () => {
    const dynasty = dynastyWith(5_000_000);
    const base = open(dynasty);
    const coach = coachById.get(base.coachOfferIds[0])!;
    const withCoach = chooseCoach(base, coach.id, coachById);
    expect(withCoach.coachChange).toEqual({ coachId: coach.id, cost: coachMarketValue(coach) });
    expect(windowCash(withCoach)).toBe(5_000_000 - coachMarketValue(coach));
    expect(chooseCoach(withCoach, null, coachById).coachChange).toBeNull();
    expect(() => chooseCoach(base, 'coach-inexistente', coachById)).toThrow();
    const moved = makeMove(withCoach, 'l0', { kind: 'target', playerId: rifler.id }, playerById);
    expect(() => confirmWindow(dynasty, moved, playerById)).toThrow();
    const { dynasty: next, lineup: nextLineup } = confirmWindow(dynasty, setRole(moved, rifler.id, 'rifler'), playerById);
    expect(nextLineup.map((selected) => selected.playerId)).toEqual([rifler.id, 'l1', 'l2', 'l3', 'l4']);
    expect(next.cash).toBe(windowCash(moved));
    expect(next.coachId).toBe(coach.id);
    expect(next.window).toBeNull();
    expect(next.history.at(-1)?.movesMade).toBe(1);
    expect(Object.keys(next.playerOverrides).sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(next.playerOverrides.l2.drift.overall).toBe(-4);
  });
});
```

A ordem das verificações em `checkMove` (limite, elenco, venda, jogador, duplicado, oferta/alvo, caixa) define qual problema aparece quando mais de um se aplica; os testes dependem dessa ordem.

Em `tests/dynastyState.test.ts`, acrescentar ao `describe` existente:

```ts
  it('mantém uma janela válida ao carregar e descarta lixo', () => {
    const saved = { majorNumber: 1, seed: 's', cashAtOpen: 0, maxMoves: 2, evolution: [], baseLineup: [], overrides: {}, proposals: [], offers: [], coachOfferIds: [], moves: [], roleAssignments: {}, coachChange: null };
    expect(ensureDynastyState({ window: saved }).window).toEqual(saved);
    expect(ensureDynastyState({ window: { moves: 'x' } }).window).toBeNull();
  });
```

Run: `npx vitest run tests/dynastyWindow.test.ts tests/dynastyState.test.ts`
Expected: FAIL (módulo `window` inexistente; teste de estado falha porque `ensureDynastyState` descarta a janela).

- [ ] **Step 2: Guardar a janela no save (`state.ts`)**

Acrescentar `WindowState` ao import de tipos e, antes de `ensureDynastyState`:

```ts
const isWindowState = (value: unknown): value is WindowState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WindowState>;
  return typeof candidate.majorNumber === 'number' && typeof candidate.cashAtOpen === 'number' && typeof candidate.maxMoves === 'number'
    && Array.isArray(candidate.baseLineup) && Array.isArray(candidate.moves) && Array.isArray(candidate.offers)
    && Array.isArray(candidate.proposals) && Array.isArray(candidate.evolution) && Array.isArray(candidate.coachOfferIds);
};
```

Em `ensureDynastyState`, trocar `window: null,` por `window: isWindowState(raw.window) ? raw.window : null,`.

- [ ] **Step 3: `window.ts`**

```ts
// src/lib/game/dynasty/window.ts
import { getEligibleSlotRoles, getPlayerBaseId, ROLE_LIMITS } from '../roleRules';
import { createSeededRng, type SeededRng } from '../simulation';
import type { Coach, DynastyState, LineupSlotRole, Player, PlayerRunStats, SelectedPlayer, WindowOffer, WindowProposal, WindowState } from '../types';
import { offerCoaches } from './coachOffer';
import { evolveLineup } from './evolution';
import { resolveDynastyPlayer } from './resolve';
import { coachMarketValue, playerMarketValue, roundToStep } from './value';

export const MARKET_SIZE = 10;
export const FOCUS_OFFERS = 4;
export const PROPOSALS = 2;
export const TARGET_MARKUP = 1.25;
export const SALE_WITHOUT_PROPOSAL = 0.7;
export const OVERALL_BAND = 8;

export interface CreateWindowInput {
  /** Dynasty already settled for the Major that just ended. */
  dynasty: DynastyState;
  lineup: SelectedPlayer[];
  stats: PlayerRunStats[];
  /** Seed of the Major that just ended. */
  seed: string;
  /** Players that can be offered or targeted (the dataset, never the secret players). */
  catalog: Player[];
  playerById: Map<string, Player>;
  coaches: Coach[];
  coachById: Map<string, Coach>;
}

export interface IncomingPlayer {
  kind: 'offer' | 'target';
  playerId: string;
}

export type MoveProblem = 'no-moves' | 'not-in-lineup' | 'already-sold' | 'unknown-player' | 'duplicate-player' | 'not-offered' | 'offer-used' | 'target-used' | 'no-cash';

const pickIndex = (rng: SeededRng, length: number) => Math.floor(rng() * length);

export function createWindow(input: CreateWindowInput): WindowState {
  const { dynasty } = input;
  const coach = dynasty.coachId ? input.coachById.get(dynasty.coachId) ?? null : null;
  const evolved = evolveLineup({ lineup: input.lineup, overrides: dynasty.playerOverrides, stats: input.stats, coach, catalog: input.catalog, playerById: input.playerById });
  const rng = createSeededRng(`${input.seed}:window:${dynasty.majorNumber}`);
  const resolved = evolved.lineup.flatMap((selected) => {
    const player = input.playerById.get(selected.playerId);
    return player ? [{ selected, player: resolveDynastyPlayer(player, evolved.overrides[selected.playerId]) }] : [];
  });

  const proposals: WindowProposal[] = [];
  const proposalPool = [...resolved];
  while (proposals.length < PROPOSALS && proposalPool.length) {
    const [entry] = proposalPool.splice(pickIndex(rng, proposalPool.length), 1);
    proposals.push({ playerId: entry.selected.playerId, price: roundToStep(playerMarketValue(entry.player) * (0.85 + rng() * 0.25)) });
  }

  const lineupBaseIds = new Set(resolved.map((entry) => getPlayerBaseId(entry.player)));
  const candidates = input.catalog.filter((player) => !lineupBaseIds.has(getPlayerBaseId(player)));
  const weakest = [...resolved].sort((left, right) => (left.player.overall ?? 70) - (right.player.overall ?? 70))[0];
  const focusRole = weakest?.selected.selectedSlotRole ?? null;
  const average = resolved.reduce((sum, entry) => sum + (entry.player.overall ?? 70), 0) / Math.max(1, resolved.length);
  const offers: WindowOffer[] = [];
  const offered = new Set<string>();
  const draw = (pool: Player[], role: LineupSlotRole | null) => {
    const available = pool.filter((player) => !offered.has(getPlayerBaseId(player)));
    if (!available.length) return false;
    const player = available[pickIndex(rng, available.length)];
    offered.add(getPlayerBaseId(player));
    offers.push({ playerId: player.id, price: roundToStep(playerMarketValue(player) * (0.9 + rng() * 0.25)), focusRole: role });
    return true;
  };
  if (focusRole) {
    const focusPool = candidates.filter((player) => getEligibleSlotRoles(player).includes(focusRole));
    let focusCount = 0;
    while (focusCount < FOCUS_OFFERS && draw(focusPool, focusRole)) focusCount += 1;
  }
  const band = candidates.filter((player) => Math.abs((player.overall ?? 70) - average) <= OVERALL_BAND);
  while (offers.length < MARKET_SIZE && draw(band, null));
  while (offers.length < MARKET_SIZE && draw(candidates, null));

  const excludedTeams = [...resolved.flatMap((entry) => (entry.player.teamId ? [entry.player.teamId] : [])), ...(coach ? [coach.teamId] : [])];
  const coachOfferIds = offerCoaches(input.coaches, `${input.seed}:window:${dynasty.majorNumber}`, excludedTeams)
    .filter((item) => item.baseId !== coach?.baseId)
    .map((item) => item.id);

  return {
    majorNumber: dynasty.majorNumber,
    seed: input.seed,
    cashAtOpen: dynasty.cash,
    maxMoves: dynasty.history.at(-1)?.placement === 'placementChampion' ? 1 : 2,
    evolution: evolved.evolution,
    baseLineup: evolved.lineup,
    overrides: evolved.overrides,
    proposals,
    offers,
    coachOfferIds,
    moves: [],
    roleAssignments: {},
    coachChange: null
  };
}

export const windowCash = (state: WindowState) =>
  state.cashAtOpen + state.moves.reduce((sum, move) => sum + move.salePrice - move.buyPrice, 0) - (state.coachChange?.cost ?? 0);

export const movesLeft = (state: WindowState) => state.maxMoves - state.moves.length;

/** Lineup after the moves (the newcomer takes the outgoing player's position) and the user's reassignments. */
export function windowLineup(state: WindowState): SelectedPlayer[] {
  const lineup = state.baseLineup.map((selected) => ({ ...selected }));
  for (const move of state.moves) {
    const index = lineup.findIndex((selected) => selected.playerId === move.outPlayerId);
    if (index >= 0) lineup[index] = { playerId: move.inPlayerId, selectedSlotRole: lineup[index].selectedSlotRole };
  }
  return lineup.map((selected) => {
    const role = state.roleAssignments[selected.playerId];
    return role ? { ...selected, selectedSlotRole: role } : selected;
  });
}

export function salePriceFor(state: WindowState, playerId: string, playerById: Map<string, Player>): number {
  const proposal = state.proposals.find((item) => item.playerId === playerId);
  if (proposal) return proposal.price;
  const player = playerById.get(playerId);
  return player ? roundToStep(playerMarketValue(resolveDynastyPlayer(player, state.overrides[playerId])) * SALE_WITHOUT_PROPOSAL) : 0;
}

export function buyPriceFor(state: WindowState, incoming: IncomingPlayer, playerById: Map<string, Player>): number | null {
  if (incoming.kind === 'offer') return state.offers.find((offer) => offer.playerId === incoming.playerId)?.price ?? null;
  const player = playerById.get(incoming.playerId);
  return player ? roundToStep(playerMarketValue(player) * TARGET_MARKUP) : null;
}

export function checkMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): MoveProblem | null {
  if (movesLeft(state) <= 0) return 'no-moves';
  if (!state.baseLineup.some((selected) => selected.playerId === outPlayerId)) return 'not-in-lineup';
  if (state.moves.some((move) => move.outPlayerId === outPlayerId)) return 'already-sold';
  const player = playerById.get(incoming.playerId);
  if (!player) return 'unknown-player';
  const lineupBaseIds = new Set(windowLineup(state).flatMap((selected) => {
    const current = playerById.get(selected.playerId);
    return current ? [getPlayerBaseId(current)] : [];
  }));
  if (lineupBaseIds.has(getPlayerBaseId(player))) return 'duplicate-player';
  if (incoming.kind === 'offer') {
    if (!state.offers.some((offer) => offer.playerId === incoming.playerId)) return 'not-offered';
    if (state.moves.some((move) => move.inPlayerId === incoming.playerId)) return 'offer-used';
  } else if (state.moves.some((move) => move.kind === 'target')) {
    return 'target-used';
  }
  const price = buyPriceFor(state, incoming, playerById) ?? 0;
  if (windowCash(state) + salePriceFor(state, outPlayerId, playerById) - price < 0) return 'no-cash';
  return null;
}

export function makeMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): WindowState {
  const problem = checkMove(state, outPlayerId, incoming, playerById);
  if (problem) throw new Error(`Troca inválida: ${problem}`);
  return {
    ...state,
    moves: [...state.moves, {
      outPlayerId,
      inPlayerId: incoming.playerId,
      salePrice: salePriceFor(state, outPlayerId, playerById),
      buyPrice: buyPriceFor(state, incoming, playerById) ?? 0,
      kind: incoming.kind
    }]
  };
}

export function undoMove(state: WindowState, index: number): WindowState {
  const move = state.moves[index];
  if (!move) return state;
  const { [move.inPlayerId]: _removed, ...roleAssignments } = state.roleAssignments;
  return { ...state, moves: state.moves.filter((_, position) => position !== index), roleAssignments };
}

export const setRole = (state: WindowState, playerId: string, role: LineupSlotRole): WindowState =>
  ({ ...state, roleAssignments: { ...state.roleAssignments, [playerId]: role } });

/** `<playerId>:ineligible` for a position the player cannot take, `role:<role>` for a position over its limit. */
export function lineupProblems(state: WindowState, playerById: Map<string, Player>): string[] {
  const lineup = windowLineup(state);
  const problems: string[] = [];
  for (const selected of lineup) {
    const player = playerById.get(selected.playerId);
    if (!player || !getEligibleSlotRoles(player).includes(selected.selectedSlotRole)) problems.push(`${selected.playerId}:ineligible`);
  }
  for (const role of Object.keys(ROLE_LIMITS) as LineupSlotRole[]) {
    if (lineup.filter((selected) => selected.selectedSlotRole === role).length > ROLE_LIMITS[role]) problems.push(`role:${role}`);
  }
  return problems;
}

export function chooseCoach(state: WindowState, coachId: string | null, coachById: Map<string, Coach>): WindowState {
  if (coachId === null) return { ...state, coachChange: null };
  const coach = coachById.get(coachId);
  if (!coach || !state.coachOfferIds.includes(coachId)) throw new Error('Coach fora das ofertas da janela');
  return { ...state, coachChange: { coachId, cost: coachMarketValue(coach) } };
}

export const canConfirmWindow = (state: WindowState, playerById: Map<string, Player>) =>
  windowCash(state) >= 0 && windowLineup(state).length === 5 && lineupProblems(state, playerById).length === 0;

/** Applies the window to the dynasty. The caller then opens the next Major with `beginNextDynastyMajor`. */
export function confirmWindow(dynasty: DynastyState, state: WindowState, playerById: Map<string, Player>): { dynasty: DynastyState; lineup: SelectedPlayer[] } {
  if (!canConfirmWindow(state, playerById)) throw new Error('A janela ainda tem caixa negativo ou posições inválidas');
  const lineup = windowLineup(state);
  const kept = new Set(lineup.map((selected) => selected.playerId));
  const playerOverrides = Object.fromEntries(Object.entries(state.overrides).filter(([playerId]) => kept.has(playerId)));
  const history = dynasty.history.map((item, index) => (index === dynasty.history.length - 1 ? { ...item, movesMade: state.moves.length } : item));
  return {
    dynasty: { ...dynasty, cash: windowCash(state), coachId: state.coachChange?.coachId ?? dynasty.coachId, playerOverrides, history, window: null },
    lineup
  };
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/dynastyWindow.test.ts tests/dynastyState.test.ts && npm run check`
Expected: testes passam; `0 ERRORS 0 WARNINGS`. Se "monta 10 ofertas" falhar em `focus` porque `getEligibleSlotRoles` dá mais de uma posição para os jogadores sintéticos, imprimir `getEligibleSlotRoles(catalog[5])` e `getEligibleSlotRoles(lineupPlayers[4])`, relatar e ajustar só os atributos dos jogadores sintéticos (nunca `roleRules`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/dynasty/window.ts src/lib/game/dynasty/state.ts tests/dynastyWindow.test.ts tests/dynastyState.test.ts
git commit -m "feat: regras da janela de transferências da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Tela da janela e textos

**Files:**
- Create: `src/lib/components/DynastyWindow.svelte`
- Modify: `src/lib/game/i18n.ts`

**Interfaces:**
- Consumes: funções de `window.ts` (Task 3); `resolveDynastyPlayer` e `coachMarketValue` (Task 1); `formatUsd` de `prizes.ts`; `getEligibleSlotRoles`, `getPlayerBaseId`, `getRoleLabel` de `roleRules.ts`; `translate` de `i18n.ts`.
- Produces: componente `DynastyWindow` com props `state: WindowState`, `language: Language`, `playerById: Map<string, Player>`, `coachById: Map<string, Coach>`, `currentCoach: Coach | null`, `catalog: Player[]`, `teamLabel: (teamId: string) => string`, `onChange: (next: WindowState) => void`, `onConfirm: () => void`; chaves i18n listadas no Step 1.

- [ ] **Step 1: Textos**

No bloco `pt` de `src/lib/game/i18n.ts`, logo depois da linha `,coachStaff: 'Comissão técnica'`:

```ts
  ,dynastyWindow: 'Janela de transferências'
  ,windowIntro: 'O elenco evoluiu com o Major. Venda, compre, troque o coach e confirme para ir ao próximo Major.'
  ,windowEvolution: 'Evolução do elenco'
  ,windowVersion: 'Nova versão'
  ,windowDrift: 'Rendimento'
  ,windowStable: 'Estável'
  ,windowCash: 'Caixa após as trocas'
  ,windowMovesLeft: 'Trocas restantes'
  ,windowLineup: 'Elenco'
  ,windowSell: 'Vender'
  ,windowSelling: 'Vendendo'
  ,windowProposals: 'Propostas pelos seus jogadores'
  ,windowMarket: 'Mercado'
  ,windowFocus: 'Para a posição mais fraca'
  ,windowTarget: 'Alvo livre (+25%)'
  ,windowSearch: 'Buscar jogador pelo nick'
  ,windowBuy: 'Comprar'
  ,windowPickSale: 'Escolha primeiro quem sai do elenco'
  ,windowMoves: 'Trocas feitas'
  ,windowUndo: 'Desfazer'
  ,windowCoachKeep: 'Manter coach'
  ,windowCoachOffers: 'Coaches disponíveis'
  ,windowHire: 'Contratar'
  ,windowConfirm: 'Confirmar e ir ao próximo Major'
  ,windowNoCash: 'Caixa insuficiente para essa troca'
  ,windowNoMoves: 'Sem trocas restantes nesta janela'
  ,windowInvalidMove: 'Essa troca não é possível'
  ,windowFixRoles: 'Ajuste as posições antes de confirmar'
  ,dynastyEra: 'Era'
  ,lineageTitle: 'Linhagem'
```

No `Object.assign(dictionaries.es, { ... })` que contém `coachStaff: 'Cuerpo técnico',`, logo depois dessa chave:

```ts
  dynastyWindow: 'Ventana de fichajes', windowIntro: 'La plantilla evolucionó con el Major. Vende, compra, cambia el coach y confirma para ir al siguiente Major.', windowEvolution: 'Evolución de la plantilla', windowVersion: 'Nueva versión', windowDrift: 'Rendimiento', windowStable: 'Estable', windowCash: 'Caja tras los fichajes', windowMovesLeft: 'Cambios restantes', windowLineup: 'Plantilla', windowSell: 'Vender', windowSelling: 'Vendiendo', windowProposals: 'Ofertas por tus jugadores', windowMarket: 'Mercado', windowFocus: 'Para la posición más débil', windowTarget: 'Objetivo libre (+25%)', windowSearch: 'Buscar jugador por nick', windowBuy: 'Comprar', windowPickSale: 'Elige primero quién sale de la plantilla', windowMoves: 'Cambios hechos', windowUndo: 'Deshacer', windowCoachKeep: 'Mantener coach', windowCoachOffers: 'Coaches disponibles', windowHire: 'Contratar', windowConfirm: 'Confirmar e ir al siguiente Major', windowNoCash: 'Caja insuficiente para ese cambio', windowNoMoves: 'Sin cambios restantes en esta ventana', windowInvalidMove: 'Ese cambio no es posible', windowFixRoles: 'Ajusta las posiciones antes de confirmar', dynastyEra: 'Era', lineageTitle: 'Linaje',
```

No `Object.assign(dictionaries.en, { ... })` que contém `coachStaff: 'Coaching staff',`, logo depois dessa chave:

```ts
  dynastyWindow: 'Transfer window', windowIntro: 'The roster evolved with the Major. Sell, buy, swap the coach and confirm to move on to the next Major.', windowEvolution: 'Roster evolution', windowVersion: 'New version', windowDrift: 'Form', windowStable: 'Stable', windowCash: 'Cash after moves', windowMovesLeft: 'Moves left', windowLineup: 'Roster', windowSell: 'Sell', windowSelling: 'Selling', windowProposals: 'Offers for your players', windowMarket: 'Market', windowFocus: 'For the weakest position', windowTarget: 'Free target (+25%)', windowSearch: 'Search player by nick', windowBuy: 'Buy', windowPickSale: 'Pick who leaves the roster first', windowMoves: 'Moves made', windowUndo: 'Undo', windowCoachKeep: 'Keep coach', windowCoachOffers: 'Available coaches', windowHire: 'Hire', windowConfirm: 'Confirm and go to the next Major', windowNoCash: 'Not enough cash for this move', windowNoMoves: 'No moves left in this window', windowInvalidMove: 'This move is not possible', windowFixRoles: 'Fix the positions before confirming', dynastyEra: 'Era', lineageTitle: 'Lineage',
```

- [ ] **Step 2: Componente**

```svelte
<!-- src/lib/components/DynastyWindow.svelte -->
<script lang="ts">
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { coachMarketValue } from '$lib/game/dynasty/value';
  import {
    buyPriceFor, canConfirmWindow, checkMove, chooseCoach, lineupProblems, makeMove, movesLeft, salePriceFor, setRole,
    undoMove, windowCash, windowLineup, type IncomingPlayer, type MoveProblem
  } from '$lib/game/dynasty/window';
  import { translate } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getPlayerBaseId, getRoleLabel } from '$lib/game/roleRules';
  import type { Coach, Language, LineupSlotRole, Player, WindowState } from '$lib/game/types';

  export let state: WindowState;
  export let language: Language = 'pt-BR';
  export let playerById: Map<string, Player>;
  export let coachById: Map<string, Coach>;
  export let currentCoach: Coach | null = null;
  export let catalog: Player[] = [];
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onChange: (next: WindowState) => void = () => {};
  export let onConfirm: () => void = () => {};

  let selectedOut: string | null = null;
  let query = '';
  let error = '';

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: lineup = windowLineup(state);
  $: cash = windowCash(state);
  $: left = movesLeft(state);
  $: problems = lineupProblems(state, playerById);
  $: ready = canConfirmWindow(state, playerById);
  $: soldIds = new Set(state.moves.map((move) => move.outPlayerId));
  $: boughtIds = new Set(state.moves.map((move) => move.inPlayerId));
  $: targetUsed = state.moves.some((move) => move.kind === 'target');
  $: lineupBaseIds = new Set(lineup.flatMap((selected) => { const player = playerById.get(selected.playerId); return player ? [getPlayerBaseId(player)] : []; }));
  $: searchResults = query.trim().length >= 2
    ? catalog.filter((player) => (player.nickname ?? '').toLowerCase().includes(query.trim().toLowerCase()) && !lineupBaseIds.has(getPlayerBaseId(player))).slice(0, 12)
    : [];

  const view = (playerId: string) => {
    const player = playerById.get(playerId);
    return player ? resolveDynastyPlayer(player, state.overrides[playerId]) : null;
  };
  const nick = (playerId: string) => playerById.get(playerId)?.nickname ?? playerId;
  const problemMessage = (problem: MoveProblem) => (problem === 'no-cash' ? t('windowNoCash') : problem === 'no-moves' ? t('windowNoMoves') : t('windowInvalidMove'));

  function buy(incoming: IncomingPlayer) {
    error = '';
    if (!selectedOut) { error = t('windowPickSale'); return; }
    const problem = checkMove(state, selectedOut, incoming, playerById);
    if (problem) { error = problemMessage(problem); return; }
    onChange(makeMove(state, selectedOut, incoming, playerById));
    selectedOut = null;
  }

  function pickRole(playerId: string, event: Event) {
    onChange(setRole(state, playerId, (event.currentTarget as HTMLSelectElement).value as LineupSlotRole));
  }

  function pickCoach(coachId: string | null) {
    error = '';
    onChange(chooseCoach(state, coachId, coachById));
  }
</script>

<div class="window">
  <section class="panel window-evolution">
    <span class="eyebrow">{t('windowEvolution')}</span>
    <ul>
      {#each state.evolution as entry (entry.fromPlayerId)}
        <li class={entry.kind}>
          <b>{nick(entry.fromPlayerId)}</b>
          {#if entry.kind === 'version'}<span>{t('windowVersion')} · {playerById.get(entry.toPlayerId)?.year ?? ''}</span>{:else}<span>{entry.kind === 'drift' ? t('windowDrift') : t('windowStable')}</span>{/if}
          <em>{entry.overallBefore} → {entry.overallAfter}</em>
        </li>
      {/each}
    </ul>
  </section>

  <section class="panel window-status" role="status">
    <span>{t('windowCash')} <b class:negative={cash < 0}>{formatUsd(cash, language)}</b></span>
    <span>{t('windowMovesLeft')} <b>{left}</b></span>
  </section>

  <section class="panel window-lineup">
    <span class="eyebrow">{t('windowLineup')}</span>
    {#each lineup as selected (selected.playerId)}
      {@const player = view(selected.playerId)}
      {#if player}
        <div class="window-row" class:selling={selectedOut === selected.playerId} class:problem={problems.includes(`${selected.playerId}:ineligible`)}>
          <strong>{player.nickname}</strong>
          <span class="overall">{player.overall ?? 70}</span>
          <select value={selected.selectedSlotRole} aria-label={getRoleLabel(selected.selectedSlotRole)} on:change={(event) => pickRole(selected.playerId, event)}>
            {#each getEligibleSlotRoles(player) as role}<option value={role}>{getRoleLabel(role)}</option>{/each}
            {#if !getEligibleSlotRoles(player).includes(selected.selectedSlotRole)}<option value={selected.selectedSlotRole}>{getRoleLabel(selected.selectedSlotRole)} ⚠</option>{/if}
          </select>
          {#if !boughtIds.has(selected.playerId) && !soldIds.has(selected.playerId)}
            <button class="secondary" type="button" disabled={left <= 0} on:click={() => { selectedOut = selectedOut === selected.playerId ? null : selected.playerId; error = ''; }}>
              {selectedOut === selected.playerId ? t('windowSelling') : t('windowSell')} · {formatUsd(salePriceFor(state, selected.playerId, playerById), language)}
            </button>
          {/if}
        </div>
      {/if}
    {/each}
    {#if problems.length}<p class="window-warning">{t('windowFixRoles')}</p>{/if}
  </section>

  {#if state.proposals.length}
    <section class="panel">
      <span class="eyebrow">{t('windowProposals')}</span>
      <ul class="window-list">{#each state.proposals as proposal (proposal.playerId)}<li><b>{nick(proposal.playerId)}</b><em>{formatUsd(proposal.price, language)}</em></li>{/each}</ul>
    </section>
  {/if}

  <section class="panel">
    <span class="eyebrow">{t('windowMarket')}</span>
    {#if error}<p class="window-warning" role="alert">{error}</p>{/if}
    <div class="window-market">
      {#each state.offers as offer (offer.playerId)}
        {@const player = playerById.get(offer.playerId)}
        {#if player}
          <article class:focus={offer.focusRole !== null}>
            <strong>{player.nickname}</strong>
            <small>{teamLabel(player.teamId ?? '')} · {getEligibleSlotRoles(player).map(getRoleLabel).join('/')}</small>
            {#if offer.focusRole}<small class="focus-tag">{t('windowFocus')}</small>{/if}
            <span class="overall">{player.overall ?? 70}</span>
            <button class="primary" type="button" disabled={boughtIds.has(offer.playerId) || left <= 0} on:click={() => buy({ kind: 'offer', playerId: offer.playerId })}>{t('windowBuy')} · {formatUsd(offer.price, language)}</button>
          </article>
        {/if}
      {/each}
    </div>
  </section>

  <section class="panel">
    <span class="eyebrow">{t('windowTarget')}</span>
    <input type="search" bind:value={query} placeholder={t('windowSearch')} disabled={targetUsed} />
    {#if !targetUsed}
      <ul class="window-list">
        {#each searchResults as player (player.id)}
          <li><b>{player.nickname} {player.year ?? ''}</b><span class="overall">{player.overall ?? 70}</span><button class="secondary" type="button" disabled={left <= 0} on:click={() => buy({ kind: 'target', playerId: player.id })}>{t('windowBuy')} · {formatUsd(buyPriceFor(state, { kind: 'target', playerId: player.id }, playerById) ?? 0, language)}</button></li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if state.moves.length}
    <section class="panel">
      <span class="eyebrow">{t('windowMoves')}</span>
      <ul class="window-list">
        {#each state.moves as move, index (move.outPlayerId)}
          <li><b>{nick(move.outPlayerId)} → {nick(move.inPlayerId)}</b><em>+{formatUsd(move.salePrice, language)} / −{formatUsd(move.buyPrice, language)}</em><button class="ghost" type="button" on:click={() => onChange(undoMove(state, index))}>{t('windowUndo')}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="panel">
    <span class="eyebrow">{t('windowCoachOffers')}</span>
    <div class="window-market">
      <article class:focus={state.coachChange === null}>
        <strong>{currentCoach?.name ?? '—'}</strong>
        <small>{currentCoach ? teamLabel(currentCoach.teamId) : ''}</small>
        <span class="overall">{currentCoach?.overall ?? '—'}</span>
        <button class="secondary" type="button" disabled={state.coachChange === null} on:click={() => pickCoach(null)}>{t('windowCoachKeep')}</button>
      </article>
      {#each state.coachOfferIds as coachId (coachId)}
        {@const coach = coachById.get(coachId)}
        {#if coach}
          <article class:focus={state.coachChange?.coachId === coachId}>
            <strong>{coach.name}</strong>
            <small>{teamLabel(coach.teamId)}</small>
            <span class="overall">{coach.overall}</span>
            <button class="primary" type="button" disabled={state.coachChange?.coachId === coachId} on:click={() => pickCoach(coachId)}>{t('windowHire')} · {formatUsd(coachMarketValue(coach), language)}</button>
          </article>
        {/if}
      {/each}
    </div>
  </section>

  <button class="primary wide" type="button" disabled={!ready} on:click={onConfirm}>{t('windowConfirm')} →</button>
</div>

<style>
  .window { display: grid; gap: 14px; }
  .window section { display: grid; gap: 10px; padding: 16px; }
  .window ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .window-evolution li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; font-size: .82rem; }
  .window-evolution li.version em, .window-evolution li.drift em { color: var(--accent); }
  .window-status { display: flex; flex-wrap: wrap; gap: 10px 22px; font-size: .85rem; }
  .window-status b { color: var(--accent); }
  .window-status b.negative { color: var(--danger); }
  .window-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); }
  .window-row.selling { outline: 1px solid var(--accent); }
  .window-row.problem select { border-color: var(--danger); }
  .window-market { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .window-market article { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--line); background: var(--surface-2); }
  .window-market article.focus { border-color: var(--accent); }
  .window-market small { color: var(--muted); overflow-wrap: anywhere; }
  .focus-tag { color: var(--accent) !important; }
  .window-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; }
  .overall { font-weight: 900; color: var(--accent); }
  .window-warning { margin: 0; color: var(--accent-2); font-size: .78rem; }
  @media (max-width: 560px) { .window-row { grid-template-columns: minmax(0, 1fr) auto; } }
</style>
```

- [ ] **Step 3: Rodar**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS`; build ok (o componente ainda não é usado pela página; o check valida os tipos).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/DynastyWindow.svelte src/lib/game/i18n.ts
git commit -m "feat: tela da janela de transferências da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Janela no fluxo da página

**Files:**
- Modify: `src/routes/+page.svelte`, `src/lib/game/store.ts`, `src/lib/components/DynastyHeader.svelte`

**Interfaces:**
- Consumes: `resolveDynastyPlayer` (Task 1); `createWindow`, `confirmWindow` (Task 3); `DynastyWindow` (Task 4); `beginNextDynastyMajor`, `settleDynastyIfNeeded`, `dynastyCoach`, `coachTeamLabel` e `players`, `playerById`, `coaches`, `coachById` já presentes na página.
- Produces: funções `startNextDynastyMajor` (abre a janela), `updateTransferWindow(next: WindowState)`, `confirmTransferWindow()`; `DynastyHeader.eraName: string | null`.

- [ ] **Step 1: Elenco resolvido**

Em `src/routes/+page.svelte`, acrescentar os imports (às listas existentes, sem duplicar):

```ts
  import DynastyWindow from '$lib/components/DynastyWindow.svelte';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { confirmWindow, createWindow } from '$lib/game/dynasty/window';
```

e `type WindowState` à lista de tipos de `$lib/game/types`.

Trocar a linha de `$: selectedPlayers = ...` por:

```ts
  $: selectedPlayers = isProMode
    ? ($game.proRevealed ? proAdjustedPlayers : proPickedPlayers)
    : selectedLineup
      .map((selected) => playerById.get(selected.playerId))
      .filter((player): player is Player => Boolean(player))
      // Dinastia: strength, cards, HUD, stats and the Major all read the player with the dynasty's drift.
      .map((player) => (isDynasty ? resolveDynastyPlayer(player, $game.dynasty?.playerOverrides[player.id]) : player));
```

- [ ] **Step 2: Abrir e confirmar a janela**

Substituir a função `startNextDynastyMajor` inteira (incluindo o comentário acima dela) por:

```ts
  /** Credits the Major and opens the transfer window: evolution, proposals, market and coach before the next Major. */
  function startNextDynastyMajor() {
    if (!isDynasty || !$game.dynasty || selectedLineup.length !== 5) return;
    settleDynastyIfNeeded();
    const dynasty = $game.dynasty;
    const transferWindow = dynasty.window?.majorNumber === dynasty.majorNumber
      ? dynasty.window
      : createWindow({ dynasty, lineup: selectedLineup, stats: $game.stats, seed: $game.seed, catalog: players, playerById, coaches, coachById });
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    stopLiveTick();
    awaitingAdvance = false;
    autoPausedHalf = '';
    resultStatsOpen = false;
    update({ dynasty: { ...dynasty, window: transferWindow }, phase: 'window' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateTransferWindow(next: WindowState) {
    if (!$game.dynasty) return;
    update({ dynasty: { ...$game.dynasty, window: next } });
  }

  /** Applies the window (lineup, cash, coach, drift) and opens the next Major at the map selection. */
  function confirmTransferWindow() {
    if (!isDynasty || !$game.dynasty?.window) return;
    const { dynasty, lineup } = confirmWindow($game.dynasty, $game.dynasty.window, playerById);
    campaign = null;
    update({ dynasty: beginNextDynastyMajor(dynasty), selectedPlayers: lineup, seed: makeSeed(), majorRun: null, playedSeries: {}, stats: [], completedSeries: 0, phase: 'map-selection' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
```

(Se `players` não estiver importado de `$lib/game/data` na página, acrescentar à lista desse import.)

- [ ] **Step 3: Botão do resultado e bloco da fase**

Na linha `result-actions`, trocar `{t('dynastyNextMajor')}` por `{t('dynastyWindow')}` (o `on:click={startNextDynastyMajor}` fica igual).

Logo antes de `{:else if $game.phase === 'coach-draft'}`, acrescentar:

```svelte
  {:else if $game.phase === 'window' && $game.dynasty?.window}
    <section class="screen shell">
      <header class="screen-header"><span class="eyebrow">DINASTIA · {t('dynastyMajorNumber')} #{$game.dynasty.majorNumber}</span><h1>{t('dynastyWindow')}</h1><p>{t('windowIntro')}</p></header>
      <DynastyWindow state={$game.dynasty.window} language={$game.language} {playerById} {coachById} currentCoach={dynastyCoach} catalog={players} teamLabel={coachTeamLabel} onChange={updateTransferWindow} onConfirm={confirmTransferWindow} />
    </section>
```

- [ ] **Step 4: Nome de era no cabeçalho**

Em `src/lib/components/DynastyHeader.svelte`, acrescentar `export let eraName: string | null = null;` depois de `coachName` e, no markup, logo depois de `<span class="eyebrow">DINASTIA</span>`:

```svelte
  {#if eraName}<span class="pill legend">{eraName}</span>{/if}
```

Na página, no `<DynastyHeader ... />`, acrescentar `eraName={$game.dynasty.titles >= 2 ? `${t('dynastyEra')} ${t('yourOrg')}` : null}`.

- [ ] **Step 5: Store**

Em `src/lib/game/store.ts`, logo depois da linha que normaliza `coach-draft`:

```ts
    if ((parsed.phase as string) === 'window' && (parsed.mode !== 'dynasty' || !parsed.dynasty?.window)) parsed.phase = parsed.mode === 'dynasty' ? 'result' : 'draft';
```

- [ ] **Step 6: Verificar**

Run: `npm run check && npx vitest run && git status --short tests/__snapshots__ && npm run build`
Expected: `0 ERRORS 0 WARNINGS`; suíte completa verde; nenhuma linha de snapshot; build ok.

Verificação no navegador (`npm run dev`), se houver navegador; senão, registrar que não foi feita:
1. Dinastia: jogar o Major 1 até o resultado; o botão principal diz "Janela de transferências".
2. A janela mostra a evolução dos 5, o caixa com o prêmio, 2 trocas (ou 1 se campeão), propostas, 10 ofertas e 3 coaches.
3. Vender um jogador e comprar uma oferta; recarregar a página: a janela volta igual, com a troca.
4. Comprar alguém que não joga na posição herdada: o confirmar fica desabilitado até trocar a posição no seletor.
5. Confirmar: vai para os mapas com o elenco novo; o cabeçalho mostra o caixa atualizado e Major #2.
6. Normal com `?seed=dourado-normal-2026`: nada muda.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte src/lib/game/store.ts src/lib/components/DynastyHeader.svelte
git commit -m "feat: Dinastia abre a janela de transferências entre os Majors e aplica a evolução ao elenco

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 6: Card de linhagem

**Files:**
- Modify: `src/lib/game/runCard.ts`, `src/lib/components/ShareRunCard.svelte`, `src/routes/+page.svelte`
- Create: `tests/dynastyLineage.test.ts`

**Interfaces:**
- Consumes: `DynastyMajorSummary`, `Player`.
- Produces: `LineageEntry`; `buildDynastyLineage(history: DynastyMajorSummary[], playerById: Map<string, Player>): LineageEntry[]`; props `lineage: LineageEntry[]`, `lineageLabel: string`, `eraLabel: string | null` em `ShareRunCard`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyLineage.test.ts
import { describe, expect, it } from 'vitest';
import { buildDynastyLineage } from '../src/lib/game/runCard';
import type { DynastyMajorSummary, Player } from '../src/lib/game/types';

const summary = (majorNumber: number, placement: string, ids: string[]) =>
  ({ majorNumber, seed: 's', entryStage: 'stage1', placement, prize: 0, awardsBonus: 0, lineup: ids.map((playerId) => ({ playerId, selectedSlotRole: 'rifler' })), coachId: null, movesMade: 0, stats: [] }) as DynastyMajorSummary;

describe('linhagem da dinastia', () => {
  it('lista cada Major com colocação, título e nicks do elenco', () => {
    const playerById = new Map<string, Player>([['a-2020', { id: 'a-2020', nickname: 'alpha' } as Player]]);
    expect(buildDynastyLineage([summary(1, 'placementStage2', ['a-2020', 'sumido']), summary(2, 'placementChampion', ['a-2020'])], playerById)).toEqual([
      { majorNumber: 1, placement: 'placementStage2', champion: false, lineup: ['alpha', 'sumido'] },
      { majorNumber: 2, placement: 'placementChampion', champion: true, lineup: ['alpha'] }
    ]);
    expect(buildDynastyLineage([], playerById)).toEqual([]);
  });
});
```

Run: `npx vitest run tests/dynastyLineage.test.ts` → FAIL (`buildDynastyLineage` não exportado).

- [ ] **Step 2: `runCard.ts`**

Trocar o import de tipos por `import type { DynastyMajorSummary, MajorRun, Player } from './types';` e acrescentar ao fim:

```ts
export interface LineageEntry {
  majorNumber: number;
  placement: string;
  champion: boolean;
  lineup: string[];
}

/** One line per Dinastia Major for the share card: where the lineup finished and who played it. */
export function buildDynastyLineage(history: DynastyMajorSummary[], playerById: Map<string, Player>): LineageEntry[] {
  return history.map((item) => ({
    majorNumber: item.majorNumber,
    placement: item.placement,
    champion: item.placement === 'placementChampion',
    lineup: item.lineup.map((selected) => playerById.get(selected.playerId)?.nickname ?? selected.playerId)
  }));
}
```

- [ ] **Step 3: `ShareRunCard.svelte`**

No script, trocar o import de `runCard` por `import { buildOfflineRunCardReport, type LineageEntry, type RunCardReport } from '$lib/game/runCard';` e acrescentar depois de `export let seedLabel = 'SEED';`:

```ts
  export let lineage: LineageEntry[] = [];
  export let lineageLabel = 'LINEAGE';
  export let eraLabel: string | null = null;
```

No markup, logo depois do `</div>` que fecha `.share-lineup`:

```svelte
  {#if lineage.length}
    <div class="share-lineage">
      <small>{lineageLabel}{#if eraLabel} · {eraLabel}{/if}</small>
      {#each lineage.slice(-5) as entry (entry.majorNumber)}
        <p class:champion={entry.champion}><b>#{entry.majorNumber}</b><span>{translatePlacement(language, entry.placement)}</span><em>{entry.lineup.join(' · ')}</em></p>
      {/each}
    </div>
  {/if}
```

No `<style>`, trocar `header,.share-result,.share-lineup,footer{position:relative;z-index:1}` por `header,.share-result,.share-lineup,.share-lineage,footer{position:relative;z-index:1}` e acrescentar:

```css
  .share-lineage{display:grid;gap:4px;margin-top:10px;padding-top:10px;border-top:1px solid #283139}.share-lineage small{color:#89939a;font-size:.5rem;letter-spacing:.18em}.share-lineage p{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;margin:0;font-size:.62rem;align-items:baseline}.share-lineage p.champion b,.share-lineage p.champion span{color:#c8ff32}.share-lineage em{overflow:hidden;color:#89939a;text-overflow:ellipsis;white-space:nowrap;font-style:normal}
```

- [ ] **Step 4: Página**

Acrescentar `buildDynastyLineage` ao import de `$lib/game/runCard` (ou criar `import { buildDynastyLineage } from '$lib/game/runCard';` se não houver). No `<ShareRunCard ... />` do resultado, acrescentar:

```svelte
lineage={isDynasty && $game.dynasty ? buildDynastyLineage($game.dynasty.history, playerById) : []} lineageLabel={t('lineageTitle')} eraLabel={isDynasty && $game.dynasty && $game.dynasty.titles >= 2 ? `${t('dynastyEra')} ${t('yourOrg')}` : null}
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/dynastyLineage.test.ts tests/runCard.test.ts && npm run check`
Expected: testes passam; `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/runCard.ts src/lib/components/ShareRunCard.svelte src/routes/+page.svelte tests/dynastyLineage.test.ts
git commit -m "feat: card compartilhável mostra a linhagem e a era da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 7: Gate final e fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (sequência de entregas)

- [ ] **Step 1: Gate**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected: svelte-check `0 ERRORS 0 WARNINGS`; vitest com todos os arquivos passando (inclui `dynastyValue`, `dynastyEvolution`, `dynastyWindow`, `dynastyLineage`); build do front e do servidor; nenhuma linha de snapshot.

- [ ] **Step 2: Registrar na spec**

Na seção "Sequência de entregas", trocar o início do item 3 `3. **Dinastia C**:` por `3. **Dinastia C** (plano `docs/superpowers/plans/2026-09-14-dinastia-c-mercado-janela-evolucao.md`, implementada):`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-14-dinastia-design.md
git commit -m "docs: aponta o plano da Dinastia C na spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

- [ ] **Step 4: Relato**

Relatar: arquivos e commits, contagem de testes, que a verificação no navegador ficou pendente (se ficou), que a tela de stats da Dinastia ainda não passa pelo jogador resolvido (`RunStatsGrid` recebe `proAdjustedPlayers`, fora do escopo e tocado pela entrega D), e que nada foi enviado por push.

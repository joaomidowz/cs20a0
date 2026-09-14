# Dinastia · Revisão Fase 5: fila 2x2, dicas de tutorial e roleta do coach

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver três pontos do teste do usuário na Dinastia:
- a fila de modos corta os títulos;
- falta um tom de tutorial durante o jogo;
- o sorteio do coach não tem animação nem OVR em destaque.

**Architecture:**
- **Fila:** só CSS em `src/app.css`.
- **Dicas:** lógica pura em `src/lib/game/dynasty/tips.ts`, com o storage injetado. Um invólucro de `localStorage` em `src/lib/game/preferences.ts`. Um componente `DynastyTip.svelte` plugado nas telas da Dinastia.
- **Roleta:** a lógica de `DraftRoulette.svelte` vai para `Roulette.svelte`, que recebe entradas genéricas. `DraftRoulette.svelte` vira um invólucro com a mesma API.
- **Coach:** `CoachDraft.svelte` passa a rodar essa roleta e a revelar as ofertas com `DynastyCoachCard`.

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest.

## Global Constraints

- **Branch e commits.**
  - Branch `feat/dinastia`. Nunca fazer push de `main`.
  - Commits `feat: ...` em pt-BR, terminados com:
    `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
    `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
  - `git add` só com caminhos explícitos. Nunca incluir `.superpowers/` nem `docs/superpowers/plans/2026-09-14-offline-accounts-and-campaigns.md`.
- **Gate de cada tarefa.** `npm run check` com 0 erros e 0 avisos, mais `npx vitest run`. `git status --short tests/__snapshots__` precisa sair vazio. Nunca usar `-u`.
- **Outros modos.** Normal, Ranked e PRO não mudam de comportamento. A roleta do draft mantém API, classes, duração (2800 ms), timeout de segurança (3400 ms) e sons.
- **Aleatoriedade.** Só a parte decorativa usa `Math.random`. A oferta de coach continua vindo de `offerCoaches` com seed.
- **Visual.**
  - Mobile de 375 px sem scroll horizontal.
  - `prefers-reduced-motion` desliga animações.
  - Textos em pt-BR, en e es, no padrão de texto local por componente dos `Dynasty*`.
- **Sem navegador disponível.** Registrar isso no relato e rodar `npm run build`.

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/app.css` | Modificar | Fila 2x2, cards quadrados, títulos sem corte |
| `src/lib/game/dynasty/tips.ts` | Criar | Catálogo de dicas, `nextTip`, parse e serialização do estado |
| `src/lib/game/preferences.ts` | Modificar | `loadTipPreferences` / `saveTipPreferences` tolerantes a storage ausente |
| `tests/dynastyTips.test.ts` | Criar | Ordem, uma vez por contexto, desligar, JSON inválido e storage ausente |
| `src/lib/components/DynastyTip.svelte` | Criar | Faixa de dica com "Entendi" e "Desligar dicas" |
| `src/routes/+page.svelte` | Modificar | Estado das dicas e as seis faixas plugadas |
| `src/lib/components/Roulette.svelte` | Criar | Roleta genérica (WAAPI, som, pular, timeout, reduced-motion) |
| `src/lib/components/DraftRoulette.svelte` | Modificar | Invólucro de `Roulette` com a mesma API |
| `src/lib/components/CoachDraft.svelte` | Modificar | Roleta ao abrir e ao ressortear, revelação com `DynastyCoachCard` e flip |

Testes existentes que mudam: **nenhum**. `tests/offlinePresentation.test.ts` não importa a roleta. Nenhum teste importa `preferences.ts`; os `*preferences*` do online são de outro módulo.

---

### Task 1: Fila de modos 2x2 sem corte

**Files:**
- Modify: `src/app.css` (regras `.mode-card`, `.mode-number`, `.mode-card h2`, `.mode-card p` na linha ~118, bloco `@media (max-width:679px)` ~177 e a última linha `@media (min-width:1100px)` ~680)

**Interfaces:** nenhuma.

- [ ] **Step 1: Remover as 4 colunas**

Apagar a última linha de `src/app.css`:

```css
@media (min-width:1100px){.mode-grid{grid-template-columns:repeat(4,1fr)}}
```

As 2 colunas a partir de 680 px já existem (`.mode-grid{grid-template-columns:repeat(2,1fr)}` no bloco `min-width:680px`).

- [ ] **Step 2: Card quadrado e título elástico**

Em `src/app.css` fazer três trocas.

Trocar `.mode-card{position:relative;min-height:340px;padding:34px;` por:

```css
.mode-card{position:relative;display:flex;flex-direction:column;aspect-ratio:1/1;min-height:0;min-width:0;padding:28px;
```

Trocar `.mode-number{position:absolute;right:20px;top:16px;color:var(--line);font-family:'Arial Narrow',Impact,sans-serif;font-size:4rem;font-weight:900}` por:

```css
.mode-number{position:absolute;right:18px;top:12px;z-index:0;color:var(--line);font-family:'Arial Narrow',Impact,sans-serif;font-size:2.6rem;font-weight:900;pointer-events:none}
```

Trocar `.mode-card h2{margin-bottom:12px;font-size:2.8rem}` e `.mode-card p{max-width:330px;min-height:72px;color:var(--muted);line-height:1.55}` por:

```css
.mode-card h2{position:relative;z-index:1;margin-bottom:10px;font-size:clamp(1.6rem,2.6vw,2.1rem);line-height:1;overflow-wrap:anywhere}
.mode-card p{position:relative;z-index:1;max-width:none;margin:0 0 auto;color:var(--muted);font-size:.86rem;line-height:1.5}
.mode-card b{margin-top:14px}
```

Por último, no bloco `min-width:680px`, remover a regra `.mode-icon{margin-bottom:24px}` apenas se ela estiver junto do `.mode-card{min-height:260px;padding:24px}`. Não mexer em nenhuma outra regra desse bloco.

- [ ] **Step 3: Mobile em 1 coluna, sem forçar quadrado**

No bloco `@media (max-width:679px){...}` (linha ~177), acrescentar ao final, antes do `}` que fecha o bloco:

```css
.mode-card{aspect-ratio:auto;min-height:220px;padding:22px}.mode-icon{width:56px;height:56px;margin-bottom:18px;font-size:1.6rem}
```

A base (`.mode-grid { display: grid; gap: 14px; }`) já é de 1 coluna.

- [ ] **Step 4: Verificar**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS` e `✔ done`.

Conferência por leitura (sem navegador):
- em 1280 px, a tela `.narrow` tem 860 px, ou seja 2 colunas de 420 px, e o `h2` fica em no máximo 2.1rem;
- em 375 px, 1 coluna;
- nenhum `overflow:hidden` corta o título, porque o `h2` quebra com `overflow-wrap:anywhere`.

- [ ] **Step 5: Commit**

```bash
git add src/app.css
git commit -m "feat: fila de modos em 2x2 com cards quadrados e títulos sem corte

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Lógica e persistência das dicas

**Files:**
- Create: `src/lib/game/dynasty/tips.ts`
- Modify: `src/lib/game/preferences.ts` (acrescentar ao final)
- Test: `tests/dynastyTips.test.ts`

**Interfaces:**
- Produces:
  - `TipContext = 'identity' | 'series-plan' | 'team-tab' | 'training' | 'window' | 'swap'`
  - `interface DynastyTip { id: string; context: TipContext }`
  - `DYNASTY_TIPS: readonly DynastyTip[]`
  - `interface TipState { seen: string[]; disabled: boolean }`
  - `DEFAULT_TIP_STATE`
  - `nextTip(context, state): DynastyTip | null`
  - `markTipSeen(state, id): TipState`
  - `disableTips(state): TipState`
  - `parseTipState(raw: string | null): TipState`
  - `serializeTipState(state): string`
- Em `preferences.ts`:
  - `TIP_STORAGE_KEY = 'cs13a0-dynasty-tips-v1'`
  - `loadTipPreferences(storage?: Pick<Storage, 'getItem'> | null): TipState`
  - `saveTipPreferences(state, storage?: Pick<Storage, 'setItem'> | null): void`

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyTips.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIP_STATE, DYNASTY_TIPS, disableTips, markTipSeen, nextTip, parseTipState, serializeTipState } from '../src/lib/game/dynasty/tips';
import { TIP_STORAGE_KEY, loadTipPreferences, saveTipPreferences } from '../src/lib/game/preferences';

describe('dicas da Dinastia', () => {
  it('tem exatamente uma dica por contexto, na ordem do fluxo', () => {
    expect(DYNASTY_TIPS.map((tip) => tip.context)).toEqual(['identity', 'series-plan', 'team-tab', 'training', 'window', 'swap']);
    expect(new Set(DYNASTY_TIPS.map((tip) => tip.id)).size).toBe(DYNASTY_TIPS.length);
  });

  it('mostra a dica do contexto até ser vista, e depois nunca mais', () => {
    const tip = nextTip('identity', DEFAULT_TIP_STATE);
    expect(tip?.context).toBe('identity');
    const seen = markTipSeen(DEFAULT_TIP_STATE, tip!.id);
    expect(nextTip('identity', seen)).toBeNull();
    expect(nextTip('window', seen)?.context).toBe('window');
    expect(markTipSeen(seen, tip!.id)).toEqual(seen);
  });

  it('desligar esconde todas as dicas', () => {
    const off = disableTips(DEFAULT_TIP_STATE);
    for (const tip of DYNASTY_TIPS) expect(nextTip(tip.context, off)).toBeNull();
  });

  it('JSON inválido ou com formato errado volta ao padrão', () => {
    expect(parseTipState(null)).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{quebrado')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('[1,2]')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{"seen":"x","disabled":"sim"}')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{"seen":["tip-identity",3,"inexistente"],"disabled":true}')).toEqual({ seen: ['tip-identity'], disabled: true });
  });

  it('serializa e relê o mesmo estado', () => {
    const state = markTipSeen(disableTips(DEFAULT_TIP_STATE), 'tip-window');
    expect(parseTipState(serializeTipState(state))).toEqual(state);
  });

  it('preferências não quebram sem localStorage ou com storage que lança erro', () => {
    expect(loadTipPreferences(null)).toEqual(DEFAULT_TIP_STATE);
    expect(() => saveTipPreferences(DEFAULT_TIP_STATE, null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(loadTipPreferences(broken)).toEqual(DEFAULT_TIP_STATE);
    expect(() => saveTipPreferences(DEFAULT_TIP_STATE, broken)).not.toThrow();
  });

  it('grava e lê pela chave v1', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    saveTipPreferences(markTipSeen(DEFAULT_TIP_STATE, 'tip-swap'), storage);
    expect(memory.has(TIP_STORAGE_KEY)).toBe(true);
    expect(loadTipPreferences(storage)).toEqual({ seen: ['tip-swap'], disabled: false });
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run tests/dynastyTips.test.ts`
Expected: FAIL com `Cannot find module '../src/lib/game/dynasty/tips'`.

- [ ] **Step 3: Implementar `tips.ts`**

```ts
// src/lib/game/dynasty/tips.ts
export type TipContext = 'identity' | 'series-plan' | 'team-tab' | 'training' | 'window' | 'swap';

export interface DynastyTip {
  id: string;
  context: TipContext;
}

/** One tip per screen of the Dinastia, in the order the player meets them. The texts live in DynastyTip.svelte. */
export const DYNASTY_TIPS: readonly DynastyTip[] = [
  { id: 'tip-identity', context: 'identity' },
  { id: 'tip-series-plan', context: 'series-plan' },
  { id: 'tip-team-tab', context: 'team-tab' },
  { id: 'tip-training', context: 'training' },
  { id: 'tip-window', context: 'window' },
  { id: 'tip-swap', context: 'swap' }
];

export interface TipState {
  seen: string[];
  disabled: boolean;
}

export const DEFAULT_TIP_STATE: TipState = { seen: [], disabled: false };

const KNOWN_IDS = new Set(DYNASTY_TIPS.map((tip) => tip.id));

export function nextTip(context: TipContext, state: TipState): DynastyTip | null {
  if (state.disabled) return null;
  return DYNASTY_TIPS.find((tip) => tip.context === context && !state.seen.includes(tip.id)) ?? null;
}

export const markTipSeen = (state: TipState, id: string): TipState =>
  state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] };

export const disableTips = (state: TipState): TipState => ({ ...state, disabled: true });

export function parseTipState(raw: string | null): TipState {
  if (!raw) return DEFAULT_TIP_STATE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_TIP_STATE;
    const { seen, disabled } = value as { seen?: unknown; disabled?: unknown };
    if (!Array.isArray(seen) || typeof disabled !== 'boolean') return DEFAULT_TIP_STATE;
    return { seen: seen.filter((id): id is string => typeof id === 'string' && KNOWN_IDS.has(id)), disabled };
  } catch {
    return DEFAULT_TIP_STATE;
  }
}

export const serializeTipState = (state: TipState): string => JSON.stringify({ seen: state.seen, disabled: state.disabled });
```

- [ ] **Step 4: Persistência em `preferences.ts`**

Acrescentar ao final de `src/lib/game/preferences.ts`:

```ts
import { DEFAULT_TIP_STATE, parseTipState, serializeTipState, type TipState } from './dynasty/tips';

export const TIP_STORAGE_KEY = 'cs13a0-dynasty-tips-v1';

const browserStorage = (): Storage | null => {
  try {
    return browser ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Dicas vistas da Dinastia. Storage ausente, bloqueado ou corrompido nunca quebra o jogo. */
export function loadTipPreferences(storage: Pick<Storage, 'getItem'> | null = browserStorage()): TipState {
  if (!storage) return DEFAULT_TIP_STATE;
  try {
    return parseTipState(storage.getItem(TIP_STORAGE_KEY));
  } catch {
    return DEFAULT_TIP_STATE;
  }
}

export function saveTipPreferences(state: TipState, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TIP_STORAGE_KEY, serializeTipState(state));
  } catch {
    /* storage cheio ou bloqueado: a dica só volta a aparecer na próxima sessão */
  }
}
```

O `import` fica no meio do arquivo por causa do acréscimo. Se o check reclamar, mover a linha do `import` para o topo, junto de `import { browser } from '$app/environment';`.

- [ ] **Step 5: Ver passar**

Run: `npx vitest run tests/dynastyTips.test.ts && npm run check`
Expected: `Tests 7 passed (7)` e `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/dynasty/tips.ts src/lib/game/preferences.ts tests/dynastyTips.test.ts
git commit -m "feat: lógica e persistência das dicas de tutorial da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Faixa de dica nas telas da Dinastia

**Files:**
- Create: `src/lib/components/DynastyTip.svelte`
- Modify: `src/routes/+page.svelte` (imports, estado das dicas e as seis faixas)

**Interfaces:**
- Consumes: `nextTip`, `markTipSeen`, `disableTips`, `DEFAULT_TIP_STATE`, `TipContext` e `TipState` (Task 2); `loadTipPreferences` e `saveTipPreferences` (Task 2).
- Produces: `DynastyTip.svelte` com as props `tip: DynastyTip`, `language: Language`, `onDismiss: () => void` e `onDisable: () => void`.

- [ ] **Step 1: Componente**

```svelte
<!-- src/lib/components/DynastyTip.svelte -->
<script lang="ts">
  import type { DynastyTip } from '$lib/game/dynasty/tips';
  import type { Language } from '$lib/game/types';

  export let tip: DynastyTip;
  export let language: Language = 'pt-BR';
  export let onDismiss: () => void = () => {};
  export let onDisable: () => void = () => {};

  const copy = {
    'pt-BR': {
      label: 'Dica', ok: 'Entendi', off: 'Desligar dicas',
      'tip-identity': 'Primeiro escolha o estilo, depois contrate o coach. O coach pesa na força e na tática de cada série.',
      'tip-series-plan': 'Antes de cada série, ajuste estilo e tática. Estudar o adversário dá força extra, mas o saldo de estudos é curto.',
      'tip-team-tab': 'A aba Time mostra o poder efetivo: elenco, coach, plano da série e treino já somados.',
      'tip-training': 'O treino vale para todo o Major. Quem joga 3 mapas ou mais ganha +1 permanente no atributo treinado.',
      'tip-window': 'Na janela você vende, compra e troca o coach. Jogador fora de posição não bloqueia, só custa 1,5% de força.',
      'tip-swap': 'Troca direta entrega um jogador seu por um deles, com diferença em dinheiro. Conta como uma troca.'
    },
    es: {
      label: 'Consejo', ok: 'Entendido', off: 'Desactivar consejos',
      'tip-identity': 'Primero elige el estilo y luego contrata al coach. El coach influye en la fuerza y la táctica de cada serie.',
      'tip-series-plan': 'Antes de cada serie, ajusta estilo y táctica. Estudiar al rival da fuerza extra, pero hay pocos estudios.',
      'tip-team-tab': 'La pestaña Equipo muestra el poder efectivo: plantilla, coach, plan de la serie y entrenamiento sumados.',
      'tip-training': 'El entrenamiento dura todo el Major. Quien juega 3 mapas o más gana +1 permanente en el atributo entrenado.',
      'tip-window': 'En la ventana vendes, compras y cambias de coach. Un jugador fuera de posición no bloquea, solo cuesta 1,5% de fuerza.',
      'tip-swap': 'El intercambio directo da un jugador tuyo por uno de ellos, con diferencia en dinero. Cuenta como un movimiento.'
    },
    en: {
      label: 'Tip', ok: 'Got it', off: 'Turn off tips',
      'tip-identity': 'Pick the style first, then hire the coach. The coach shapes strength and tactics in every series.',
      'tip-series-plan': 'Before each series, set style and tactic. Studying the opponent adds strength, but studies are limited.',
      'tip-team-tab': 'The Team tab shows effective power: roster, coach, series plan and training combined.',
      'tip-training': 'Training lasts the whole Major. Players with 3+ maps get a permanent +1 in the trained attribute.',
      'tip-window': 'In the window you sell, buy and swap the coach. An off-role player does not block, it only costs 1.5% strength.',
      'tip-swap': 'A direct swap trades one of your players for one of theirs, with a cash difference. It counts as one move.'
    }
  } as const;

  $: c = copy[language];
  $: text = c[tip.id as keyof typeof c] ?? '';
</script>

<aside class="dynasty-tip" aria-live="polite">
  <span class="label">{c.label}</span>
  <p>{text}</p>
  <div class="actions">
    <button type="button" class="ok" on:click={onDismiss}>{c.ok}</button>
    <button type="button" class="off" on:click={onDisable}>{c.off}</button>
  </div>
</aside>

<style>
  .dynasty-tip { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px 14px; align-items: center; margin: 0 0 14px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); min-width: 0; }
  .label { color: var(--accent); font: 800 .62rem/1 Inter, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; }
  p { margin: 0; color: var(--text); font-size: .82rem; line-height: 1.45; overflow-wrap: anywhere; }
  .actions { display: flex; gap: 6px; }
  button { min-height: 32px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  button.ok { border-color: var(--accent); color: var(--accent); }
  button:hover { color: var(--text); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 560px) { .dynasty-tip { grid-template-columns: minmax(0, 1fr); } .actions { justify-content: flex-end; } }
</style>
```

- [ ] **Step 2: Estado na página**

Em `src/routes/+page.svelte`, acrescentar três imports às listas existentes, sem duplicar:
- `import DynastyTip from '$lib/components/DynastyTip.svelte';`
- `import { DEFAULT_TIP_STATE, disableTips, markTipSeen, nextTip, type TipContext, type TipState } from '$lib/game/dynasty/tips';`
- `loadTipPreferences` e `saveTipPreferences` na lista vinda de `$lib/game/preferences`.

Logo depois de `let majorTab: 'current' | 'all' | 'team' = 'current';`:

```ts
  let tipState: TipState = DEFAULT_TIP_STATE;
  const tipFor = (context: TipContext, state: TipState) => (isDynasty ? nextTip(context, state) : null);
  function dismissTip(id: string) {
    tipState = markTipSeen(tipState, id);
    saveTipPreferences(tipState);
  }
  function turnOffTips() {
    tipState = disableTips(tipState);
    saveTipPreferences(tipState);
  }
```

No `onMount` que carrega as preferências estratégicas (onde está `strategicPreferences = loadStrategicPreferences();`), acrescentar na linha seguinte:

```ts
    tipState = loadTipPreferences();
```

- [ ] **Step 3: Plugar as seis faixas**

Todas as faixas usam o mesmo padrão:

```svelte
{#if tipFor('CONTEXTO', tipState)}{@const tip = tipFor('CONTEXTO', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
```

Pontos de inserção:

1. **`identity`:** no bloco `{:else if $game.phase === 'coach-draft'}`, logo depois do `</header>` da `screen-header`.
2. **`training`:** no bloco `map-selection`, logo antes de `<DynastyTraining ... />`, dentro do mesmo `{#if isDynasty && ...}`.
3. **`team-tab`:** dentro de `<div hidden={majorTab !== 'team'}>`, antes de `<DynastyTeamPanel ... />`.
4. **`series-plan`:** logo antes de `<DynastySeriesPlan ... />`.
5. **`window`:** no bloco `{:else if $game.phase === 'window' && $game.dynasty?.window}`, antes de `<DynastyWindow ... />`.
6. **`swap`:** também antes de `<DynastyWindow ... />`, depois da faixa `window`, mas só quando a janela tem trocas diretas:

```svelte
{#if ($game.dynasty.window.swapOffers?.length ?? 0) > 0 && !tipFor('window', tipState) && tipFor('swap', tipState)}{@const tip = tipFor('swap', tipState)}<DynastyTip tip={tip!} language={$game.language} onDismiss={() => dismissTip(tip!.id)} onDisable={turnOffTips} />{/if}
```

Assim aparece uma faixa por vez na janela.

Se o `svelte-check` recusar `{@const}` dentro de `{#if}` na posição usada, trocar pela forma sem `@const`, repetindo a chamada:

```svelte
<DynastyTip tip={tipFor('CONTEXTO', tipState)!} ... onDismiss={() => dismissTip(tipFor('CONTEXTO', tipState)!.id)} ... />
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npm run check && npm run build`
Expected:
- suíte verde, com o total da Task 2 somando 7 testes;
- `0 ERRORS 0 WARNINGS`;
- `✔ done`;
- `git status --short tests/__snapshots__` vazio.

Conferência por leitura: `tipFor` devolve `null` fora da Dinastia, então Normal, Ranked e PRO não renderizam nenhuma faixa.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DynastyTip.svelte src/routes/+page.svelte
git commit -m "feat: dicas de tutorial nas telas da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Roleta genérica e `DraftRoulette` como invólucro

**Files:**
- Create: `src/lib/components/Roulette.svelte`
- Modify: `src/lib/components/DraftRoulette.svelte` (reescrever como invólucro)

**Interfaces:**
- Produces:
  - `export interface RouletteEntry { id: string; avatar: string; title: string; subtitle: string }`, exportado de um bloco `<script context="module">` em `Roulette.svelte`.
  - `Roulette` com as props `entries: RouletteEntry[]` (candidatos decorativos), `result: RouletteEntry`, `anonymous = false`, `labels: { spinning: string; skip: string; hidden: string }` e `onComplete: () => void`.
- `DraftRoulette` mantém exatamente `candidates: HistoricalTeam[]`, `result: HistoricalTeam`, `anonymous`, `language` e `onComplete`.

- [ ] **Step 1: `Roulette.svelte`**

Mesmo corpo de hoje, com três diferenças: as entradas são genéricas, os textos chegam por `labels` e os candidatos decorativos saem de `entries`.

```svelte
<!-- src/lib/components/Roulette.svelte -->
<script context="module" lang="ts">
  export interface RouletteEntry {
    id: string;
    avatar: string;
    title: string;
    subtitle: string;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { playOfflineSound } from '$lib/game/offlineAudio';

  export let entries: RouletteEntry[];
  export let result: RouletteEntry;
  export let anonymous = false;
  export let labels: { spinning: string; skip: string; hidden: string };
  export let onComplete: () => void;

  let track: HTMLDivElement;
  let animation: Animation | undefined;
  let completed = false;
  let settled = false;
  let frame = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const winnerIndex = 32;
  // Decorative randomness never touches the game's seeded generator.
  const tickets = Array.from({ length: 36 }, (_, index) =>
    index === winnerIndex ? result : entries[Math.floor(Math.random() * entries.length)] ?? result
  );

  function finish() {
    if (completed) return;
    completed = true;
    cancelAnimationFrame(frame);
    clearTimeout(settleTimer);
    if (!settled) playOfflineSound('land');
    animation?.cancel();
    onComplete();
  }

  onMount(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) {
      finish();
      return;
    }
    animation = track.animate(
      [{ transform: 'translateX(-80px)' }, { transform: `translateX(-${winnerIndex * 172 + 80}px)` }],
      { duration: 2800, easing: 'cubic-bezier(0.12, 0.7, 0.12, 1)', fill: 'forwards' }
    );
    animation.onfinish = () => {
      settled = true;
      cancelAnimationFrame(frame);
      playOfflineSound('land');
      settleTimer = setTimeout(finish, 320);
    };
    let lastIndex = 0;
    const followMarker = () => {
      const progress = Number(animation?.effect?.getComputedTiming().progress ?? 0);
      const index = Math.round(progress * winnerIndex);
      if (index !== lastIndex) { lastIndex = index; playOfflineSound('tick'); }
      if (!completed && !settled) frame = requestAnimationFrame(followMarker);
    };
    frame = requestAnimationFrame(followMarker);
    // Background tabs must not leave the screen locked awaiting an animation event.
    const timer = window.setTimeout(finish, 3400);
    const reduce = () => { if (preference.matches) finish(); };
    preference.addEventListener('change', reduce);
    return () => {
      completed = true;
      animation?.cancel();
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      window.clearTimeout(timer);
      preference.removeEventListener('change', reduce);
    };
  });
</script>

<div class="roulette" class:settled aria-busy={!settled}>
  <div class="viewport" aria-hidden="true">
    <div class="marker"></div>
    <div class="track" bind:this={track}>
      {#each tickets as entry, index}
        <div class="ticket" class:winner={settled && index === winnerIndex}>
          <span class="avatar">{anonymous ? '?' : entry.avatar}</span>
          <strong>{anonymous ? labels.hidden : entry.title}</strong>
          <small>{anonymous ? '••••' : entry.subtitle}</small>
        </div>
      {/each}
    </div>
  </div>
  <div class="controls"><span role="status">{labels.spinning}</span><button class="ghost" type="button" on:click={finish}>{labels.skip}</button></div>
</div>
```

Depois da marcação, copiar o bloco `<style>` atual de `DraftRoulette.svelte` sem nenhuma alteração. É ele que garante as mesmas classes, tamanhos e `mask-image`.

- [ ] **Step 2: `DraftRoulette.svelte` como invólucro**

Substituir o arquivo inteiro por:

```svelte
<!-- src/lib/components/DraftRoulette.svelte -->
<script lang="ts">
  import Roulette, { type RouletteEntry } from './Roulette.svelte';
  import type { HistoricalTeam, Language } from '$lib/game/types';

  export let candidates: HistoricalTeam[];
  export let result: HistoricalTeam;
  export let anonymous = false;
  export let language: Language = 'en';
  export let onComplete: () => void;

  const toEntry = (team: HistoricalTeam): RouletteEntry => ({
    id: team.id,
    avatar: (team.name ?? 'T').slice(0, 2).toUpperCase(),
    title: team.name ?? 'Team',
    subtitle: team.year ? String(team.year) : ''
  });

  const entries = candidates.map(toEntry);
  const winner = toEntry(result);
  $: labels = language === 'pt-BR'
    ? { spinning: 'Sorteando time…', skip: 'Pular animação', hidden: 'Oferta oculta' }
    : language === 'es'
      ? { spinning: 'Sorteando equipo…', skip: 'Saltar animación', hidden: 'Oferta oculta' }
      : { spinning: 'Drawing team…', skip: 'Skip animation', hidden: 'Hidden offer' };
</script>

<Roulette {entries} result={winner} {anonymous} {labels} {onComplete} />
```

Nenhum `<style>` no invólucro. O `subtitle` vazio para ano ausente reproduz o `team.year ?? ''` de hoje.

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npm run check && npm run build`
Expected:
- suíte verde;
- `0 ERRORS 0 WARNINGS`;
- `✔ done`;
- snapshot intacto.

Conferência por leitura:
- a chamada em `+page.svelte` (`<DraftRoulette candidates=... result=... anonymous=... language=... onComplete=... />`) compila sem mudar;
- duração 2800 ms, timeout 3400 ms, `winnerIndex` 32 e passo de 172 px iguais aos de hoje.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Roulette.svelte src/lib/components/DraftRoulette.svelte
git commit -m "feat: roleta genérica reaproveitada pelo sorteio de times

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Coach com roleta e revelação em cartas

**Files:**
- Modify: `src/lib/components/CoachDraft.svelte` (reescrever)
- Modify: `src/routes/+page.svelte` (passar `candidates={coaches}` ao `<CoachDraft>`)

**Interfaces:**
- Consumes: `Roulette` e `RouletteEntry` (Task 4); `DynastyCoachCard` (props `coach`, `teamLabel`, `language`, `selected`, `onOpen`, slot no rodapé); `isDraftableCoach` de `$lib/game/dynasty/coach`.
- Produces: `CoachDraft` com as props atuais (`offer`, `language`, `rerollsLeft`, `teamLabel`, `onPick`, `onReroll`) e mais `candidates: Coach[] = []`.

- [ ] **Step 1: Reescrever `CoachDraft.svelte`**

```svelte
<!-- src/lib/components/CoachDraft.svelte -->
<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import { isDraftableCoach } from '$lib/game/dynasty/coach';
  import type { Coach, Language } from '$lib/game/types';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import Roulette, { type RouletteEntry } from './Roulette.svelte';

  export let offer: Coach[] = [];
  export let candidates: Coach[] = [];
  export let language: Language = 'pt-BR';
  export let rerollsLeft = 0;
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onPick: (coach: Coach) => void = () => {};
  export let onReroll: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: labels = language === 'pt-BR'
    ? { spinning: 'Sorteando coaches…', skip: 'Pular animação', hidden: 'Coach' }
    : language === 'es'
      ? { spinning: 'Sorteando coaches…', skip: 'Saltar animación', hidden: 'Coach' }
      : { spinning: 'Drawing coaches…', skip: 'Skip animation', hidden: 'Coach' };

  const toEntry = (coach: Coach): RouletteEntry => ({
    id: coach.id,
    avatar: String(coach.overall),
    title: coach.name,
    subtitle: teamLabel(coach.teamId)
  });

  // The offer is seeded (offerCoaches). Only the reel is decorative; a new offer (open or reroll) spins again.
  $: offerKey = offer.map((coach) => coach.id).join('|');
  let spunKey = '';
  let spinning = false;
  let revealed = false;
  $: if (offerKey && offerKey !== spunKey) {
    spunKey = offerKey;
    spinning = true;
    revealed = false;
  }
  $: reel = (candidates.length ? candidates.filter(isDraftableCoach) : offer).map(toEntry);

  function spinDone() {
    spinning = false;
    revealed = true;
  }
</script>

<section class="coach-draft">
  {#if spinning && offer[0]}
    {#key spunKey}
      <Roulette entries={reel} result={toEntry(offer[0])} {labels} onComplete={spinDone} />
    {/key}
  {:else}
    <div class="coach-grid" class:revealed>
      {#each offer as coach, index (coach.id)}
        <div class="coach-slot" style={`--reveal-delay:${index * 90}ms`}>
          <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language}>
            {#if coach.needsReview}<small class="coach-review">{t('coachNeedsReview')}</small>{/if}
            <button class="primary pick" type="button" on:click={() => onPick(coach)}>{t('coachPick')}</button>
          </DynastyCoachCard>
        </div>
      {/each}
    </div>
    <button class="secondary" type="button" disabled={rerollsLeft <= 0} on:click={onReroll}>{t('coachReroll')} ({rerollsLeft})</button>
  {/if}
</section>

<style>
  .coach-draft { display: grid; gap: 16px; justify-items: start; min-width: 0; }
  .coach-grid { display: grid; gap: 14px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); perspective: 1100px; }
  .coach-slot { min-width: 0; }
  .coach-grid.revealed .coach-slot { animation: coach-flip 460ms cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: var(--reveal-delay, 0ms); transform-style: preserve-3d; -webkit-backface-visibility: hidden; backface-visibility: hidden; }
  @keyframes coach-flip { from { transform: rotateY(90deg); opacity: .2; } to { transform: rotateY(0); opacity: 1; } }
  .pick { width: 100%; min-height: 40px; }
  .coach-review { flex-basis: 100%; color: var(--accent-2); font-size: .68rem; }
  @media (prefers-reduced-motion: reduce) { .coach-grid.revealed .coach-slot { animation: none; } }
</style>
```

- [ ] **Step 2: Passar os candidatos na página**

Em `src/routes/+page.svelte`, no bloco `coach-draft`, acrescentar ao `<CoachDraft ... />` a prop `candidates={coaches}`. `coaches` já é importado de `$lib/game/data`; se não for, acrescentar à lista existente sem duplicar.

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npm run check && npm run build`
Expected:
- suíte verde;
- `0 ERRORS 0 WARNINGS`;
- `✔ done`;
- snapshot intacto.

Conferência por leitura:
- a oferta continua sendo `coachOffer` (seeded), porque a roleta só decora;
- ressortear muda `offerKey` e a roleta roda de novo;
- com reduced-motion, `Roulette` chama `onComplete` na montagem e as cartas aparecem sem flip;
- em 375 px, `minmax(min(100%, 240px), 1fr)` não estoura.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/CoachDraft.svelte src/routes/+page.svelte
git commit -m "feat: sorteio do coach com roleta e revelação em cartas com OVR

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 6: Gate final e push

**Files:** nenhum novo.

- [ ] **Step 1: Gate completo**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected:
- svelte-check `0 ERRORS 0 WARNINGS`;
- vitest com todos os arquivos passando, incluindo `dynastyTips`;
- build do front e do servidor;
- nenhuma linha de snapshot.

- [ ] **Step 2: Push do branch**

Run: `git push origin feat/dinastia`
Expected: `feat/dinastia -> feat/dinastia`. `git ls-remote --heads origin main` continua em `c073ac5`.

- [ ] **Step 3: Relato**

Listar:
- os commits da fase;
- as contagens do gate;
- que não houve verificação em navegador;
- o roteiro de teste manual:
  1. fila 2x2 em 1280 px e 375 px;
  2. roleta do draft Normal igual;
  3. roleta do coach ao abrir e ao ressortear, com o botão pular;
  4. cartas de coach com OVR;
  5. dicas aparecem uma vez e "Desligar dicas" some com todas;
  6. reduced-motion sem animação.

---

## Autorrevisão

- **Cobertura da seção Fase 5.**
  - Fila: Task 1.
  - `tips.ts` e `nextTip`: Task 2.
  - Persistência com chave v1 e tolerância a storage ausente: Task 2.
  - `DynastyTip` com `aria-live`, "Entendi" e desligar: Task 3.
  - Seis contextos plugados: Task 3.
  - `Roulette` genérica e `DraftRoulette` com a mesma API: Task 4.
  - `CoachDraft` com roleta e `DynastyCoachCard`: Task 5.
  - Testes: Task 2. Gate e push: Task 6.
  - O contexto `circuit` fica para a Fase 6 e não entra no tipo agora.
- **Placeholders.** Nenhum. O padrão `CONTEXTO` da Task 3 é substituído literalmente por cada um dos seis contextos listados.
- **Tipos consistentes.**
  - `TipState`, `TipContext` e `DynastyTip` são os mesmos nas Tasks 2 e 3.
  - `RouletteEntry` é o mesmo nas Tasks 4 e 5.
  - `CoachDraft` preserva as props usadas pela página.

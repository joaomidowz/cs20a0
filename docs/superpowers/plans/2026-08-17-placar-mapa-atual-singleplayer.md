# Placar do mapa atual no singleplayer - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o placar de rounds do mapa atual desde `0 : 0` no singleplayer, preservando o mesmo visual no multiplayer e localizando o indicador ao vivo.

**Architecture:** Centralizar a escolha do placar visível em uma função pura de apresentação usada pelo `SeriesViewer`. O componente compartilhado recebe o texto localizado de transmissão ao vivo, sem alterar simulação, servidor ou protocolo online.

**Tech Stack:** Svelte 5, TypeScript 5.9, Vitest 4, SvelteKit 2 e Vercel.

## Global Constraints

- O placar inicial do mapa em andamento deve ser exatamente `0 : 0`.
- O placar deve acompanhar apenas os rounds já visíveis e usar o resultado final quando o mapa terminar.
- O indicador deve ser `Ao vivo` em PT-BR, `Live` em inglês e `En vivo` em espanhol.
- Não alterar simulação, resultados, protocolo online ou servidor de salas.
- Preservar uma única implementação visual compartilhada entre singleplayer e multiplayer.

---

### Task 1: Restaurar o placar ao vivo compartilhado

**Files:**
- Create: `src/lib/game/seriesPresentation.ts`
- Create: `tests/seriesPresentation.test.ts`
- Modify: `src/lib/components/SeriesViewer.svelte:1-200`
- Modify: `src/lib/game/i18n.ts:1-430`
- Modify: `src/routes/+page.svelte:755-765`
- Modify: `src/routes/online/+page.svelte:475-487`

**Interfaces:**
- Consumes: `MapResult` e `RoundScore` de `src/lib/game/types.ts`.
- Produces: `getVisibleMapScore(map, round, state): VisibleMapScore | null`, em que `state` contém `isComplete` e `isLive`.
- Produces: propriedade obrigatória `labels.live: string` no `SeriesViewer`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/seriesPresentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { translate } from '../src/lib/game/i18n';
import { translateOnline } from '../src/lib/game/online/i18n';
import { getVisibleMapScore } from '../src/lib/game/seriesPresentation';
import type { MapResult, RoundScore } from '../src/lib/game/types';

const map: MapResult = {
  map: 1,
  scoreA: 13,
  scoreB: 9,
  winnerId: 'team-a',
  rounds: [],
  overtime: false
};

describe('series presentation', () => {
  it('keeps a map pending before the series starts', () => {
    expect(getVisibleMapScore(map, null, { isComplete: false, isLive: false })).toBeNull();
  });

  it('starts a live map at zero to zero', () => {
    expect(getVisibleMapScore(map, null, { isComplete: false, isLive: true })).toEqual({ a: 0, b: 0 });
  });

  it('shows the latest visible round during the map', () => {
    const round: RoundScore = { a: 7, b: 6, overtime: false };
    expect(getVisibleMapScore(map, round, { isComplete: false, isLive: true })).toEqual({ a: 7, b: 6 });
  });

  it('uses the final map score after completion', () => {
    expect(getVisibleMapScore(map, null, { isComplete: true, isLive: false })).toEqual({ a: 13, b: 9 });
  });

  it('localizes the live indicator in both game modes', () => {
    expect([translate('pt-BR', 'live'), translate('en', 'live'), translate('es', 'live')])
      .toEqual(['Ao vivo', 'Live', 'En vivo']);
    expect([translateOnline('pt-BR', 'live'), translateOnline('en', 'live'), translateOnline('es', 'live')])
      .toEqual(['Ao vivo', 'Live', 'En vivo']);
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `npx vitest run tests/seriesPresentation.test.ts`

Expected: FAIL porque `src/lib/game/seriesPresentation.ts` ainda não existe e `live` ainda não pertence a `TranslationKey`.

- [ ] **Step 3: Criar a regra pura do placar visível**

Criar `src/lib/game/seriesPresentation.ts`:

```ts
import type { MapResult, RoundScore } from './types';

export interface VisibleMapScore {
  a: number;
  b: number;
}

export function getVisibleMapScore(
  map: MapResult,
  round: RoundScore | null,
  state: { isComplete: boolean; isLive: boolean }
): VisibleMapScore | null {
  if (state.isComplete) return { a: map.scoreA, b: map.scoreB };
  if (round) return { a: round.a, b: round.b };
  if (state.isLive) return { a: 0, b: 0 };
  return null;
}
```

- [ ] **Step 4: Integrar a regra e o texto localizado ao `SeriesViewer`**

Importar a função:

```ts
import { getVisibleMapScore } from '$lib/game/seriesPresentation';
```

Adicionar `live: string` ao tipo de `labels`. Substituir os dois textos fixos `Live` por `{labels.live}`. Dentro do loop de mapas, calcular:

```svelte
{@const visibleMapScore = getVisibleMapScore(map, liveRound, {
  isComplete: isPast || currentMapFinished,
  isLive: index === displayActiveMap && displayStarted
})}
```

Renderizar o placar quando ele existir:

```svelte
{#if visibleMapScore}
  <div class="map-score">
    <b>{visibleMapScore.a}</b>
    <span>:</span>
    <b>{visibleMapScore.b}</b>
  </div>
{:else}
  <span class="map-pending">{labels.pending ?? 'A disputar'}</span>
{/if}
```

- [ ] **Step 5: Adicionar e conectar as traduções**

Adicionar ao dicionário base PT-BR em `src/lib/game/i18n.ts`:

```ts
,live: 'Ao vivo'
```

Adicionar aos respectivos `Object.assign`:

```ts
live: 'En vivo'
```

```ts
live: 'Live'
```

Na página singleplayer, passar:

```svelte
labels={{ start: t('startSeries'), skip: t('skipMap'), round: t('round'), live: t('live'), map: t('map'), final: t('final'), waiting: t('waiting'), pending: t('pending'), inProgress: t('inProgress'), mapInProgress: t('mapInProgress') }}
```

Na página multiplayer, passar:

```svelte
labels={{ start: gameT('startSeries'), skip: gameT('skipMap'), round: gameT('round'), live: t('live'), map: gameT('map'), final: gameT('final'), waiting: gameT('waiting'), pending: gameT('pending'), inProgress: gameT('inProgress'), mapInProgress: gameT('mapInProgress') }}
```

- [ ] **Step 6: Executar o teste direcionado e confirmar sucesso**

Run: `npx vitest run tests/seriesPresentation.test.ts`

Expected: 5 testes passando.

- [ ] **Step 7: Executar a validação completa**

Run: `npm run validate`

Expected: `svelte-check` sem erros, todos os testes Vitest passando, build SvelteKit concluído e bundle do servidor gerado.

- [ ] **Step 8: Verificar visualmente os dois modos**

Run: `npm run dev -- --host 127.0.0.1`

No singleplayer, iniciar uma série e confirmar `Ao vivo` com `0 : 0` antes do primeiro round e atualização posterior. Em `/online`, confirmar que o componente continua recebendo o texto localizado e exibindo o placar inicial no mapa ativo. Não é necessário criar nem persistir dados adicionais.

- [ ] **Step 9: Commitar a implementação**

```bash
git add src/lib/game/seriesPresentation.ts tests/seriesPresentation.test.ts src/lib/components/SeriesViewer.svelte src/lib/game/i18n.ts src/routes/+page.svelte src/routes/online/+page.svelte
git commit -m "fix: restaura placar ao vivo no singleplayer"
```

### Task 2: Publicar em produção

**Files:**
- Verify: `.vercel/project.json`
- Verify: `vercel.json`

**Interfaces:**
- Consumes: commit validado da Task 1 e vínculo local com o projeto Vercel `cs-20a0`.
- Produces: deployment de produção em estado `READY` e alias `https://www.cs13a0.com` atualizado.

- [ ] **Step 1: Confirmar árvore limpa e commit atual**

Run: `git status --short --branch && git log -1 --oneline`

Expected: branch `main`, sem arquivos pendentes, apontando para `fix: restaura placar ao vivo no singleplayer`.

- [ ] **Step 2: Fazer deploy de produção**

Run: `vercel --prod --yes`

Expected: deployment concluído com URL de produção e alias `https://www.cs13a0.com`.

- [ ] **Step 3: Confirmar estado e resposta pública**

Run: `vercel inspect https://www.cs13a0.com` e `curl -I https://www.cs13a0.com`

Expected: status `READY` no Vercel e HTTP 200 no domínio público.

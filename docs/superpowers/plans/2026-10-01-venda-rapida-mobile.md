# Venda rápida mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar venda múltipla segura de jogadores e coaches na coleção, com seleção rápida mobile, confirmação única e transação atômica.

**Architecture:** O backend recebe itens `{ cardId, quantity }`, trava as linhas da coleção e valida as reservas das escalações antes de remover as cópias e creditar um único lançamento no ledger. O frontend calcula a disponibilidade por carta em um helper puro e mantém o modo de seleção no `CollectionWorkspace`, reutilizando os cards existentes com estados selecionado e bloqueado.

**Tech Stack:** Svelte 5 em modo legado, TypeScript, Node HTTP, Zod, PostgreSQL, Vitest.

## Global Constraints

- Jogadores e coaches entram no mesmo lote.
- Uma cópia usada em qualquer escalação salva permanece reservada.
- A operação do servidor é atômica: vende tudo ou nada.
- A venda individual e seus endpoints permanecem compatíveis.
- A barra mobile respeita `env(safe-area-inset-bottom)` e alvos de toque de 44 px.
- Não alterar preços nem regras econômicas.

---

### Task 1: Serviço atômico e rota de venda em lote

**Files:**
- Modify: `server/collection/service.ts`
- Modify: `server/http/collection-routes.ts`
- Test: `tests/onlineCollection.test.ts`

**Interfaces:**
- Produces: `sellPlayers(db, userId, items: Array<{ cardId: string; quantity: number }>): Promise<{ coins: number; wallet: number; sold: Array<{ cardId: string; quantity: number }> }>`
- Produces: `POST /collection/sell-batch` com body `{ items }`.

- [ ] **Step 1: Escrever testes de integração que enviam jogador e coach no mesmo lote, vendem duas cópias, preservam a cópia escalada e comprovam rollback quando um item é inválido.**

```ts
const sold = await call('/collection/sell-batch', { items: [{ cardId: playerId, quantity: 2 }, { cardId: coachId, quantity: 1 }] });
expect(sold.status).toBe(200);
expect(sold.body.sold).toEqual([{ cardId: playerId, quantity: 2 }, { cardId: coachId, quantity: 1 }]);
expect(sold.body.coins).toBe(sellValue(player) * 2 + coachSellValue(coach));
```

- [ ] **Step 2: Rodar o teste e confirmar falha por rota inexistente.**

Run: `npx vitest run tests/onlineCollection.test.ts`
Expected: o novo caso falha com status 404.

- [ ] **Step 3: Implementar validação Zod e transação com `SELECT ... FOR UPDATE`, reserva de lineup, atualização das quantidades e um ledger `sell`.**

```ts
const sellBatchSchema = z.object({ items: z.array(z.object({ cardId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(999) })).min(1).max(250) });
```

O serviço rejeita IDs duplicados, cartas desconhecidas, estoque insuficiente e qualquer quantidade que invada a cópia reservada; usa uma referência determinística do lote no ledger e retorna a carteira atualizada.

- [ ] **Step 4: Rodar o teste de integração.**

Run: `npx vitest run tests/onlineCollection.test.ts`
Expected: todos os casos passam quando `TEST_DATABASE_URL` está configurada; sem ela, a suíte aparece como skipped.

- [ ] **Step 5: Commit do backend.**

```bash
git add server/collection/service.ts server/http/collection-routes.ts tests/onlineCollection.test.ts
git commit -m "feat: adiciona venda atomica em lote"
```

### Task 2: Regras de seleção e cliente da API

**Files:**
- Create: `src/lib/game/online/quick-sell.ts`
- Modify: `src/lib/game/online/collection.ts`
- Test: `tests/quickSell.test.ts`

**Interfaces:**
- Consumes: `CollectionState`, `lineupLockedIds`, `sellValue`, `coachSellValue`.
- Produces: `sellCards(serverUrl, items)` e helpers `sellableQuantity`, `quickSellTotal`, `toggleQuickSellQuantity`.

- [ ] **Step 1: Escrever testes puros para cópia livre, cópia reservada, duplicata escalada, incremento até o limite, remoção e total misto.**

```ts
expect(sellableQuantity(3, true)).toBe(2);
expect(toggleQuickSellQuantity(new Map(), 'device-2016', 2).get('device-2016')).toBe(1);
expect(quickSellTotal(selection, playerById, coachById)).toBe(expectedCoins);
```

- [ ] **Step 2: Rodar e confirmar falha por módulo ausente.**

Run: `npx vitest run tests/quickSell.test.ts`
Expected: FAIL ao importar `quick-sell`.

- [ ] **Step 3: Implementar helpers imutáveis e o cliente tipado.**

```ts
export type SellBatchItem = { cardId: string; quantity: number };
export const sellCards = (serverUrl: string, items: SellBatchItem[]) =>
  withWallet(authFetch<SellBatchResult>(serverUrl, '/collection/sell-batch', { body: { items } }));
```

- [ ] **Step 4: Rodar testes.**

Run: `npx vitest run tests/quickSell.test.ts tests/collectionRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit das regras e cliente.**

```bash
git add src/lib/game/online/quick-sell.ts src/lib/game/online/collection.ts tests/quickSell.test.ts
git commit -m "feat: adiciona regras da venda rapida"
```

### Task 3: Modo de seleção na coleção

**Files:**
- Modify: `src/lib/components/online/CollectionWorkspace.svelte`
- Modify: `src/lib/components/online/CollectionCard.svelte`
- Modify: `src/lib/components/online/CoachCard.svelte`
- Modify: `src/lib/game/online/i18n.ts`

**Interfaces:**
- Consumes: `sellCards`, helpers de `quick-sell.ts` e os mapas de jogadores/coaches do catálogo.
- Produces: botão `VENDA RÁPIDA`, seleção visual por quantidade e barra fixa com total e confirmação.

- [ ] **Step 1: Adicionar estado `quickSellMode`, mapa de seleção, derivadas de quantidade/total e ações iniciar, cancelar, alternar e confirmar.**

```ts
let quickSellMode = false;
let quickSellSelection = new Map<string, number>();
$: quickSellItems = [...quickSellSelection].map(([cardId, quantity]) => ({ cardId, quantity }));
```

- [ ] **Step 2: Adaptar os cards para expor `selectedQuantity`, `selectionDisabled`, `selectionLabel` e `onSelect`, usando `aria-pressed` e marca textual além da borda.**

```svelte
<button class="face" aria-pressed={onSelect ? selectedQuantity > 0 : undefined} on:click={() => onSelect ? onSelect(id) : onOpen?.(card)}>
```

- [ ] **Step 3: Integrar jogadores e coaches à mesma grade selecionável e manter abertura da ficha fora do modo rápido.**

No modo rápido, o toque incrementa uma unidade até o limite e o controle de remoção decrementa; cartas sem estoque livre mostram `NO TIME` e não abrem a ficha.

- [ ] **Step 4: Criar a barra fixa com cancelar, quantidade, total e vender; confirmar uma vez, chamar o endpoint e atualizar a coleção.**

```svelte
<div class="quick-sell-bar"><button>Cancelar</button><span>{count} cartas · {total} coins</span><button disabled={!count}>Vender</button></div>
```

- [ ] **Step 5: Adicionar traduções PT/EN/ES e CSS responsivo com área segura.**

Run: `npm run check`
Expected: 0 erros e 0 avisos.

- [ ] **Step 6: Rodar detector do Impeccable nos quatro arquivos alterados e corrigir apenas achados relacionados ao fluxo.**

Run: `/home/itcenterai/.agents/skills/impeccable/scripts/impeccable detect --json src/lib/components/online/CollectionWorkspace.svelte src/lib/components/online/CollectionCard.svelte src/lib/components/online/CoachCard.svelte src/lib/game/online/i18n.ts`
Expected: nenhum achado bloqueante relacionado às mudanças.

- [ ] **Step 7: Commit da interface.**

```bash
git add src/lib/components/online/CollectionWorkspace.svelte src/lib/components/online/CollectionCard.svelte src/lib/components/online/CoachCard.svelte src/lib/game/online/i18n.ts
git commit -m "feat: adiciona venda rapida na colecao"
```

### Task 4: Verificação e publicação

**Files:**
- Verify only.

**Interfaces:**
- Consumes: implementação completa das Tasks 1–3.
- Produces: commits publicados em `main`, frontend Ready e backend Railway saudável.

- [ ] **Step 1: Rodar verificações finais.**

Run: `npx vitest run tests/quickSell.test.ts tests/collectionRules.test.ts tests/onlineCollection.test.ts`
Run: `npm run check`
Run: `npm run build`
Run: `npm run server:build`
Expected: testes disponíveis passam, Svelte sem diagnóstico e ambos os builds concluem.

- [ ] **Step 2: Validar em 390×844 que jogadores e coaches selecionam, cartas escaladas bloqueiam, duplicatas incrementam e a barra não cobre a navegação.**

- [ ] **Step 3: Enviar `main`, aguardar Vercel Ready, publicar o mesmo commit na Railway e validar `/health`.**

```bash
git push origin main
railway up --detach --yes
```

- [ ] **Step 4: Registrar commit, URLs e resultados de validação no handoff.**

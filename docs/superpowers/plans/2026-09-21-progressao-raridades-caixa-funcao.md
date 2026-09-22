# Progressão de Raridades e Caixa Função Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalancear a progressão de cartas e adicionar uma caixa temática por função pronta para produção.

**Architecture:** As regras puras ficam em `collection-rules.ts`; o filtro determinístico entra em `packs.ts`; serviço e rota transportam a função escolhida. A loja reutiliza o componente de caixa e adiciona somente o seletor necessário.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Node 24, PostgreSQL, Railway.

## Global Constraints

- Preservar coleções, saldos e históricos existentes.
- Básico 2/dia; Função 1.500; Prata 2.000; Ouro 7.500; Era 10.000; Diamante 50.000; Ícone 100.000.
- Caixa Função nunca entrega Legend, GOAT ou coach.
- Toda alteração de odds permanece compartilhada entre servidor e cliente.

---

### Task 1: Regras puras da nova economia

**Files:**
- Modify: `src/lib/game/online/collection-rules.ts`
- Test: `tests/collectionRules.test.ts`
- Test: `tests/collectionEconomy.test.ts`

**Interfaces:**
- Produces: `PackTier` com `funcao`, novos `PACK_SLOTS`, `PACK_PRICES`, `DAILY_BASIC_PACKS` e caps do upgrader.

- [ ] Atualizar primeiro as expectativas de preços, odds e limites nos testes.
- [ ] Rodar `npx vitest run tests/collectionRules.test.ts tests/collectionEconomy.test.ts` e confirmar falha.
- [ ] Implementar os valores aprovados e rodar novamente até passar.

### Task 2: Sorteio e API por função

**Files:**
- Modify: `server/collection/packs.ts`
- Modify: `server/collection/service.ts`
- Modify: `server/http/collection-routes.ts`
- Modify: `src/lib/game/online/collection.ts`
- Test: `tests/collectionRules.test.ts`
- Test: `tests/onlineCollection.test.ts`

**Interfaces:**
- Consumes: `tier: "funcao"` e `role: LineupSlotRole`.
- Produces: `buyPack(..., year?, role?)` e `RollOptions.role`.

- [ ] Criar testes que exigem função, rejeitam função inválida e garantem três cartas elegíveis.
- [ ] Filtrar o pool com `getEligibleSlotRoles` e desativar coach para `funcao`.
- [ ] Transportar `role` pelo cliente, schema HTTP e serviço.
- [ ] Rodar testes puros e de integração da coleção.

### Task 3: Loja e textos

**Files:**
- Modify: `src/lib/components/online/CollectionWorkspace.svelte`
- Modify: `src/lib/components/online/PackCase.svelte`
- Modify: `src/lib/game/online/i18n.ts`

**Interfaces:**
- Consumes: `buyPack(serverUrl, "funcao", undefined, role)`.
- Produces: seletor acessível das seis funções e revelação com rótulo da função.

- [ ] Adicionar traduções PT/EN/ES e identidade visual própria da caixa.
- [ ] Adicionar card da Caixa Função ao grid comum com seletor e preço.
- [ ] Rodar `npm run check` e corrigir erros de tipo/acessibilidade.

### Task 4: Recompensas e promoções

**Files:**
- Modify: `src/lib/game/online/collection-rules.ts`
- Modify: `server/collection/service.ts`

**Interfaces:**
- Produces: limite semanal da promoção Legend e progressão de coins mais longa.

- [ ] Limitar promoção Legend a uma compra por semana e reduzir descontos.
- [ ] Reduzir recompensas repetíveis em aproximadamente 30%.
- [ ] Rodar os testes de economia, missões e promoções.

### Task 5: Verificação e publicação

**Files:**
- Modify: `src/lib/data/changelog.json`

**Interfaces:**
- Produces: builds publicáveis do frontend e servidor.

- [ ] Registrar a mudança no changelog.
- [ ] Rodar `npm run validate` e os testes Postgres relevantes.
- [ ] Commitar somente os arquivos desta entrega e enviar `main`.
- [ ] Publicar o servidor no Railway, validar `/health` e publicar o frontend pelo fluxo conectado do projeto.

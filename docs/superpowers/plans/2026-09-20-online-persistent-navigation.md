# Navegação Persistente do Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manter fila e sala online ativas durante a navegação interna entre Jogar, Time, Loja e Conta, sem reload completo e sem mudanças visuais.

**Architecture:** Um singleton client-side concentra o ciclo de vida da fila e do `OnlineRoomClient`; um componente sem markup montado em `src/routes/online/+layout.svelte` mantém esse runtime vivo entre rotas filhas. A página Jogar assina stores granulares e continua responsável somente pela apresentação e ações específicas da tela.

**Tech Stack:** Svelte 5, SvelteKit 2, TypeScript 5, Vitest 4, WebSocket existente.

## Global Constraints

- Não alterar aparência, textos ou layout.
- Não modificar regras ou protocolo do servidor.
- Não persistir snapshot competitivo no `localStorage`.
- Manter uma única instância de polling e uma única conexão WebSocket por aba.
- Não modificar `CollectionWorkspace.svelte`, que está sendo trabalhado por outro agente.
- Trabalhar apenas na branch isolada `feat/online-persistent-navigation` no worktree `/tmp/cs13a0-online-persistent-navigation`.

---

### Task 1: Runtime persistente da fila

**Files:**
- Create: `src/lib/game/online/session.ts`
- Create: `tests/onlineSession.test.ts`

**Interfaces:**
- Produces: `onlineSession`, `queueView`, `OnlineQueueView`, `OnlineMatch`, `startQueue()`, `cancelQueue()`, `mountOnlineRuntime()`, `unmountOnlineRuntime()`.
- Consumes: `authFetch`, `getOnlineServerUrl`, `sessionToken`, browser timers and lifecycle events.

- [ ] **Step 1: Write the failing tests**

Test an injected queue transport and scheduler. Assert that two consumers create only one polling interval, route-level release does not call `/queue/leave`, explicit cancel does call it, a matched response stops polling and publishes the ticket, and final application disposal performs cleanup once.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run tests/onlineSession.test.ts`
Expected: FAIL because `src/lib/game/online/session.ts` does not exist.

- [ ] **Step 3: Implement the minimal queue controller**

Expose readonly Svelte stores and commands from a singleton. Use reference-counted `mountOnlineRuntime()`/`unmountOnlineRuntime()` for the persistent layout, an idempotent interval, and a distinct `disposeForPageExit()` path. Keep `pagehide` cleanup separate from Svelte route destruction.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/onlineSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/online/session.ts tests/onlineSession.test.ts
git commit -m "feat: persistir fila entre rotas online"
```

### Task 2: Runtime persistente da sala

**Files:**
- Modify: `src/lib/game/online/session.ts`
- Modify: `tests/onlineSession.test.ts`
- Modify: `src/lib/game/online/client.ts`

**Interfaces:**
- Produces: stores `roomSnapshot`, `roomLive`, `roomConnection`, `roomError`, `roomCode`, plus `connectRoom(input)`, `sendRoomCommand(command)`, `resyncRoom()`, `leaveRoom()` and `consumeMatchedRoom()`.
- Consumes: `OnlineRoomClient`, resume token behavior already implemented in `client.ts`, `RoomSnapshot`, `LiveUpdate` and `ClientCommandInput`.

- [ ] **Step 1: Add failing lifecycle tests**

Inject a fake room client factory. Assert that route navigation does not stop the client, a second subscriber reuses the same client, reconnect updates the same stores, leaving explicitly stops once, and a final page-exit cleanup stops the socket.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run tests/onlineSession.test.ts`
Expected: FAIL on the missing room methods/stores.

- [ ] **Step 3: Implement room ownership in the singleton**

Move socket ownership and authoritative snapshot/live state into the runtime. Export the existing command input type from `client.ts` instead of duplicating it. Keep UI-derived values and animations outside the runtime.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/onlineSession.test.ts tests/onlineClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/online/session.ts src/lib/game/online/client.ts tests/onlineSession.test.ts
git commit -m "feat: manter sala online ativa entre rotas"
```

### Task 3: Integrar runtime persistente às rotas sem mudança visual

**Files:**
- Create: `src/routes/online/+layout.svelte`
- Create: `src/lib/components/online/OnlineRuntime.svelte`
- Modify: `src/routes/online/+page.svelte`
- Test: `tests/onlineNavigation.test.ts`

**Interfaces:**
- Consumes: stores e comandos de `onlineSession` definidos nas Tasks 1 e 2.
- Produces: ciclo de vida persistente para todas as rotas `/online/*`; nenhuma API nova para outros módulos.

- [ ] **Step 1: Write failing structural tests**

Verify that the layout mounts `OnlineRuntime`, the runtime contains no visual markup, the page no longer calls `leaveQueueOnExit()` or `client.stop()` from route `onDestroy`, and existing navigation destinations remain unchanged.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run tests/onlineNavigation.test.ts`
Expected: FAIL because the persistent layout/runtime do not exist and page cleanup is route-scoped.

- [ ] **Step 3: Add the persistent layout and bind the page**

Mount `OnlineRuntime` once in the online layout. Replace page-owned queue/socket lifecycle with subscriptions and runtime commands. Keep DOM structure, classes, labels and navigation links byte-for-byte compatible wherever possible. Keep page-local presentation timers, sound effects and animations local.

- [ ] **Step 4: Run static and focused validation**

Run: `npm test -- --run tests/onlineSession.test.ts tests/onlineNavigation.test.ts tests/onlineQueue.test.ts tests/onlineServer.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: zero errors and zero warnings.

- [ ] **Step 5: Browser verification**

Start frontend/backend locally, join the queue, navigate through `/online/colecao`, `/online/store` and `/online/conta`, return to `/online`, and confirm that the same queue or room remains active, the document was not reloaded, only one heartbeat/socket exists, and the console has no errors.

- [ ] **Step 6: Full validation**

Run: `npm run validate`
Expected: check, Vitest, frontend build and server build all pass. If unrelated parallel work makes the combined checkout fail, record the exact failure and confirm the isolated branch remains clean.

- [ ] **Step 7: Commit**

```bash
git add src/routes/online/+layout.svelte src/lib/components/online/OnlineRuntime.svelte src/routes/online/+page.svelte tests/onlineNavigation.test.ts
git commit -m "feat: navegar no online sem interromper sessão"
```

### Task 4: Handoff para revisão

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-online-persistent-navigation.md`

**Interfaces:**
- Produces: branch, commits, arquivos alterados, testes executados e riscos residuais para o agente revisor.

- [ ] **Step 1: Review the final diff**

Run: `git diff 0f831fe...HEAD --check` and `git diff 0f831fe...HEAD --stat`.
Expected: no whitespace errors and only scoped runtime, route, test and documentation files.

- [ ] **Step 2: Record final evidence in this plan**

Append a `## Resultado` section containing the exact commit hashes, validation commands/results and any browser-verification limitation.

- [ ] **Step 3: Commit the plan and report the branch**

```bash
git add docs/superpowers/plans/2026-09-20-online-persistent-navigation.md
git commit -m "docs: registrar validação da navegação online"
```

## Resultado

Implementação concluída na branch `feat/online-persistent-navigation`, isolada em `/tmp/cs13a0-online-persistent-navigation` e baseada diretamente em `origin/main` (`77c9c75`). Nenhum arquivo do trabalho paralelo em `feat/poder-de-quadra` foi incorporado.

Commits antes deste registro final:

- `c045dbd` — `docs: definir navegação persistente do online`
- `974de7d` — `docs: planejar navegação persistente do online`
- `b7241da` — `feat: manter sessão online entre abas`

Validação executada:

- `npm run check`: passou com 0 erros e 0 avisos.
- `npm test`: 84 arquivos passaram, 4 foram ignorados; 2.133 testes passaram e 36 foram ignorados.
- `npm run build`: passou; o aviso já existente de chunks acima de 500 kB permaneceu.
- `npm run server:build`: passou.
- Chromium headless/CDP: `/online -> /online/colecao -> /online/store -> /online/conta -> /online` preservou o mesmo marcador em `window`, provando navegação sem reload; todas as páginas tinham conteúdo, sem overlay e sem exceções no console.
- Runtime autenticado: coberto por testes com transporte e cliente injetados, incluindo heartbeat único, cancelamento explícito, conexão única ao encontrar partida, preservação ao desmontar a tela e buffer de live updates. Não foi usada uma conta real no preview local.

Decisão registrada no vault canônico como `knowledge/adrs/adr-0009-cs13a0-online-navigation-keeps-a-single-client-runtime.md`.

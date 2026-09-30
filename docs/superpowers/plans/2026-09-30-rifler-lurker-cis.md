# Rifler/Lurker para Cinco Jogadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar todas as 23 cartas existentes de Perfecto, FL1T, Ax1Le, HObbit e SANJI riflers com lurker como função secundária no Studio, frontend e backend.

**Architecture:** Os JSONs canônicos receberão `role: "rifler"` e `eligibleSlotRoles: ["rifler", "lurker"]`. O runtime terá overrides autoritativos por identidade para devolver exatamente essas duas funções, independentemente de traits ou heurísticas antigas.

**Tech Stack:** TypeScript, Vitest, SvelteKit, Node.js, JSON.

## Global Constraints

- Alterar somente Perfecto, FL1T, Ax1Le, HObbit e SANJI.
- Atualizar todas as 23 cartas existentes dessas identidades.
- Não criar carta para lollipop21k.
- Publicar Studio e jogo em `main`, depois validar Vercel e Railway.

---

### Task 1: Regressão do catálogo e runtime

**Files:**
- Modify: `tests/roleRules.test.ts`

**Interfaces:**
- Consumes: `getEligibleSlotRoles(player: Player): LineupSlotRole[]` e o catálogo `players.game.json`.
- Produces: garantia de contagem, dados e funções exatas para as cinco identidades.

- [ ] **Step 1: Escrever o teste que falha**

```ts
const riflerLurkerIds = new Set(['perfecto', 'fl1t', 'ax1le', 'hobbit', 'sanji']);
const riflerLurkerCards = players.filter((player) => riflerLurkerIds.has(getPlayerBaseId(player)));
expect(riflerLurkerCards).toHaveLength(23);
for (const player of riflerLurkerCards) {
  expect(player.role).toBe('rifler');
  expect(player.eligibleSlotRoles).toEqual(['rifler', 'lurker']);
  expect(getEligibleSlotRoles(player)).toEqual(['rifler', 'lurker']);
}
```

- [ ] **Step 2: Confirmar a falha no baseline**

Run: `npx vitest run tests/roleRules.test.ts`
Expected: FAIL em cartas que ainda são support/entry ou possuem entry/support/AWP.

### Task 2: Corrigir runtime e catálogo do jogo

**Files:**
- Modify: `src/lib/game/roleRules.ts`
- Modify: `src/lib/data/cs/players.game.json`
- Test: `tests/roleRules.test.ts`

**Interfaces:**
- Consumes: IDs normalizados retornados por `getPlayerBaseId`.
- Produces: `['rifler', 'lurker']` para as cinco identidades em frontend e backend.

- [ ] **Step 1: Adicionar overrides autoritativos**

```ts
perfecto: ['rifler', 'lurker'],
fl1t: ['rifler', 'lurker'],
ax1le: ['rifler', 'lurker'],
hobbit: ['rifler', 'lurker'],
sanji: ['rifler', 'lurker']
```

Remover o fallback antigo `perfecto: ['support']`.

- [ ] **Step 2: Transformar somente os 23 registros-alvo**

Em cada registro cujo `baseId` esteja no conjunto aprovado, gravar:

```json
"role": "rifler",
"eligibleSlotRoles": [
  "rifler",
  "lurker"
]
```

- [ ] **Step 3: Rodar o teste direcionado**

Run: `npx vitest run tests/roleRules.test.ts`
Expected: PASS com 23 cartas verificadas.

### Task 3: Espelhar no Studio

**Files:**
- Modify: `data/workspace/players.game.json` no repositório `cs13a0-management`.
- Modify: `data/exports/players.game.json` no repositório `cs13a0-management`.

**Interfaces:**
- Consumes: as mesmas cinco identidades e o mesmo formato do catálogo do jogo.
- Produces: workspace e export do Studio idênticos para função/posições.

- [ ] **Step 1: Aplicar a mesma transformação nos dois arquivos**

Gravar `role: "rifler"` e `eligibleSlotRoles: ["rifler", "lurker"]` apenas nas 23 cartas-alvo.

- [ ] **Step 2: Verificar contagem e igualdade**

Run: consulta `jq` nos dois arquivos.
Expected: 23 registros em cada arquivo e nenhuma divergência entre `role` e `eligibleSlotRoles`.

### Task 4: Validar e publicar

**Files:**
- Modify: nenhum arquivo adicional.

**Interfaces:**
- Consumes: commits validados dos dois repositórios.
- Produces: Studio, frontend Vercel e backend Railway publicados.

- [ ] **Step 1: Rodar validações do jogo**

Run: `npm run check && npx vitest run tests/roleRules.test.ts tests/datasetIntegrity.test.ts && npm run build && npm run server:build`
Expected: todos os comandos passam.

- [ ] **Step 2: Rodar validação do Studio**

Run: `npm run check`
Expected: 0 erros e 0 avisos.

- [ ] **Step 3: Criar commits limitados ao escopo e enviar as duas mains**

Expected: os commits contêm somente testes, regra e catálogos aprovados; pushes aceitos.

- [ ] **Step 4: Publicar e verificar produção**

Expected: Vercel `Ready`; Railway `SUCCESS`; healthcheck `/health` responde 200; frontend público responde 200.

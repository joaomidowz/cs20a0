# Replay Canvas 2D Offline Implementation Plan

> **For agentic workers:** Execute inline task-by-task. Do not delegate, deploy or mutate the online protocol in this cycle.

**Goal:** Exibir no singleplayer uma replay tática determinística por mapa, derivada das topologias fornecidas e reconciliada em sombra com as estatísticas legadas.

**Architecture:** Fixtures textuais são compiladas para grafos validados. Um produtor transforma `SeriesResult + MapResult` em `ReplayPlanV1`; um expansor puro gera frames a 4 Hz; um núcleo Canvas independente desenha o estado; um componente Svelte conecta o viewer ao cursor já revelado pelo `SeriesViewer`.

**Tech Stack:** TypeScript estrito, Svelte 5, Canvas 2D, Vitest e APIs nativas do navegador.

## Global Constraints

- Offline primeiro; nenhum deploy.
- Não alterar contratos, comandos ou protocolo online.
- Não inferir adjacências das imagens.
- Permitir coordenadas e polígonos visuais aditivos derivados das imagens, sem alterar arestas.
- Preservar as sete listas originais como fixtures.
- Nuke usa os níveis e as cinco transições verticais confirmadas pelo usuário.
- `createRunStats` permanece oficial.
- Sem TypeScript `any`.

---

### Task 1: Fixtures e compilador topológico

**Files:**
- Create: `src/lib/game/replay/topology/fixtures/*.topology.txt`
- Create: `src/lib/game/replay/topology/fixtures/nuke.levels.json`
- Create: `src/lib/game/replay/topology/types.ts`
- Create: `src/lib/game/replay/topology/parser.ts`
- Create: `src/lib/game/replay/topology/maps.ts`
- Test: `tests/replayTopology.test.ts`

**Interfaces:**
- Produces: `parseMapTopology(source, metadata): MapGraph`
- Produces: `getMapGraph(mapId): MapGraph`
- Produces: `createRadarPlan(graph, seed): RadarPlan`
- Produces: `hashRadarPlan(plan): string`

- [x] Escrever um teste que exige todos os nós, todas as adjacências listadas e nenhuma adjacência nomeada extra.
- [x] Rodar `npm test -- --run tests/replayTopology.test.ts` e observar falha por módulos ausentes.
- [x] Copiar as fixtures sem alterar o texto e implementar parser/validador mínimo.
- [x] Adicionar níveis de Nuke e validar as cinco transições verticais confirmadas.
- [x] Gerar radar canônico, orientar pela referência visual e fixar sete hashes literais no teste.
- [x] Rodar o teste até passar.

### Task 2: Tipos e produtor de ReplayPlan

**Files:**
- Create: `src/lib/game/replay/types.ts`
- Create: `src/lib/game/replay/plan.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulation.ts`
- Test: `tests/replayPlan.test.ts`

**Interfaces:**
- Produces: `createReplayPlan(series, mapIndex): ReplayPlanV1`
- Consumes: `getMapGraph(mapId)` e lineups reais em `CombatTeam.lineup`.

- [x] Testar ID `seriesId:mapIndex`, resultado, vencedor e número de rounds.
- [x] Testar lados em regulação e overtime.
- [x] Testar que toda rota usa somente arestas existentes.
- [x] Adicionar `organizationId` e lineups aos times simulados.
- [x] Produzir loadouts, rotas e eventos discretos determinísticos.
- [x] Declarar split T, setup CT, papéis, execute variável e dispersão por rota.
- [x] Rodar testes de plano e simulação existentes.

### Task 3: Expansão determinística e estatísticas da replay

**Files:**
- Create: `src/lib/game/replay/expand.ts`
- Create: `src/lib/game/replay/canonical.ts`
- Create: `src/lib/game/replay/stats.ts`
- Test: `tests/replayExpansion.test.ts`
- Test: `tests/replayStats.test.ts`

**Interfaces:**
- Produces: `expandReplayPlan(plan, graph): ReplayV1`
- Produces: `canonicalReplayHash(replay): string`
- Produces: `aggregateReplayStats(plan): ReplayStatsReport`
- Produces: `reconcileReplayStats(legacy, derived): ReplayReconciliation[]`

- [x] Exigir hash idêntico para duas expansões do mesmo plano.
- [x] Testar frames antes, entre e depois dos keyframes.
- [x] Criar fixtures de lethal simultâneo, HE multi-vítima, molotov, trade, assistência expirada e flash assist.
- [x] Implementar ordenação estável, HP cap, assistência, autoria de flash e dano não sintético.
- [x] Manter diferenças de estatística apenas no relatório em sombra.

### Task 4: Núcleo Canvas independente

**Files:**
- Create: `src/lib/game/replay/canvas/clock.ts`
- Create: `src/lib/game/replay/canvas/interpolation.ts`
- Create: `src/lib/game/replay/canvas/transform.ts`
- Create: `src/lib/game/replay/canvas/hit-testing.ts`
- Create: `src/lib/game/replay/canvas/draw.ts`
- Test: `tests/replayCanvas.test.ts`

**Interfaces:**
- Produces: `ReplayClock`, `interpolateReplayFrame`, `createViewportTransform`, `hitTestReplay`, `drawRadarBase`, `drawReplayFrame`.

- [x] Testar play/pause/scrub e velocidades `normal`, `fast` e `ultra`.
- [x] Comprimir cada round lógico para janelas máximas de 8s/3s, limitadas pelo intervalo médio de chegada.
- [x] Enfileirar rounds recebidos e promover somente após desenhar `round-end`, com compressão por backlog e salto entre rounds acima de seis pendentes.
- [x] Testar interpolação de posição, granadas ativas, mortos e bomba.
- [x] Testar zoom no cursor, pan e conversão mundo/tela.
- [x] Testar hit-testing em jogadores e salas de callout.
- [x] Implementar planta preenchida sem filtros ou sombras e com DPR máximo 2.
- [x] Desenhar `shape` poligonal quando presente e retângulo arredondado como fallback.

### Task 5: Viewer Svelte offline

**Files:**
- Create: `src/lib/components/ReplayViewer.svelte`
- Modify: `src/lib/components/SeriesViewer.svelte`
- Modify: `src/lib/game/i18n.ts`
- Modify: `src/app.css`
- Test: `tests/simulation.test.ts`

**Interfaces:**
- Consumes: `series`, `mapIndex`, `visibleRounds`, `language`.
- Emits: nenhum comando ou mutação da simulação; apenas estado local do viewer.

- [x] Montar canvas base/live e HUD DOM.
- [x] Limitar conteúdo aos rounds visíveis, iniciar no mais recente e depois seguir por uma fila sem cortes.
- [x] Adicionar scrub, round manual, voltar ao vivo, play/pause, Normal/Rápido/Ultra, pan, zoom, tooltip e atalhos.
- [x] Iniciar em Ultra com `prefers-reduced-motion` e suspender em aba oculta.
- [x] Permitir reabrir mapas concluídos individualmente no resultado.

### Task 6: Verificação final offline

**Files:**
- Test: `tests/replay*.test.ts`
- Create: `tests/fixtures/replay-radar-hashes.json`

- [x] Rodar `npm run check`.
- [x] Rodar `npm test` e confirmar toda a suíte.
- [x] Rodar `npm run build` e `npm run server:build`.
- [x] Iniciar servidor local e validar desktop/mobile no Chromium sem erros de console.
- [x] Confirmar que o modo online não recebeu arquivos ou mudanças de contrato.
- [x] Não executar deploy.

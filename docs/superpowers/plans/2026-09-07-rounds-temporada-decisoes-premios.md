# Rounds, temporada, decisões e prêmios — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalizar rounds apresentados em tempo real, decisões offline por fila, temporada online com rematch e prêmios do Major, mantendo os motores offline e online determinísticos e cobertos por testes.

**Architecture:** O motor de rounds produz fatos completos e destaques; uma camada de apresentação controla quando o resultado passa a ser visível. O offline usa o mesmo motor incremental de torneio e registra decisões para reconstrução. O servidor online continua autoritativo e expõe temporada/rematch por protocolo, enquanto clientes apenas persistem preferências locais e renderizam snapshots públicos.

**Tech Stack:** Svelte 5, SvelteKit 2, TypeScript estrito, Vitest, Node/WebSocket, Zod.

## Global Constraints

- Pausa tática manual existe em todos os modos offline.
- Veto, escolha de lado e call de economia manuais existem somente em Ranked (`faceit`) e PRO; Normal (`premier`) automatiza essas decisões.
- O primeiro round aparece como `R1 · em andamento` com placar `0 : 0`, sem antecipar vencedor.
- A temporada online aceita 1 a 4 runs, abre rematch por 10 segundos e pontua colocação/progresso.
- Nome e organização são persistidos apenas no `localStorage`; a sala segue efêmera e autoritativa no servidor.
- A classificação mantém organização, campanha, BH e colocação em uma linha; entradas/reordenações duram 160 ms, saídas 90 ms e movimento reduzido zera o deslocamento.
- Código em inglês, textos visíveis traduzidos e sem `any` implícito.

---

### Task 1: Motor e apresentação dos rounds

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/rounds.ts`
- Modify: `src/lib/game/roundPresentation.ts`
- Modify: `src/lib/game/seriesPresentation.ts`
- Modify: `src/lib/components/RoundFeed.svelte`
- Modify: `src/lib/components/RoundStrip.svelte`
- Modify: `src/lib/components/SeriesViewer.svelte`
- Modify: `src/lib/components/SandboxSeriesViewer.svelte`
- Create: `src/lib/components/live/RoundFlash.svelte`
- Test: `tests/rounds.test.ts`
- Test: `tests/seriesPresentation.test.ts`

**Interfaces:**
- Produces: `RoundDetail.highlight`, `getRoundFlash(detail, language)`, `getPresentedSeriesState(series, live)`.
- Consumes: `RoundDetail`, `RoundTag`, o cursor de rounds visíveis e a conclusão do feed de kills.

- [ ] Escrever testes que provem distribuição plausível de sobreviventes, upset full contra eco e geração/espelhamento de triple, quad, ace e clutch.
- [ ] Executar `npx vitest run tests/rounds.test.ts tests/seriesPresentation.test.ts` e confirmar que os novos casos falham antes da implementação.
- [ ] Gerar kills e `RoundHighlight` no motor sem alterar o vencedor já sorteado, incluindo tags `3k`, `4k` e `ace`.
- [ ] Manter o último round como não confirmado enquanto o feed está sendo revelado e só então incorporar vencedor, faixa e flash.
- [ ] Renderizar `RoundFlash` com `aria-live`, animação curta e `prefers-reduced-motion`.
- [ ] Reexecutar os dois arquivos de teste e confirmar aprovação.

### Task 2: Major offline incremental e decisões por fila

**Files:**
- Create: `src/lib/game/offlineMajor.ts`
- Modify: `src/lib/game/online/live-series.ts`
- Modify: `src/lib/game/store.ts`
- Modify: `src/routes/+page.svelte`
- Test: `tests/offlineMajor.test.ts`

**Interfaces:**
- Produces: `getOfflineDecisionRules(mode)`, estado serializável da run e ações de veto/lado/economia/timeout.
- Consumes: `createTournamentEngine`, `createLiveSeries`, `applySeriesDecision` e `requestSeriesTimeout`.

- [ ] Escrever testes para a matriz de permissões, equivalência determinística do modo automático e reconstrução pelo log de decisões.
- [ ] Executar `npx vitest run tests/offlineMajor.test.ts` e observar as falhas esperadas.
- [ ] Delegar decisões não manuais a políticas automáticas por `humanDecisions`, mantendo `requestSeriesTimeout` disponível ao humano em todas as filas.
- [ ] Trocar a execução solo para o orquestrador incremental e persistir apenas entradas suficientes para reconstruí-lo deterministicamente.
- [ ] Exibir veto e decisões somente em Ranked/PRO e a ação de pausa em todos os modos.
- [ ] Reexecutar `npx vitest run tests/offlineMajor.test.ts` e confirmar aprovação.

### Task 3: Contrato e servidor da temporada online

**Files:**
- Modify: `src/lib/game/online/contracts.ts`
- Modify: `src/lib/game/online/tournament-engine.ts`
- Modify: `server/room-manager.ts`
- Test: `tests/onlineSeason.test.ts`
- Test: `tests/onlineServer.test.ts`

**Interfaces:**
- Produces: `RoomConfig.seasonRuns`, `RoomSnapshot.season`, comando `rematch-vote`, `seasonPointsFor` e `tournament.awards`.
- Consumes: término autoritativo da run, campanhas do torneio e participantes conectados.

- [ ] Escrever testes para pontuação, janela de 10 segundos, aceites/recusas, nova seed, participantes preservados, expiração e campeão por pontos.
- [ ] Executar `npx vitest run tests/onlineSeason.test.ts tests/onlineServer.test.ts` e observar as falhas esperadas.
- [ ] Versionar o protocolo, validar `seasonRuns`, registrar uma linha por organização e abrir a votação apenas depois da conclusão.
- [ ] Reiniciar em draft com nova seed e somente os participantes que aceitaram, iniciando nova temporada após a run final.
- [ ] Sanitizar snapshots para permitir assistir outra série sem perder a decisão pendente da própria partida.
- [ ] Reexecutar os testes de servidor e confirmar aprovação.

### Task 4: Cliente online, identidade e troca de partida

**Files:**
- Modify: `src/lib/game/online/client.ts`
- Modify: `src/lib/game/online/i18n.ts`
- Create: `src/lib/components/online/SeasonPanel.svelte`
- Create: `src/lib/components/online/RematchPanel.svelte`
- Create: `src/lib/components/online/LiveSeriesSwitcher.svelte`
- Modify: `src/lib/components/MajorOverview.svelte`
- Modify: `src/lib/components/SwissGraph.svelte`
- Modify: `src/lib/components/PlayoffBracket.svelte`
- Modify: `src/routes/online/+page.svelte`

**Interfaces:**
- Produces: `loadOnlineIdentity`, `saveOnlineIdentity`, `loadOnlineConfig`, `saveOnlineConfig` e ações `watch-match`/`rematch-vote`.
- Consumes: `RoomSnapshot.season`, `liveCursor.overviewSeries` e `self.pendingDecision`.

- [ ] Cobrir serialização segura de identidade/configuração e construir os painéis a partir do snapshot, sem estado competitivo local autoritativo.
- [ ] Permitir selecionar qualquer série ao vivo na visão geral e voltar à própria partida, mantendo alerta para decisão pendente.
- [ ] Renderizar contagem do rematch pelo deslocamento entre relógios do servidor e cliente.
- [ ] Executar `npm run check` e corrigir todos os erros de tipagem/acessibilidade desta frente.

### Task 5: Estatísticas fechadas e prêmios do Major

**Files:**
- Create: `src/lib/game/majorAwards.ts`
- Modify: `src/lib/game/runStats.ts`
- Create: `src/lib/components/CollapsibleStats.svelte`
- Create: `src/lib/components/MajorAwardsPanel.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/online/+page.svelte`
- Modify: `src/routes/sandbox/+page.svelte`
- Test: `tests/majorAwards.test.ts`
- Test: `tests/runStats.test.ts`

**Interfaces:**
- Produces: `computeMajorAwards(rounds, championId)` e estatísticas derivadas do kill feed real.
- Consumes: todas as séries/mapas concluídos da run e suas `RoundDetail.kills`.

- [ ] Escrever testes de agregação por jogador/time, desempates, MVP, clutch king, highlight reel e fallback sem kill feed.
- [ ] Executar `npx vitest run tests/majorAwards.test.ts tests/runStats.test.ts` e observar as falhas esperadas.
- [ ] Calcular rating e prêmios de forma pura, estável e independente da UI.
- [ ] Exibir prêmios abertos e envolver estatísticas detalhadas em `CollapsibleStats` fechado por padrão.
- [ ] Reexecutar os testes focados e confirmar aprovação.

### Task 6: Integração e validação completa

**Files:**
- Modify only when a failure demonstrates an integration defect.

**Interfaces:**
- Consumes: todas as interfaces das tarefas 1 a 5.
- Produces: uma árvore consistente e validada, sem artefatos de build versionados.

- [ ] Executar `npm run check` e zerar erros e avisos.
- [ ] Executar `npm test` e zerar testes falhando.
- [ ] Executar `npm run build` e confirmar o bundle SvelteKit.
- [ ] Executar `npm run server:build` e confirmar o bundle Node.
- [ ] Rodar verificação de navegador offline e online local, conferindo console, R1 0:0, pausa, rematch, troca de série e estatísticas recolhidas.
- [ ] Revisar `git diff --check`, arquivos alterados e a separação de mudanças preexistentes não relacionadas antes do commit.

### Task 7: Alinhamento da classificação e microtransições

**Files:**
- Modify: `src/lib/components/StandingsTable.svelte`
- Modify: `src/lib/components/PageLayout.svelte`
- Test: `tests/majorOverview.test.ts`

**Interfaces:**
- Consumes: `MajorStanding[]`, navegação entre rotas e preferência de redução de movimento do sistema.
- Produces: classificação responsiva sem quebra de linha e transições curtas de entrada, saída e reordenação.

- [x] Escrever teste estrutural para alinhamento, entrada/saída e redução de movimento.
- [x] Executar `npx vitest run tests/majorOverview.test.ts` e observar a falha antes da implementação.
- [x] Agrupar rank/brasão/nome na primeira coluna, reservar campanha/BH/colocação e reduzir elementos decorativos em até 420 px.
- [x] Aplicar `flip`/`fly` por 160 ms e `fade` de saída por 90 ms, zerando movimento para `prefers-reduced-motion`.
- [x] Reexecutar o teste focado e `npm run check`; ambos passam sem diagnóstico.

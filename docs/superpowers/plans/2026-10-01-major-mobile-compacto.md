# Major Mobile Compacto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task in the current worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compactar a partida de Major no celular, ocultar controles inúteis da fila e mover detalhes de round para um bottom sheet.

**Architecture:** Os viewers continuam responsáveis pelo estado da série. `RoundStrip` e `RoundFeed` passam a emitir o round inspecionado, enquanto um novo `RoundDetailSheet` concentra a apresentação acessível. As rotas apenas escolhem quais controles são aplicáveis; CSS responsivo reorganiza o conteúdo sem alterar o motor.

**Tech Stack:** Svelte 5, TypeScript, CSS responsivo, Vitest, Playwright/Vite.

## Global Constraints

- Preservar contratos de servidor, WebSocket e persistência.
- Preservar o desktop e a identidade visual existente.
- Breakpoint do viewer: 679 px.
- Nenhuma fonte informativa nova abaixo de 11 px no mobile.
- Sem dependências novas.

---

### Task 1: Contrato de inspeção de rounds

**Files:**
- Create: `src/lib/components/RoundDetailSheet.svelte`
- Modify: `src/lib/components/RoundStrip.svelte`
- Modify: `src/lib/components/RoundFeed.svelte`
- Test: `tests/mobileMatchPresentation.test.ts`

**Interfaces:**
- `RoundInspection = { number: number; score: RoundScore; detail?: RoundDetail }`
- `RoundStrip.onInspect: (round: RoundInspection, trigger: HTMLElement) => void`
- `RoundFeed.onInspect: (round: RoundInspection, trigger: HTMLElement) => void`
- `RoundDetailSheet` recebe `inspection`, `teamNames`, `userIsA`, `language`, `trigger` e `onClose`.

- [ ] Criar teste de contrato que exige callbacks de inspeção e o novo sheet.
- [ ] Fazer o teste falhar com `npx vitest run tests/mobileMatchPresentation.test.ts`.
- [ ] Extrair o conteúdo do card de round para o sheet, mantendo o card inline em desktop.
- [ ] Adicionar fechamento, foco, bloqueio de scroll e safe area.
- [ ] Rodar o teste até passar.

### Task 2: Viewer compacto compartilhado

**Files:**
- Modify: `src/lib/components/SeriesViewer.svelte`
- Modify: `src/lib/components/SandboxSeriesViewer.svelte`
- Modify: `src/app.css`
- Test: `tests/mobileMatchPresentation.test.ts`

**Interfaces:**
- Ambos os viewers mantêm `inspectedRound` e `inspectionTrigger` locais.
- `RoundFeed` continua sempre montado; no mobile sua lista detalhada é visualmente substituída por um botão de resumo.

- [ ] Adicionar expectativas para régua rolável, resumo do round e mapas em três colunas.
- [ ] Fazer o teste falhar.
- [ ] Compactar cabeçalho, série, placar e mapas em `max-width: 679px`.
- [ ] Remover a mudança para uma coluna abaixo de 400 px e ocultar metadados secundários no mobile.
- [ ] Rodar o teste até passar.

### Task 3: Controles por origem e rota

**Files:**
- Modify: `src/routes/online/+page.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/sandbox/+page.svelte`
- Test: `tests/mobileMatchPresentation.test.ts`

**Interfaces:**
- `snapshot.origin === 'queue'` renderiza `queue-match-status` + `AutomationGear`, sem `SegmentedControl` de modo/velocidade.
- Outras origens usam `compact-match-controls`; Sandbox admite duas linhas.

- [ ] Adicionar teste de contrato para o branch da fila e classes compactas.
- [ ] Fazer o teste falhar.
- [ ] Implementar a ramificação da fila e compactar controles editáveis.
- [ ] Reduzir o cabeçalho e padding redundante do Major mobile.
- [ ] Rodar o teste até passar.

### Task 4: Verificação integral

**Files:**
- Modify somente os alvos acima caso a inspeção revele defeitos.

- [ ] Rodar `npm run check`, `npm test` e `npm run build`.
- [ ] Abrir o Sandbox em 320 × 568, 375 × 812 e 430 × 932; verificar overflow, sheet e visibilidade dos mapas.
- [ ] Verificar desktop em 1440 × 900.
- [ ] Rodar uma única vez `impeccable detect --json` nos arquivos alterados.
- [ ] Corrigir em um lote os defeitos encontrados e confirmar em no máximo mais uma rodada visual.

### Task 5: Corrigir sobreposição dos controles e atraso visual dos rounds

**Files:**
- Modify: `src/app.css`
- Modify: `src/lib/components/RoundStrip.svelte`
- Modify: `tests/mobileMatchPresentation.test.ts`

**Interfaces:**
- `.compact-match-controls` usa uma coluna em `max-width: 679px`.
- `.round-strip` usa 12 colunas no mobile e 10 colunas em `max-width: 379px`.
- Os callbacks `RoundStrip.onInspect` e o bottom sheet existente não mudam.

- [ ] Alterar o teste de contrato para exigir `grid-template-columns:1fr` nos controles compactos e proibir `overflow-x:auto` na regra mobile de `RoundStrip`.
- [ ] Rodar `npx vitest run tests/mobileMatchPresentation.test.ts` e confirmar a falha.
- [ ] Reorganizar `.compact-match-controls` em duas linhas de largura total, preservando velocidade + engrenagem na mesma linha.
- [ ] Trocar a faixa rolável de `RoundStrip` por grade responsiva de 12/10 colunas, com números menores e quebra automática.
- [ ] Rodar `npm run check`, o teste mobile e `npm run build`.
- [ ] Validar visualmente em 320 × 568 e 402 × 874, confirmando ausência de sobreposição e visibilidade do último round.

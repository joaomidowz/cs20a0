# Sandbox Major Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `/sandbox` para montar um Time A arbitrario, executar um Major local com adversarios sorteados e assistir automaticamente aos replays do Time A, removendo o replay visual da campanha offline e atualizando a afinidade de mapas.

**Architecture:** Uma rota Svelte independente manterá estado local e chamará um dominio puro de Sandbox para validar elenco, construir o Major e expor a partida atual. O replay existente será montado somente nessa rota para partidas do Time A; `SeriesViewer` offline continuará mostrando mapas e placares, sem replay. A simulacao visual de Mirage continuará usando o gold extraído do HTML, enquanto os outros mapas usarão os grafos esquemáticos.

**Tech Stack:** SvelteKit, Svelte 4, TypeScript strict, Vitest, Canvas 2D, Playwright/CDP para verificação de navegador.

## Global Constraints

- Não alterar online, protocolo, servidor, WebSocket, deploy ou `tests/simulator.html`.
- Não escrever o estado do Sandbox no store/salvamento da campanha.
- Usar `apply_patch` para edição e manter código em inglês e commits/documentação em português.
- Validar jogadores por identidade-base e por `roleRules.ts`.
- Simular bot matches como resultado; renderizar replay somente quando o Time A participar.
- `simular` é padrão e dá 10.000 ms de tempo visual por round; Normal é 4×, Rápido é 8× e Ultra conclui instantaneamente.
- Afinidade offline: 0–1 `EVEN`, 2 `+`, 3 `++`, 4–5 `+++`; bônus Premier `0/0,5/1/1,5`, Faceit/Pro `0/1,5/3/4,5`.

---

### Task 1: Restore offline boundary and map affinity contract

**Files:**
- Modify: `src/lib/components/SeriesViewer.svelte`
- Modify: `src/lib/game/maps.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/map-veto.ts`
- Test: `tests/maps.test.ts`
- Test: `tests/mapVeto.test.ts`
- Test: `tests/replayViewerIntegration.test.ts`

**Interfaces:**
- `SeriesViewer` keeps map tabs, veto, map rows, score and existing controls but no longer imports or renders `ReplayViewer`.
- `MapAffinity` becomes `'EVEN' | '+' | '++' | '+++'`.
- `getMapAffinity(contributorCount)` returns the threshold table from the spec.
- `getSelectedMapPowerBonus(mode, affinity)` returns the four numeric values from the spec.

- [ ] **Step 1: Write the failing tests**

Add literal threshold and numeric assertions to `tests/maps.test.ts`, plus an integration assertion that `SeriesViewer.svelte` has no `ReplayViewer` import or element while map rows remain present.

- [ ] **Step 2: Run the focused tests**

Run `npm test -- --run tests/maps.test.ts tests/mapVeto.test.ts tests/replayViewerIntegration.test.ts`.
Expected: failures for `+++`, new values, and the replay import assertion.

- [ ] **Step 3: Implement the minimal boundary change**

Remove only the replay block/import from `SeriesViewer`, preserve map rendering and score markup, add `+++` to the type and veto affinity scoring, and update the two public map functions.

- [ ] **Step 4: Verify the focused tests**

Run the same Vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SeriesViewer.svelte src/lib/game/maps.ts src/lib/game/types.ts src/lib/game/map-veto.ts tests/maps.test.ts tests/mapVeto.test.ts tests/replayViewerIntegration.test.ts
git commit -m "fix: separa replay offline e atualiza bonus de mapas"
```

### Task 2: Extract reusable Sandbox lineup and Major domain

**Files:**
- Create: `src/lib/game/sandbox/types.ts`
- Create: `src/lib/game/sandbox/lineup.ts`
- Create: `src/lib/game/sandbox/major.ts`
- Test: `tests/sandboxLineup.test.ts`
- Test: `tests/sandboxMajor.test.ts`

**Interfaces:**
- `SandboxLineupSelection`: `{ organizationId: string; style: OrgStyle; players: SelectedPlayer[] }`.
- `validateSandboxLineup(selection): { valid: boolean; errors: Record<string, string>; players: Player[] }`.
- `buildSandboxCombatTeam(selection, side: 'A' | 'B'): CombatTeam`.
- `createSandboxMajor(selection, seed): SandboxMajorState`, with deterministic `matches`, `currentMatchIndex`, `phase` and `finished` fields.
- `advanceSandboxMajor(state): SandboxMajorState`, which resolves non-user matches as results and stops on the next user match.

- [ ] **Step 1: Write a failing lineup test**

Cover five valid distinct base IDs, missing organization, fewer than five players, duplicate base IDs across slots, and an ineligible role. Assert errors are field-addressable and the input selection is not mutated.

- [ ] **Step 2: Implement lineup validation/building**

Reuse `playerById`, `getPlayerBaseId`, `getEligibleSlotRoles`, `validatePlayerPick`, `calculateUserTeamPower` and existing team data. Override only identity to `sandbox-a`/`organizationId` while retaining the selected organization name/style and arbitrary lineup.

- [ ] **Step 3: Write a failing deterministic Major test**

For one known seed assert two calls produce equal canonical match/team IDs, the selected organization is the user team, opponents are historical teams, and bot-only matches have no replay marker.

- [ ] **Step 4: Implement Major orchestration**

Reuse the same team pool, seeded RNG, map selection/veto and Major progression used by the offline/online domain, but create local state and mark only matches involving `sandbox-a` as replayable. Do not add a `GamePhase` or persist to `game`.

- [ ] **Step 5: Verify and commit**

Run `npm test -- --run tests/sandboxLineup.test.ts tests/sandboxMajor.test.ts`, then commit:

```bash
git add src/lib/game/sandbox tests/sandboxLineup.test.ts tests/sandboxMajor.test.ts
git commit -m "feat: cria dominio local do Sandbox"
```

### Task 3: Add the `simular` replay clock and automatic match progression

**Files:**
- Modify: `src/lib/game/replay/canvas/clock.ts`
- Modify: `src/lib/game/replay/types.ts`
- Modify: `src/lib/components/GoldenMirageReplayViewer.svelte`
- Modify: `src/lib/components/SchematicReplayViewer.svelte`
- Test: `tests/replayCanvas.test.ts`
- Create or modify: `tests/sandboxReplayClock.test.ts`

**Interfaces:**
- Extend replay speed with `'simulate'`/`'simular'` using the repository’s established naming convention.
- `ReplayClock` maps simular to a 10.000 ms visual round duration and preserves 4×, 8× and instant modes.
- Both viewers accept an `autoplay`/`manualStart` contract and invoke a completion callback when a map ends.

- [ ] **Step 1: Write failing clock tests**

Assert normal and fast multipliers, simulate progress at 5.000 ms halfway through a 10.000 ms visual round, and ultra completion on the first tick. Add a viewer contract test for automatic completion without a per-map Play button.

- [ ] **Step 2: Implement clock and viewer seams**

Add the fixed simulation duration without changing authoritative round results. Preserve local-only speed changes, cleanup on destroy, and the Mirage renderer’s existing gold state.

- [ ] **Step 3: Verify and commit**

Run focused replay tests and commit:

```bash
git add src/lib/game/replay/canvas/clock.ts src/lib/game/replay/types.ts src/lib/components/GoldenMirageReplayViewer.svelte src/lib/components/SchematicReplayViewer.svelte tests/replayCanvas.test.ts tests/sandboxReplayClock.test.ts
git commit -m "feat: adiciona velocidade Simular ao replay"
```

### Task 4: Build the Sandbox setup page

**Files:**
- Create: `src/routes/sandbox/+page.svelte`
- Create: `src/lib/components/SandboxLineupBuilder.svelte`
- Create: `src/lib/components/SandboxPlayerPicker.svelte`
- Test: `tests/sandboxPage.test.ts`

**Interfaces:**
- `SandboxLineupBuilder` emits a valid `SandboxLineupSelection` and field errors.
- `SandboxPlayerPicker` supports organization search, player search, slot replacement and role selection.
- The route owns `setup | major` state, seed, language/theme, current match and manual/automatic preference.

- [ ] **Step 1: Write failing component/source tests**

Assert the route renders the setup controls, default organization roster, five role slots, style control, automatic/manual control and no network call. Assert an invalid duplicate lineup blocks start and a valid lineup enters major state.

- [ ] **Step 2: Implement setup UI**

Use `PageLayout`, `Navbar`, `pageState`, `teams`, `players`, `getTeamPlayers`, role rules and existing translations where available. Keep local state only; show slot-level validation and a reset/restart action.

- [ ] **Step 3: Verify and commit**

Run `npm test -- --run tests/sandboxPage.test.ts`, then `npm run check`, and commit:

```bash
git add src/routes/sandbox/+page.svelte src/lib/components/SandboxLineupBuilder.svelte src/lib/components/SandboxPlayerPicker.svelte tests/sandboxPage.test.ts
git commit -m "feat: adiciona montador do Sandbox"
```

### Task 5: Connect Major results and user-only replay

**Files:**
- Modify: `src/routes/sandbox/+page.svelte`
- Modify: `src/lib/components/ReplayViewer.svelte`
- Create: `src/lib/components/SandboxMajorView.svelte`
- Test: `tests/sandboxMajorView.test.ts`

**Interfaces:**
- `SandboxMajorView` receives `SandboxMajorState` and exposes `onStart`, `onAdvance`, `onRestart`.
- Bot matches render result cards only.
- User matches render the current series/maps and `ReplayViewer` with automatic/manual controls; map completion advances to the next map and then next match.

- [ ] **Step 1: Write failing integration tests**

Assert a bot match produces only a result card, a user match mounts `ReplayViewer`, automatic mode advances after completion, manual mode waits for start, and there is no per-map Play button after start.

- [ ] **Step 2: Implement the major view**

Use the shared `ReplayViewer` router (Mirage gold, other maps schematic), pass `simular` by default, and transition only after viewer completion. Keep score/result presentation consistent with online terminology.

- [ ] **Step 3: Verify and commit**

Run focused tests, `npm run check`, and commit:

```bash
git add src/routes/sandbox/+page.svelte src/lib/components/ReplayViewer.svelte src/lib/components/SandboxMajorView.svelte tests/sandboxMajorView.test.ts
git commit -m "feat: conecta Major e replay no Sandbox"
```

### Task 6: Fix offline score alignment and preserve map presentation

**Files:**
- Modify: `src/lib/components/SeriesViewer.svelte`
- Modify: `src/app.css` or the existing component style block containing `.series-header`/`.series-status`
- Test: `tests/simulation.test.ts`
- Test: `tests/offlineScorePresentation.test.ts`

**Interfaces:**
- Desktop live/final score/status stays in the right header column.
- Mobile layout remains responsive and does not hide or duplicate the score.

- [ ] **Step 1: Write failing layout/source test**

Assert the score/status uses the right-side header slot and that map rows and map names remain rendered while replay markup is absent.

- [ ] **Step 2: Implement CSS/layout correction**

Adjust only alignment/grid rules and preserve existing responsive breakpoints and localized labels.

- [ ] **Step 3: Verify and commit**

Run `npm test -- --run tests/offlineScorePresentation.test.ts tests/simulation.test.ts`, then commit:

```bash
git add src/lib/components/SeriesViewer.svelte src/app.css tests/simulation.test.ts tests/offlineScorePresentation.test.ts
git commit -m "fix: alinha placar offline e preserva mapas"
```

### Task 7: Full validation and browser verification

**Files:**
- Modify only if a test exposes a defect in the files above.
- Test: all existing Vitest files and new Sandbox tests.

- [ ] **Step 1: Run static and unit gates**

Run `npm run check`, `npm test -- --run`, `npm run build`, and `npm run server:build`. Expected: zero Svelte diagnostics and all tests green.

- [ ] **Step 2: Verify the browser flow**

Start `npm run preview -- --host 127.0.0.1` and use the available Chromium/CDP browser fallback if `agent-browser` is unavailable. Check `/sandbox` setup, valid arbitrary lineup, automatic/manual start, `Simular`, Normal, Rápido, Ultra, map-to-map progression, bot result cards, Mirage gold canvas, schematic fallback and mobile layout. Check console errors and absence of overlays.

- [ ] **Step 3: Audit scope and commit**

Run `git diff --check`, `git status --short`, and verify `tests/simulator.html` is still untracked and unchanged. Do not stage it. Commit any final test-only fix separately in Portuguese.


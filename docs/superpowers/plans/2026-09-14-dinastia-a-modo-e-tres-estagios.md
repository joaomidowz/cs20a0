# Dinastia A: modo novo, Major de três estágios e premiação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o quarto modo "Dinastia": draft igual ao Normal, Major em três estágios suíços com campos por tier, entrada definida pelo Major anterior, premiação em dólar e "Próximo Major" mantendo o elenco, tudo salvo no save local.

**Architecture:** O motor de torneio (`tournament-engine.ts`) ganha `stageFields` com os campos dos três estágios e roda os suíços em sequência antes dos playoffs; sem `stageFields` ele se comporta exatamente como hoje (um teste dourado garante). Um módulo novo `src/lib/game/dynasty/` concentra premiação, estado da dinastia e montagem dos campos por tier. A página trata o modo como Normal para o draft e acrescenta cabeçalho, prêmio no resultado e o botão "Próximo Major".

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-09-14-dinastia-design.md`.

## Global Constraints

- Idioma: docs, textos de UI e mensagens de commit em pt-BR; identificadores em inglês. Commits `feat: assunto em pt-BR`, sem escopo e sem gitmoji, terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Gate único: `npm run validate` (svelte-check com 0 erros e 0 avisos, vitest, build do front e do servidor). Rodar `npx vitest run <arquivo>` por tarefa e `npm run validate` ao fechar cada tarefa que altera código de produção.
- Normal, Ranked, PRO, Sandbox e online **não mudam de comportamento**: a mesma seed produz o mesmo Major antes e depois (Task 1). Nenhum campo novo entra no JSON dos torneios sem `stageFields`, para não tocar o protocolo online 9.
- Dinheiro é inteiro em dólar. Nada de centavos, nada de ponto flutuante guardado.
- Save único `cs13a0-run-v1`; save antigo carrega; modo desconhecido cai para `premier`.
- Estágios: Stage 1 com 16 times (pools `underdog`, `dangerous-underdog`), Stage 2 com os 8 classificados mais 8 novos (`playoff-team`, `contender`), Stage 3 com os 8 classificados mais 8 lendas (`finalist`, `champion`, `S`, `S+`), depois playoffs. Novos entram como cabeças 1–8, classificados como 9–16. Gigantes caem um degrau com probabilidade 50% (1ª vaga) e 20% (2ª vaga).
- Entrada: 1º Major → Stage 1; eliminado no Stage 1 ou 2 → Stage 1; eliminado no Stage 3 → Stage 2; playoffs ou melhor → Stage 3 (Legend).
- Premiação: campeão 500.000; vice 170.000; 3º–4º 80.000; 5º–8º 45.000; eliminado no Stage 3 20.000; Stage 2 10.000; Stage 1 5.000. MVP do Major 50.000; cada outro prêmio individual (`clutchKing`, `highlightReel`) 15.000, só para jogadores do usuário.
- Fora desta entrega: coach, valor de jogador, janela, evolução, Rating 3.0 (entregas B, C e D da spec).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `tests/normalRunGolden.test.ts` (+ snapshot) | Congela uma run Normal por seed antes de mexer no motor. |
| `src/lib/game/types.ts` | `GameMode` com `dynasty`, `MajorStage`, `STAGE_PLACEMENT`, fases `stage1`/`stage2`, `stage` nas rodadas, `stages`/`entryStage` na run, `DynastyState`, `tier` no time. |
| `src/lib/game/online/contracts.ts` | `PublicRound.stage?`, `PublicTournament.stages?`. |
| `src/lib/game/i18n.ts` | Chaves novas do modo, estágios, colocações e cabeçalho. |
| `src/lib/game/dynasty/prizes.ts` | Tabela de premiação, bônus individuais, `formatUsd`. |
| `src/lib/game/dynasty/state.ts` | `createDynastyState`, `entryForPlacement`, `settleDynastyMajor`, `beginNextDynastyMajor`, `ensureDynastyState`. |
| `src/lib/game/dynasty/field.ts` | Pools por tier, gigantes que caem, `buildDynastyStageFields`. |
| `src/lib/game/online/tournament-engine.ts` | Suíços em sequência via `stageFields`; ids, seeds e colocações por estágio; `stages` no resultado. |
| `src/lib/game/simulation.ts` (`toMajorRun`) | `stages` e `entryStage` na run quando o torneio tem estágios. |
| `src/lib/game/majorAwards.ts` (`placementsOf`) | Colocação por estágio de saída. |
| `src/lib/game/campaign-major.ts` | Opção `dynastyEntryStage` monta os campos e cria o motor com estágios. |
| `src/lib/game/majorOverview.ts`, `src/lib/components/MajorOverview.svelte` | Classificação e grafo suíço por estágio, com seletor. |
| `src/lib/game/store.ts`, `src/lib/game/teamViews.ts`, `PlayerCard.svelte`, `DraftHud.svelte`, `PlayerDetailSheet.svelte`, `ShareRunCard.svelte` | Modo válido, atributos visíveis como no Normal, selo do modo no card. |
| `src/lib/components/DynastyHeader.svelte` | Cabeçalho: Major nº, status, entrada, títulos, caixa. |
| `src/routes/+page.svelte`, `src/app.css` | Card do modo, rótulos por estágio, prêmio e ações do resultado, "Próximo Major", "Encerrar dinastia". |

---

### Task 1: Teste dourado da run Normal

**Files:**
- Create: `tests/normalRunGolden.test.ts`
- Create (gerado pelo vitest): `tests/__snapshots__/normalRunGolden.test.ts.snap`

**Interfaces:**
- Consumes: `buildMajorRun` de `src/lib/game/simulation.ts`, `getTeamPlayers`/`players`/`teams` de `src/lib/game/data.ts`, `getDefaultMapSelection` de `src/lib/game/maps.ts`, `getEligibleSlotRoles` de `src/lib/game/roleRules.ts`.
- Produces: um snapshot que as Tasks 6 e 7 precisam manter verde sem ser atualizado.

- [ ] **Step 1: Escrever o teste**

```ts
// tests/normalRunGolden.test.ts
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { buildMajorRun } from '../src/lib/game/simulation';
import type { SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);

describe('run Normal (teste dourado)', () => {
  it('produz as mesmas séries, classificação e colocação para a mesma seed', () => {
    const run = buildMajorRun(roster, 'balanced', teams, players, 'dourado-normal-2026', lineup, { selectedMaps, mode: 'premier' });
    const digest = {
      placement: run.placement,
      champion: run.tournament?.championId,
      matches: run.matches.map((match) => [match.id, match.phase, match.scoreA, match.scoreB, match.winnerId]),
      standings: run.tournament?.standings.map((standing) => [standing.organizationId, standing.wins, standing.losses, standing.status]),
      // A run Normal nunca ganha estas chaves; se aparecerem, o protocolo online mudou sem querer.
      extraKeys: Object.keys(run).filter((key) => !['stage3', 'playoffs', 'matches', 'champion', 'placement', 'tournament'].includes(key)),
      roundKeys: Object.keys(run.tournament?.rounds[0] ?? {}).sort(),
      tournamentKeys: Object.keys(run.tournament ?? {}).sort()
    };
    expect(digest).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Rodar para gerar o snapshot**

Run: `npx vitest run tests/normalRunGolden.test.ts`
Expected: `1 passed`, e a linha `Snapshots  1 written`. O arquivo `tests/__snapshots__/normalRunGolden.test.ts.snap` aparece com `matches` (3 a 8 entradas), `roundKeys` = `["number","phase","series"]` e `tournamentKeys` = `["awards","championId","rounds","standings"]`.

- [ ] **Step 3: Rodar de novo para confirmar que é determinístico**

Run: `npx vitest run tests/normalRunGolden.test.ts`
Expected: `1 passed`, sem `written` nem `obsolete`.

- [ ] **Step 4: Commit**

```bash
git add tests/normalRunGolden.test.ts tests/__snapshots__/normalRunGolden.test.ts.snap
git commit -m "test: congela uma run Normal por seed antes do motor multiestágio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Tipos, contratos e i18n

**Files:**
- Modify: `src/lib/game/types.ts` (linhas 16, 207–232, 281–283, 323–327, 377–392, 415–438)
- Modify: `src/lib/game/online/contracts.ts` (linhas 2, 133–138, 199–207)
- Modify: `src/lib/game/i18n.ts` (bloco `pt` perto da linha 246; blocos `es` e `en`)
- Modify: `src/lib/game/rounds.ts` (`TIMEOUT_BONUS_BY_MODE` ganha `dynasty: 0.03`, igual ao Normal)
- Modify: `src/lib/game/online/i18n.ts` (`modePresentation` ganha `dynasty` nos três idiomas copiando `premier`; o schema zod das salas não aceita o modo, então nunca aparece online)
- Modify: `src/lib/game/sandbox/presentation.ts` (`SANDBOX_PHASE_LABELS` ganha `stage1: 'STAGE 1'` e `stage2: 'STAGE 2'`; `SANDBOX_PHASES` não muda)

**Interfaces:**
- Produces: `GameMode = 'premier' | 'faceit' | 'pro' | 'dynasty'`; `MajorStage`; `MAJOR_STAGES`; `STAGE_PLACEMENT`; `SeriesResult['phase']` com `stage1`/`stage2`; `MajorRound.stage?`; `MajorStageStandings`; `MajorTournament.stages?`; `MajorRun.stages?`/`entryStage?`; `DynastyStatus`, `DynastyMajorSummary`, `PlayerOverride`, `DynastyState`; `GameState.dynasty?`; `HistoricalTeam.tier?`; `PublicRound.stage?`; `PublicStageStandings`; `PublicTournament.stages?`; chaves i18n listadas abaixo.

- [ ] **Step 1: Tipos em `src/lib/game/types.ts`**

Trocar a linha 16:

```ts
export type GameMode = 'premier' | 'faceit' | 'pro' | 'dynasty';
```

Logo abaixo dela, acrescentar:

```ts
/** Swiss stages of a Major. Every mode but Dinastia plays only `stage3`. */
export type MajorStage = 'stage1' | 'stage2' | 'stage3';
export const MAJOR_STAGES: readonly MajorStage[] = ['stage1', 'stage2', 'stage3'];
/** Placement key of a team knocked out in each Swiss stage. */
export const STAGE_PLACEMENT: Readonly<Record<MajorStage, string>> = {
  stage1: 'placementStage1',
  stage2: 'placementStage2',
  stage3: 'placementStage3'
};
export const isMajorStage = (phase: string): phase is MajorStage => phase === 'stage1' || phase === 'stage2' || phase === 'stage3';
```

Em `HistoricalTeam` (linha 207), acrescentar depois de `rarity?: string | null;`:

```ts
  /** Strength tier from the dataset: underdog, dangerous-underdog, playoff-team, contender, finalist, champion, S, S+. */
  tier?: string | null;
```

Em `SeriesResult` (linha 283) trocar a fase:

```ts
  phase: MajorStage | 'quarterfinal' | 'semifinal' | 'final';
```

Em `MajorRound` (linha 323) acrescentar o estágio:

```ts
export interface MajorRound {
  number: number;
  phase: 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
  /** Swiss stage this round belongs to; only present in Majors with three stages (Dinastia). */
  stage?: MajorStage;
  series: SeriesResult[];
}
```

Em `MajorTournament` (linha 377) acrescentar antes de `awards`:

```ts
  /** Final (or current) table of every Swiss stage; only present in Majors with three stages. */
  stages?: MajorStageStandings[];
```

e logo antes de `MajorTournament` definir:

```ts
export interface MajorStageStandings {
  stage: MajorStage;
  standings: MajorStanding[];
}
```

Em `MajorRun` (linha 385):

```ts
export interface MajorRun {
  stage3: Stage3Result;
  playoffs?: PlayoffsResult;
  matches: SeriesResult[];
  champion: boolean;
  placement: string;
  tournament?: MajorTournament;
  /** Record of every Swiss stage the user played; only in Majors with three stages. */
  stages?: Partial<Record<MajorStage, Stage3Result>>;
  /** Stage the user's organization entered; only in Majors with three stages. */
  entryStage?: MajorStage;
}
```

Antes de `GameState` (linha 415) acrescentar o estado da dinastia:

```ts
export type DynastyStatus = 'challenger' | 'legend';

export interface DynastyMajorSummary {
  majorNumber: number;
  seed: string;
  entryStage: MajorStage;
  placement: string;
  /** Prize by placement, in whole dollars. */
  prize: number;
  /** MVP and individual award bonus, in whole dollars. */
  awardsBonus: number;
  lineup: SelectedPlayer[];
  coachId: string | null;
  movesMade: number;
  stats: PlayerRunStats[];
}

/** Attribute drift a Dinastia player carries over the dataset version (used from delivery C on). */
export interface PlayerOverride {
  drift: Partial<Record<'firepower' | 'clutch' | 'entry' | 'awp' | 'support' | 'consistency' | 'mental' | 'overall', number>>;
  driftTotal: number;
  versionsSince: string[];
}

export interface DynastyState {
  majorNumber: number;
  /** Whole dollars. */
  cash: number;
  coachId: string | null;
  status: DynastyStatus;
  entryStage: MajorStage;
  titles: number;
  history: DynastyMajorSummary[];
  playerOverrides: Record<string, PlayerOverride>;
  /** Transfer window in progress (delivery C); null outside the window. */
  window: unknown | null;
  /** Last majorNumber whose prize was already credited, so a reload never pays twice. */
  prizeCreditedFor: number;
}
```

Em `GameState` acrescentar depois de `stats: PlayerRunStats[];`:

```ts
  /** Present only while the mode is 'dynasty'. */
  dynasty?: DynastyState | null;
```

- [ ] **Step 2: Contratos em `src/lib/game/online/contracts.ts`**

Na linha 2, acrescentar `MajorStage` à lista importada de `'../types'`.

Trocar `PublicRound` (linha 133):

```ts
export interface PublicRound {
  number: number;
  phase: 'swiss' | 'quarterfinal' | 'semifinal' | 'final';
  /** Swiss stage of the round; only sent by Majors with three stages (never by online rooms today). */
  stage?: MajorStage;
  series: SeriesResult[];
  revealed: boolean;
}

export interface PublicStageStandings {
  stage: MajorStage;
  standings: PublicStanding[];
}
```

Em `PublicTournament` (linha 199) acrescentar depois de `liveCursor`:

```ts
  /** Table of every Swiss stage; only present in Majors with three stages. */
  stages?: PublicStageStandings[];
```

- [ ] **Step 3: Chaves i18n em `src/lib/game/i18n.ts`**

No bloco `pt`, logo depois da linha `,placementStage3: 'Eliminado no Stage 3'` (linha 246):

```ts
  ,placementStage1: 'Eliminado no Stage 1'
  ,placementStage2: 'Eliminado no Stage 2'
  ,stage1: 'Stage 1'
  ,stage2: 'Stage 2'
  ,dynasty: 'Dinastia'
  ,dynastyDesc: 'Atributos visíveis como no Normal. Comece no Stage 1, ganhe prêmios, vire Legend e siga com a mesma organização por vários Majors.'
  ,dynastyMajorNumber: 'Major'
  ,dynastyChallenger: 'Challenger'
  ,dynastyLegend: 'Legend'
  ,dynastyTitles: 'Títulos'
  ,dynastyCash: 'Caixa'
  ,dynastyPrize: 'Premiação'
  ,dynastyEntry: 'Entrada'
  ,dynastyNextMajor: 'Próximo Major'
  ,dynastyEnd: 'Encerrar dinastia'
  ,dynastyEndConfirm: 'Encerrar a dinastia apaga o histórico e o caixa. Continuar?'
  ,dynastyHistory: 'Histórico da dinastia'
  ,overviewStage: 'Estágio'
  ,overviewSwissWord: 'Suíço'
```

No bloco `es` (começa na linha 349, `es: {`), depois de `proDesc: ...`:

```ts
  placementStage1: 'Eliminado en el Stage 1', placementStage2: 'Eliminado en el Stage 2', stage1: 'Stage 1', stage2: 'Stage 2',
  dynasty: 'Dinastía', dynastyDesc: 'Atributos visibles como en Normal. Empieza en el Stage 1, gana premios, conviértete en Legend y sigue con la misma organización durante varios Majors.',
  dynastyMajorNumber: 'Major', dynastyChallenger: 'Challenger', dynastyLegend: 'Legend', dynastyTitles: 'Títulos', dynastyCash: 'Caja', dynastyPrize: 'Premio', dynastyEntry: 'Entrada',
  dynastyNextMajor: 'Próximo Major', dynastyEnd: 'Cerrar dinastía', dynastyEndConfirm: 'Cerrar la dinastía borra el historial y la caja. ¿Continuar?', dynastyHistory: 'Historial de la dinastía',
  overviewStage: 'Etapa', overviewSwissWord: 'Suizo',
```

No bloco `en` (linha 353, `en: {`), depois de `proDesc: ...`:

```ts
  placementStage1: 'Eliminated in Stage 1', placementStage2: 'Eliminated in Stage 2', stage1: 'Stage 1', stage2: 'Stage 2',
  dynasty: 'Dynasty', dynastyDesc: 'Attributes visible like Normal. Start in Stage 1, earn prize money, become a Legend and keep the same organization across Majors.',
  dynastyMajorNumber: 'Major', dynastyChallenger: 'Challenger', dynastyLegend: 'Legend', dynastyTitles: 'Titles', dynastyCash: 'Cash', dynastyPrize: 'Prize', dynastyEntry: 'Entry',
  dynastyNextMajor: 'Next Major', dynastyEnd: 'End dynasty', dynastyEndConfirm: 'Ending the dynasty erases its history and cash. Continue?', dynastyHistory: 'Dynasty history',
  overviewStage: 'Stage', overviewSwissWord: 'Swiss',
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`. Se `es`/`en` reclamarem de chave faltando, a chave não foi colocada nos três blocos.

- [ ] **Step 5: Testes continuam verdes**

Run: `npx vitest run`
Expected: todos passam (nenhum comportamento mudou).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/online/contracts.ts src/lib/game/i18n.ts
git commit -m "feat: tipos e textos do modo Dinastia, estágios do Major e estado da dinastia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Premiação (`dynasty/prizes.ts`)

**Files:**
- Create: `src/lib/game/dynasty/prizes.ts`
- Test: `tests/dynastyPrizes.test.ts`

**Interfaces:**
- Consumes: `MajorAwards`, `Language` de `src/lib/game/types.ts`.
- Produces: `PRIZE_BY_PLACEMENT`, `MVP_BONUS = 50_000`, `INDIVIDUAL_AWARD_BONUS = 15_000`, `prizeForPlacement(placement: string): number`, `awardsBonus(awards: MajorAwards | null | undefined, lineupPlayerIds: readonly string[]): number`, `formatUsd(value: number, language?: Language): string`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyPrizes.test.ts
import { describe, expect, it } from 'vitest';
import { awardsBonus, formatUsd, INDIVIDUAL_AWARD_BONUS, MVP_BONUS, prizeForPlacement } from '../src/lib/game/dynasty/prizes';
import type { MajorAwards, MajorPlayerAward } from '../src/lib/game/types';

const award = (playerId: string) => ({ playerId, name: playerId, teamId: 'user', teamName: 'Org' }) as unknown as MajorPlayerAward;

describe('premiação da Dinastia', () => {
  it('paga por saída, do campeão ao eliminado no Stage 1', () => {
    expect(prizeForPlacement('placementChampion')).toBe(500_000);
    expect(prizeForPlacement('placementRunnerUp')).toBe(170_000);
    expect(prizeForPlacement('placement3to4')).toBe(80_000);
    expect(prizeForPlacement('placement5to8')).toBe(45_000);
    expect(prizeForPlacement('placementStage3')).toBe(20_000);
    expect(prizeForPlacement('placementStage2')).toBe(10_000);
    expect(prizeForPlacement('placementStage1')).toBe(5_000);
    expect(prizeForPlacement('qualquer-coisa')).toBe(0);
  });

  it('soma MVP e prêmios individuais só dos jogadores do usuário', () => {
    const awards = { mvp: award('a'), topPlayers: [], topTeam: null, teams: [], clutchKing: award('b'), highlightReel: award('fora') } as unknown as MajorAwards;
    expect(awardsBonus(awards, ['a', 'b'])).toBe(MVP_BONUS + INDIVIDUAL_AWARD_BONUS);
    expect(awardsBonus(awards, ['b'])).toBe(INDIVIDUAL_AWARD_BONUS);
    expect(awardsBonus(awards, ['c'])).toBe(0);
    expect(awardsBonus(null, ['a'])).toBe(0);
    expect(awardsBonus(undefined, ['a'])).toBe(0);
  });

  it('um jogador que leva MVP e clutch king recebe os dois bônus', () => {
    const awards = { mvp: award('a'), topPlayers: [], topTeam: null, teams: [], clutchKing: award('a'), highlightReel: null } as unknown as MajorAwards;
    expect(awardsBonus(awards, ['a'])).toBe(65_000);
  });

  it('formata dólar inteiro por idioma', () => {
    expect(formatUsd(500_000, 'en')).toBe('$500,000');
    expect(formatUsd(0, 'en')).toBe('$0');
    expect(formatUsd(1_250_000, 'pt-BR')).toContain('1.250.000');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyPrizes.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/game/dynasty/prizes"`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/game/dynasty/prizes.ts
import type { Language, MajorAwards } from '../types';

/** Major prize money by placement key, in whole dollars (proportional to a real Major prize pool). */
export const PRIZE_BY_PLACEMENT: Readonly<Record<string, number>> = {
  placementChampion: 500_000,
  placementRunnerUp: 170_000,
  placement3to4: 80_000,
  placement5to8: 45_000,
  placementStage3: 20_000,
  placementStage2: 10_000,
  placementStage1: 5_000
};

export const MVP_BONUS = 50_000;
export const INDIVIDUAL_AWARD_BONUS = 15_000;

export const prizeForPlacement = (placement: string): number => PRIZE_BY_PLACEMENT[placement] ?? 0;

/** Bonus for the user's players: the Major MVP and every other individual award (clutch king, highlight reel). */
export function awardsBonus(awards: MajorAwards | null | undefined, lineupPlayerIds: readonly string[]): number {
  if (!awards) return 0;
  const mine = new Set(lineupPlayerIds);
  let bonus = 0;
  if (awards.mvp && mine.has(awards.mvp.playerId)) bonus += MVP_BONUS;
  for (const award of [awards.clutchKing, awards.highlightReel]) {
    if (award && mine.has(award.playerId)) bonus += INDIVIDUAL_AWARD_BONUS;
  }
  return bonus;
}

const LOCALES: Readonly<Record<Language, string>> = { 'pt-BR': 'pt-BR', es: 'es-ES', en: 'en-US' };

/** Whole-dollar currency label; the value is always an integer, so no decimals ever show. */
export const formatUsd = (value: number, language: Language = 'pt-BR'): string =>
  new Intl.NumberFormat(LOCALES[language], { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(value));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/dynastyPrizes.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/dynasty/prizes.ts tests/dynastyPrizes.test.ts
git commit -m "feat: premiação por colocação e bônus individuais da Dinastia

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Estado da dinastia (`dynasty/state.ts`)

**Files:**
- Create: `src/lib/game/dynasty/state.ts`
- Test: `tests/dynastyState.test.ts`

**Interfaces:**
- Consumes: `prizeForPlacement`, `awardsBonus` (Task 3); tipos da Task 2.
- Produces: `createDynastyState(): DynastyState`; `entryForPlacement(placement: string): { entryStage: MajorStage; status: DynastyStatus }`; `settleDynastyMajor(dynasty: DynastyState, run: MajorRun, input: { seed: string; lineup: SelectedPlayer[]; stats: PlayerRunStats[] }): DynastyState` (idempotente); `beginNextDynastyMajor(dynasty: DynastyState): DynastyState`; `ensureDynastyState(saved: unknown): DynastyState`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyState.test.ts
import { describe, expect, it } from 'vitest';
import { beginNextDynastyMajor, createDynastyState, ensureDynastyState, entryForPlacement, settleDynastyMajor } from '../src/lib/game/dynasty/state';
import type { MajorRun } from '../src/lib/game/types';

const run = (placement: string, champion = false): MajorRun =>
  ({ stage3: { wins: 0, losses: 0, qualified: false, matches: [] }, matches: [], champion, placement }) as MajorRun;
const input = { seed: 'abc123', lineup: [], stats: [] };

describe('estado da Dinastia', () => {
  it('começa no Stage 1 como Challenger, sem caixa', () => {
    expect(createDynastyState()).toMatchObject({ majorNumber: 1, cash: 0, status: 'challenger', entryStage: 'stage1', titles: 0, history: [], prizeCreditedFor: 0 });
  });

  it('decide a entrada do próximo Major pela colocação', () => {
    expect(entryForPlacement('placementStage1')).toEqual({ entryStage: 'stage1', status: 'challenger' });
    expect(entryForPlacement('placementStage2')).toEqual({ entryStage: 'stage1', status: 'challenger' });
    expect(entryForPlacement('placementStage3')).toEqual({ entryStage: 'stage2', status: 'challenger' });
    expect(entryForPlacement('placement5to8')).toEqual({ entryStage: 'stage3', status: 'legend' });
    expect(entryForPlacement('placementChampion')).toEqual({ entryStage: 'stage3', status: 'legend' });
  });

  it('credita o prêmio uma vez só, registra o Major e conta o título', () => {
    const settled = settleDynastyMajor(createDynastyState(), run('placementChampion', true), input);
    expect(settled.cash).toBe(500_000);
    expect(settled.titles).toBe(1);
    expect(settled.status).toBe('legend');
    expect(settled.entryStage).toBe('stage3');
    expect(settled.history).toHaveLength(1);
    expect(settled.history[0]).toMatchObject({ majorNumber: 1, seed: 'abc123', entryStage: 'stage1', placement: 'placementChampion', prize: 500_000, awardsBonus: 0 });
    expect(settled.prizeCreditedFor).toBe(1);
    expect(settleDynastyMajor(settled, run('placementChampion', true), input)).toBe(settled);
  });

  it('abre o próximo Major só depois de creditar o atual', () => {
    const fresh = createDynastyState();
    expect(() => beginNextDynastyMajor(fresh)).toThrow(/Settle/);
    const next = beginNextDynastyMajor(settleDynastyMajor(fresh, run('placementStage2'), input));
    expect(next.majorNumber).toBe(2);
    expect(next.entryStage).toBe('stage1');
    expect(next.cash).toBe(10_000);
  });

  it('normaliza um save quebrado ou antigo', () => {
    expect(ensureDynastyState(null)).toEqual(createDynastyState());
    expect(ensureDynastyState({ cash: -5, entryStage: 'stage9', status: 'x', majorNumber: 0, history: 'nope' })).toMatchObject({ cash: 0, entryStage: 'stage1', status: 'challenger', majorNumber: 1, history: [] });
    expect(ensureDynastyState({ cash: 20_000, entryStage: 'stage3', status: 'legend', majorNumber: 3, titles: 2, prizeCreditedFor: 2 })).toMatchObject({ cash: 20_000, entryStage: 'stage3', status: 'legend', majorNumber: 3, titles: 2, prizeCreditedFor: 2 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyState.test.ts`
Expected: FAIL, import não resolvido.

- [ ] **Step 3: Implementar**

```ts
// src/lib/game/dynasty/state.ts
import type { DynastyMajorSummary, DynastyState, DynastyStatus, MajorRun, MajorStage, PlayerRunStats, SelectedPlayer } from '../types';
import { awardsBonus, prizeForPlacement } from './prizes';

export const createDynastyState = (): DynastyState => ({
  majorNumber: 1,
  cash: 0,
  coachId: null,
  status: 'challenger',
  entryStage: 'stage1',
  titles: 0,
  history: [],
  playerOverrides: {},
  window: null,
  prizeCreditedFor: 0
});

/** Where the organization starts the next Major, given where the last one ended. Playoffs or better make it a Legend. */
export function entryForPlacement(placement: string): { entryStage: MajorStage; status: DynastyStatus } {
  if (placement === 'placementStage1' || placement === 'placementStage2') return { entryStage: 'stage1', status: 'challenger' };
  if (placement === 'placementStage3') return { entryStage: 'stage2', status: 'challenger' };
  return { entryStage: 'stage3', status: 'legend' };
}

export interface SettleInput {
  seed: string;
  lineup: SelectedPlayer[];
  stats: PlayerRunStats[];
}

/** Credits prize and bonus once, records the Major and decides the next entry. A second call for the same Major returns the same state. */
export function settleDynastyMajor(dynasty: DynastyState, run: MajorRun, input: SettleInput): DynastyState {
  if (dynasty.prizeCreditedFor >= dynasty.majorNumber) return dynasty;
  const prize = prizeForPlacement(run.placement);
  const bonus = awardsBonus(run.tournament?.awards, input.lineup.map((selected) => selected.playerId));
  const summary: DynastyMajorSummary = {
    majorNumber: dynasty.majorNumber,
    seed: input.seed,
    entryStage: dynasty.entryStage,
    placement: run.placement,
    prize,
    awardsBonus: bonus,
    lineup: input.lineup,
    coachId: dynasty.coachId,
    movesMade: 0,
    stats: input.stats
  };
  const next = entryForPlacement(run.placement);
  return {
    ...dynasty,
    cash: dynasty.cash + prize + bonus,
    titles: dynasty.titles + (run.champion ? 1 : 0),
    history: [...dynasty.history, summary],
    entryStage: next.entryStage,
    status: next.status,
    prizeCreditedFor: dynasty.majorNumber
  };
}

/** Opens the next Major of the dynasty. Only valid once the current one was settled. */
export function beginNextDynastyMajor(dynasty: DynastyState): DynastyState {
  if (dynasty.prizeCreditedFor < dynasty.majorNumber) throw new Error('Settle the current Major before starting the next one');
  return { ...dynasty, majorNumber: dynasty.majorNumber + 1, window: null };
}

const isStage = (value: unknown): value is MajorStage => value === 'stage1' || value === 'stage2' || value === 'stage3';
const positiveInt = (value: unknown, fallback: number, minimum: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : fallback;

/** A saved dynasty (possibly from an older build or edited by hand) comes back complete and inside its bounds. */
export function ensureDynastyState(saved: unknown): DynastyState {
  const base = createDynastyState();
  if (!saved || typeof saved !== 'object') return base;
  const raw = saved as Partial<Record<keyof DynastyState, unknown>>;
  return {
    ...base,
    majorNumber: positiveInt(raw.majorNumber, 1, 1),
    cash: typeof raw.cash === 'number' && Number.isFinite(raw.cash) ? Math.max(0, Math.round(raw.cash)) : 0,
    coachId: typeof raw.coachId === 'string' ? raw.coachId : null,
    status: raw.status === 'legend' ? 'legend' : 'challenger',
    entryStage: isStage(raw.entryStage) ? raw.entryStage : 'stage1',
    titles: positiveInt(raw.titles, 0, 0),
    history: Array.isArray(raw.history) ? (raw.history as DynastyMajorSummary[]) : [],
    playerOverrides: raw.playerOverrides && typeof raw.playerOverrides === 'object' ? (raw.playerOverrides as DynastyState['playerOverrides']) : {},
    window: null,
    prizeCreditedFor: positiveInt(raw.prizeCreditedFor, 0, 0)
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/dynastyState.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/dynasty/state.ts tests/dynastyState.test.ts
git commit -m "feat: estado da dinastia com entrada por colocação e crédito único do prêmio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Campos por estágio (`dynasty/field.ts`)

**Files:**
- Create: `src/lib/game/dynasty/field.ts`
- Test: `tests/dynastyField.test.ts`

**Interfaces:**
- Consumes: `calculateHistoricalTeamPower`, `createSeededRng` e o tipo `SeededRng` de `src/lib/game/simulation.ts`; `TournamentOrganization` de `src/lib/game/online/tournament-engine.ts`; `HistoricalTeam.tier` (Task 2).
- Produces: `STAGE_TIERS`, `STAGE_SIZE`, `FALLEN_GIANT_ODDS`, `stageOfTier(tier): MajorStage`, `DynastyStageFields = { stage1: TournamentOrganization[]; stage2: ...; stage3: ... }`, `buildDynastyStageFields({ teams, allPlayers, user, entryStage, seed }): DynastyStageFields`. A Task 6 exige `stage1` com 16, `stage2` e `stage3` com 8, sem id repetido, humano no estágio de entrada.

- [ ] **Step 1: Confirmar que `SeededRng` é exportado**

Run: `grep -n "export type SeededRng\|export interface SeededRng" src/lib/game/simulation.ts`
Expected: uma linha. Se não houver, acrescentar em `simulation.ts` logo antes de `createSeededRng`: `export type SeededRng = () => number;` (e manter a assinatura de `createSeededRng` retornando esse tipo).

- [ ] **Step 2: Teste que falha**

```ts
// tests/dynastyField.test.ts
import { describe, expect, it } from 'vitest';
import { players, teams } from '../src/lib/game/data';
import { buildDynastyStageFields, FALLEN_GIANT_ODDS, STAGE_TIERS, stageOfTier } from '../src/lib/game/dynasty/field';
import type { TournamentOrganization } from '../src/lib/game/online/tournament-engine';
import type { MajorStage } from '../src/lib/game/types';

const user: TournamentOrganization = { id: 'user', name: 'Sua Org', seed: 1, team: { id: 'user', name: 'Sua Org', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true }, human: true };
const tierOf = new Map(teams.map((team) => [team.id, team.tier ?? null]));
const build = (entryStage: MajorStage, seed = 'campo-1') => buildDynastyStageFields({ teams, allPlayers: players, user, entryStage, seed });

describe('campos por estágio da Dinastia', () => {
  it('classifica cada tier no estágio certo e tier desconhecido no Stage 1', () => {
    expect(stageOfTier('underdog')).toBe('stage1');
    expect(stageOfTier('contender')).toBe('stage2');
    expect(stageOfTier('S+')).toBe('stage3');
    expect(stageOfTier(null)).toBe('stage1');
    expect(FALLEN_GIANT_ODDS).toEqual([0.5, 0.2]);
  });

  it('monta 16, 8 e 8 sem repetir time e com o usuário no estágio de entrada', () => {
    for (const entry of ['stage1', 'stage2', 'stage3'] as const) {
      const fields = build(entry);
      expect(fields.stage1).toHaveLength(16);
      expect(fields.stage2).toHaveLength(8);
      expect(fields.stage3).toHaveLength(8);
      const ids = [...fields.stage1, ...fields.stage2, ...fields.stage3].map((organization) => organization.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(fields[entry].some((organization) => organization.id === 'user')).toBe(true);
      expect(ids.filter((id) => id === 'user')).toHaveLength(1);
    }
  });

  it('nunca desce um time mais de um degrau', () => {
    for (let index = 0; index < 30; index += 1) {
      const fields = build('stage1', `degrau-${index}`);
      for (const organization of fields.stage1) {
        if (organization.id === 'user') continue;
        expect(['stage1', 'stage2']).toContain(stageOfTier(tierOf.get(organization.id)));
      }
      for (const organization of fields.stage2) {
        expect(['stage2', 'stage3']).toContain(stageOfTier(tierOf.get(organization.id)));
      }
      for (const organization of fields.stage3) {
        expect(STAGE_TIERS.stage3).toContain(tierOf.get(organization.id) ?? '');
      }
    }
  });

  it('às vezes um gigante cai um degrau', () => {
    const seeds = Array.from({ length: 30 }, (_, index) => `gigante-${index}`);
    const fell = seeds.some((seed) => build('stage1', seed).stage1.some((organization) => stageOfTier(tierOf.get(organization.id)) === 'stage2'));
    expect(fell).toBe(true);
  });

  it('é determinístico pela seed', () => {
    const ids = (seed: string) => build('stage2', seed).stage3.map((organization) => organization.id);
    expect(ids('a')).toEqual(ids('a'));
    expect(ids('a')).not.toEqual(ids('b'));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyField.test.ts`
Expected: FAIL, import não resolvido.

- [ ] **Step 4: Implementar**

```ts
// src/lib/game/dynasty/field.ts
import type { TournamentOrganization } from '../online/tournament-engine';
import { calculateHistoricalTeamPower, createSeededRng, type SeededRng } from '../simulation';
import { MAJOR_STAGES, type HistoricalTeam, type MajorStage, type Player } from '../types';

/** Dataset tiers that feed each Swiss stage (Stage 1 is also the fallback for unknown tiers). */
export const STAGE_TIERS: Readonly<Record<MajorStage, readonly string[]>> = {
  stage1: ['underdog', 'dangerous-underdog'],
  stage2: ['playoff-team', 'contender'],
  stage3: ['finalist', 'champion', 'S', 'S+']
};

/** Organizations that join at each stage: 16 open Stage 1, 8 newcomers join the 8 qualified in Stages 2 and 3. */
export const STAGE_SIZE: Readonly<Record<MajorStage, number>> = { stage1: 16, stage2: 8, stage3: 8 };

/** Odds that a team from the pool one step up takes a slot in a weaker stage: one slot, then a second one. */
export const FALLEN_GIANT_ODDS = [0.5, 0.2] as const;

export interface DynastyStageFields {
  stage1: TournamentOrganization[];
  stage2: TournamentOrganization[];
  stage3: TournamentOrganization[];
}

export const stageOfTier = (tier: string | null | undefined): MajorStage => {
  for (const stage of MAJOR_STAGES) if (tier && STAGE_TIERS[stage].includes(tier)) return stage;
  return 'stage1';
};

const toOrganization = (team: HistoricalTeam, allPlayers: Player[]): TournamentOrganization => {
  const combat = calculateHistoricalTeamPower(team, allPlayers);
  return { id: team.id, name: combat.name, seed: 0, team: combat, human: false, sourceTeamId: team.id };
};

/** Removes and returns one random team of the pool (null when it is empty). Always consumes one rng draw when the pool is not empty. */
const draw = (pool: HistoricalTeam[], rng: SeededRng): HistoricalTeam | null => {
  if (!pool.length) return null;
  const index = Math.floor(rng() * pool.length);
  return pool.splice(index, 1)[0];
};

export function buildDynastyStageFields(options: {
  teams: HistoricalTeam[];
  allPlayers: Player[];
  user: TournamentOrganization;
  entryStage: MajorStage;
  seed: string;
}): DynastyStageFields {
  const rng = createSeededRng(`${options.seed}:dynasty-field`);
  const pools: Record<MajorStage, HistoricalTeam[]> = { stage1: [], stage2: [], stage3: [] };
  for (const team of options.teams) pools[stageOfTier(team.tier)].push(team);
  const fields: DynastyStageFields = { stage1: [], stage2: [], stage3: [] };
  for (const [index, stage] of MAJOR_STAGES.entries()) {
    const field = fields[stage];
    if (stage === options.entryStage) field.push(options.user);
    const stronger = MAJOR_STAGES[index + 1];
    const upper = stronger ? pools[stronger] : null;
    // Giants fall one step at most: a Stage 3 team can open in Stage 2, a Stage 2 team in Stage 1.
    if (upper) {
      for (const odds of FALLEN_GIANT_ODDS) {
        if (rng() >= odds) continue;
        const giant = draw(upper, rng);
        if (giant) field.push(toOrganization(giant, options.allPlayers));
      }
    }
    const weaker = MAJOR_STAGES[index - 1];
    while (field.length < STAGE_SIZE[stage]) {
      const team = draw(pools[stage], rng) ?? (upper ? draw(upper, rng) : null) ?? (weaker ? draw(pools[weaker], rng) : null);
      if (!team) throw new Error(`Not enough teams to fill ${stage}`);
      field.push(toOrganization(team, options.allPlayers));
    }
  }
  return fields;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/dynastyField.test.ts`
Expected: `5 passed`. Se "às vezes um gigante cai" falhar, o dataset local mudou; aumentar o número de seeds para 60 antes de suspeitar do código.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/dynasty/field.ts tests/dynastyField.test.ts
git commit -m "feat: campos do Major da Dinastia por tier, com gigantes que caem um degrau

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Motor de torneio com três estágios

**Files:**
- Modify: `src/lib/game/online/tournament-engine.ts` (linhas 3, 42–58, 60–77, 157–175, 180–211, 248–305, 307–350, 358–373)
- Test: `tests/tournamentEngineStages.test.ts`
- Regressão: `tests/tournamentEngine.test.ts`, `tests/onlineTournament.test.ts`, `tests/normalRunGolden.test.ts` continuam verdes sem atualizar snapshot.

**Interfaces:**
- Consumes: `MajorStage`, `STAGE_PLACEMENT` (Task 2); `PublicStageStandings` (Task 2).
- Produces: `TournamentEngineOptions.entryStage: MajorStage | 'playoffs'`; `TournamentEngineOptions.stageFields?: Record<MajorStage, TournamentOrganization[]>`; `TournamentRoundState.stage?`; `TournamentEngineState.stage`, `.stageResults`, `.participants`; `toResult()` devolve `stages` e `round.stage` **somente** quando há `stageFields`; ids das séries `stage1-r1-m1-<a>-<b>` (com estágios) e `swiss-r1-m1-<a>-<b>` (sem); colocações `placementStage1/2/3`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/tournamentEngineStages.test.ts
import { describe, expect, it } from 'vitest';
import { createTournamentEngine, type TournamentOrganization } from '../src/lib/game/online/tournament-engine';
import { runOnlineTournament } from '../src/lib/game/online/tournament';
import type { CombatTeam, MajorStage } from '../src/lib/game/types';

const organization = (id: string, power: number, human = false): TournamentOrganization => {
  const team: CombatTeam = { id, name: id.toUpperCase(), power, mental: 80, clutch: 80, experience: 80 };
  return { id, name: team.name, seed: 0, team, human };
};
const user = organization('user', 82, true);
const bots = (prefix: string, count: number, power: number) => Array.from({ length: count }, (_, index) => organization(`${prefix}-${index}`, power + (index % 5)));

const fields = (entry: MajorStage) => {
  const stage1 = bots('s1', entry === 'stage1' ? 15 : 16, 70);
  const stage2 = bots('s2', entry === 'stage2' ? 7 : 8, 80);
  const stage3 = bots('s3', entry === 'stage3' ? 7 : 8, 90);
  if (entry === 'stage1') stage1.unshift(user);
  if (entry === 'stage2') stage2.unshift(user);
  if (entry === 'stage3') stage3.unshift(user);
  return { stage1, stage2, stage3 };
};

const run = (entry: MajorStage, seed = 'estagios') =>
  runOnlineTournament({ organizations: [user], botPool: [], entryStage: entry, stageFields: fields(entry), seed });

describe('motor com três estágios', () => {
  it('joga três suíços de cinco rodadas e depois o mata-mata', () => {
    const result = run('stage1');
    expect(result.rounds.map((round) => round.phase)).toEqual([...Array(15).fill('swiss'), 'quarterfinal', 'semifinal', 'final']);
    expect(result.rounds.slice(0, 5).every((round) => round.stage === 'stage1')).toBe(true);
    expect(result.rounds.slice(5, 10).every((round) => round.stage === 'stage2')).toBe(true);
    expect(result.rounds.slice(10, 15).every((round) => round.stage === 'stage3')).toBe(true);
    expect(result.rounds[0].series[0].id).toMatch(/^stage1-r1-m1-/);
    expect(result.rounds[0].series.every((series) => series.phase === 'stage1')).toBe(true);
    expect(result.championId).toBeTruthy();
  });

  it('classifica 8 e elimina 8 em cada estágio; novos entram como cabeças 1 a 8', () => {
    const result = run('stage1');
    expect(result.stages).toHaveLength(3);
    for (const stage of result.stages ?? []) {
      expect(stage.standings).toHaveLength(16);
      expect(stage.standings.filter((standing) => standing.status === 'qualified' || standing.status === 'champion')).toHaveLength(8);
      expect(stage.standings.filter((standing) => standing.status === 'eliminated')).toHaveLength(8);
    }
    const stage2 = result.stages!.find((stage) => stage.stage === 'stage2')!;
    const newcomers = stage2.standings.filter((standing) => standing.organizationId.startsWith('s2-'));
    expect(newcomers.every((standing) => standing.seed <= 8)).toBe(true);
    const stage3Participants = new Set(result.stages!.find((stage) => stage.stage === 'stage3')!.standings.map((standing) => standing.organizationId));
    const stage2Qualified = stage2.standings.filter((standing) => standing.status !== 'eliminated').map((standing) => standing.organizationId);
    expect(stage2Qualified.every((id) => stage3Participants.has(id))).toBe(true);
  });

  it('dá colocação por estágio de saída para todo mundo', () => {
    const result = run('stage1');
    const placements = new Map(result.campaigns.map((campaign) => [campaign.organizationId, campaign.placement]));
    expect(placements.size).toBe(32);
    const counts = [...placements.values()].reduce<Record<string, number>>((acc, placement) => ({ ...acc, [placement]: (acc[placement] ?? 0) + 1 }), {});
    expect(counts.placementStage1).toBe(8);
    expect(counts.placementStage2).toBe(8);
    expect(counts.placementStage3).toBe(8);
    expect(counts.placement5to8).toBe(4);
    expect(counts.placement3to4).toBe(2);
    expect(counts.placementRunnerUp).toBe(1);
    expect(counts.placementChampion).toBe(1);
  });

  it('coloca o usuário no estágio de entrada e ele só joga a partir dali', () => {
    for (const entry of ['stage1', 'stage2', 'stage3'] as const) {
      const result = run(entry, `entrada-${entry}`);
      const userSeries = result.rounds.flatMap((round) => round.series).filter((series) => series.userMatch);
      expect(userSeries[0].phase).toBe(entry);
    }
  });

  it('é determinístico e valida os campos', () => {
    expect(JSON.stringify(run('stage2', 'igual'))).toBe(JSON.stringify(run('stage2', 'igual')));
    const broken = fields('stage1');
    broken.stage2 = broken.stage2.slice(0, 7);
    expect(() => createTournamentEngine({ organizations: [user], botPool: [], entryStage: 'stage1', stageFields: broken, seed: 'x' })).toThrow(/stage2 needs exactly 8/);
    const misplaced = fields('stage1');
    expect(() => createTournamentEngine({ organizations: [user], botPool: [], entryStage: 'stage3', stageFields: misplaced, seed: 'x' })).toThrow(/must be placed in stage3/);
    expect(() => createTournamentEngine({ organizations: [user], botPool: bots('b', 15, 70), entryStage: 'stage1', seed: 'x' })).toThrow(/require stageFields/);
  });

  it('sem stageFields o resultado não ganha chaves novas', () => {
    const legacy = runOnlineTournament({ organizations: [user], botPool: bots('b', 15, 75), entryStage: 'stage3', seed: 'legado' });
    expect('stages' in legacy).toBe(false);
    expect('stage' in legacy.rounds[0]).toBe(false);
    expect(legacy.rounds[0].series[0].id).toMatch(/^swiss-r1-m1-/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tournamentEngineStages.test.ts`
Expected: FAIL (erro de tipo em `stageFields` ou `Tournament requires 1-16 organizations`).

- [ ] **Step 3: Implementar no motor**

Linha 3, importar os tipos novos:

```ts
import { STAGE_PLACEMENT, type CombatTeam, type MajorStage, type SeriesResult } from '../types';
import type { PublicRound, PublicStageStandings, PublicStanding, PublicTournament } from './contracts';
```

Em `TournamentEngineOptions` (linha 45) trocar `entryStage` e acrescentar `stageFields`:

```ts
  entryStage: MajorStage | 'playoffs';
  /**
   * Dinastia: the three Swiss stages. `stage1` holds the 16 openers, `stage2` and `stage3` the 8 newcomers that join the
   * 8 qualified from the stage before. Humans must already sit in the stage they enter. Absent in every other mode.
   */
  stageFields?: Record<MajorStage, TournamentOrganization[]>;
```

`TournamentRoundState` (linha 60):

```ts
export interface TournamentRoundState {
  number: number;
  phase: PublicRound['phase'];
  /** Swiss stage of the round (always set for Swiss rounds; playoffs carry none). */
  stage?: MajorStage;
  series: LiveSeriesState[];
  complete: boolean;
}
```

`TournamentEngineState` (linha 67):

```ts
export interface TournamentEngineState {
  options: TournamentEngineOptions;
  field: TournamentOrganization[];
  byId: Map<string, TournamentOrganization>;
  standings: MutableStanding[];
  rounds: TournamentRoundState[];
  playoffField: TournamentOrganization[] | null;
  bracketWinners: TournamentOrganization[];
  championId: string | null;
  finished: boolean;
  /** Swiss stage in progress; null once the bracket field is set or when the tournament started in the playoffs. */
  stage: MajorStage | null;
  /** Final table of every Swiss stage already resolved. */
  stageResults: PublicStageStandings[];
  /** Every organization that takes part, across stages (equals `field` when there is a single stage). */
  participants: TournamentOrganization[];
}
```

`calculateCampaigns` (linha 157): trocar o cálculo de `placement`:

```ts
    const last = matches.at(-1);
    const stagePlacement = last && (last.phase in STAGE_PLACEMENT) ? STAGE_PLACEMENT[last.phase as MajorStage] : 'placementStage3';
    const placement = championId === organization.id
      ? 'placementChampion'
      : last?.phase === 'final' ? 'placementRunnerUp'
        : last?.phase === 'semifinal' ? 'placement3to4'
          : last?.phase === 'quarterfinal' ? 'placement5to8'
            : stagePlacement;
```

Substituir `createTournamentEngine` (linhas 180–211) por:

```ts
const freshStandings = (field: TournamentOrganization[], status: MutableStanding['status']): MutableStanding[] =>
  field.map((organization) => ({
    organizationId: organization.id,
    name: organization.name,
    seed: organization.seed,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status,
    opponents: []
  }));

const STAGE_SIZES: Readonly<Record<MajorStage, number>> = { stage1: 16, stage2: 8, stage3: 8 };
const nextStage = (stage: MajorStage): MajorStage | null => (stage === 'stage1' ? 'stage2' : stage === 'stage2' ? 'stage3' : null);

function createStagedEngine(options: TournamentEngineOptions, stageFields: Record<MajorStage, TournamentOrganization[]>): TournamentEngineState {
  for (const stage of ['stage1', 'stage2', 'stage3'] as const) {
    if (stageFields[stage].length !== STAGE_SIZES[stage]) throw new Error(`${stage} needs exactly ${STAGE_SIZES[stage]} organizations`);
  }
  const participants = [...stageFields.stage1, ...stageFields.stage2, ...stageFields.stage3];
  if (new Set(participants.map((organization) => organization.id)).size !== participants.length) throw new Error('An organization cannot appear twice in the Major');
  const entry: MajorStage = options.entryStage === 'playoffs' ? 'stage3' : options.entryStage;
  for (const human of options.organizations) {
    if (!stageFields[entry].some((organization) => organization.id === human.id)) throw new Error(`Human organization ${human.id} must be placed in ${entry}`);
  }
  const field = stageFields.stage1.map((organization, index) => ({ ...organization, seed: index + 1 }));
  return {
    options,
    field,
    byId: new Map(participants.map((organization) => [organization.id, organization])),
    standings: freshStandings(field, 'active'),
    rounds: [],
    playoffField: null,
    bracketWinners: [],
    championId: null,
    finished: false,
    stage: 'stage1',
    stageResults: [],
    participants
  };
}

export function createTournamentEngine(options: TournamentEngineOptions): TournamentEngineState {
  if (options.stageFields) return createStagedEngine(options, options.stageFields);
  if (options.entryStage === 'stage1' || options.entryStage === 'stage2') throw new Error('Stage 1 and Stage 2 entries require stageFields');
  const required = options.entryStage === 'stage3' ? 16 : 8;
  if (options.organizations.length < 1 || options.organizations.length > required) throw new Error(`Tournament requires 1-${required} organizations`);
  const humanIds = new Set(options.organizations.map((organization) => organization.id));
  const bots = options.botPool.filter((organization) => !humanIds.has(organization.id)).slice(0, required - options.organizations.length);
  if (bots.length !== required - options.organizations.length) throw new Error('Not enough bots to complete the tournament field');
  const rank = new Map((options.seedOrder ?? []).map((id, index) => [id, index]));
  const field = [...options.organizations, ...bots]
    .sort((left, right) => (rank.get(left.id) ?? Number.POSITIVE_INFINITY) - (rank.get(right.id) ?? Number.POSITIVE_INFINITY))
    .map((organization, index) => ({ ...organization, seed: index + 1 }));
  return {
    options,
    field,
    byId: new Map(field.map((organization) => [organization.id, organization])),
    standings: freshStandings(field, options.entryStage === 'stage3' ? 'active' : 'qualified'),
    rounds: [],
    playoffField: options.entryStage === 'playoffs' ? field : null,
    bracketWinners: [],
    championId: null,
    finished: false,
    stage: options.entryStage === 'stage3' ? 'stage3' : null,
    stageResults: [],
    participants: field
  };
}
```

Trocar `swissRoundCount` (linha 248) e o ramo suíço de `startNextRound` (linhas 256–271):

```ts
const swissRoundCount = (state: TournamentEngineState) =>
  state.rounds.filter((round) => round.phase === 'swiss' && round.stage === state.stage).length;

/** With three stages the ids and seeds carry the stage; the single-stage Major keeps the historical `swiss-` prefix untouched. */
const swissSeriesKeys = (state: TournamentEngineState, roundNumber: number, index: number, leftId: string, rightId: string) => {
  const staged = Boolean(state.options.stageFields);
  const prefix = staged ? state.stage! : 'swiss';
  return {
    id: `${prefix}-r${roundNumber}-m${index + 1}-${leftId}-${rightId}`,
    seed: `${state.options.seed}:${prefix}:${roundNumber}:${leftId}:${rightId}`
  };
};
```

```ts
  if (!state.playoffField) {
    if (!state.stage) throw new Error('No Swiss stage to play');
    const active = state.standings.filter((standing) => standing.status === 'active');
    const roundNumber = swissRoundCount(state) + 1;
    const stage = state.stage;
    const series = findPairings(active).map(([left, right], index) => {
      const bestOf: 1 | 3 = state.options.swissBestOf ?? 3;
      const keys = swissSeriesKeys(state, roundNumber, index, left.organizationId, right.organizationId);
      return createSeries(state, state.byId.get(left.organizationId)!, state.byId.get(right.organizationId)!, bestOf, stage, keys.id, keys.seed);
    });
    round = { number, phase: 'swiss', stage, series, complete: false };
  } else {
```

(O `else` que segue é o ramo dos playoffs de hoje, sem mudança. Remover a variável `seed` desestruturada na linha 254 se ficar sem uso no ramo suíço; o ramo dos playoffs continua usando `seed`, então mantenha `const { seed } = state.options;`.)

Em `completeRound` (linhas 327–333) trocar o fechamento do suíço:

```ts
    if (swissRoundCount(state) === SWISS_ROUNDS) {
      const qualified = state.standings.filter((standing) => standing.status === 'qualified').sort(standingOrder);
      if (qualified.length !== 8 || state.standings.filter((standing) => standing.status === 'eliminated').length !== 8) {
        throw new Error('Swiss stage did not resolve to eight qualified and eight eliminated organizations');
      }
      state.stageResults.push({ stage: state.stage!, standings: [...state.standings].sort(standingOrder).map(({ opponents: _opponents, ...standing }) => standing) });
      const following = state.options.stageFields ? nextStage(state.stage!) : null;
      if (following) {
        // Newcomers are the stronger group and take seeds 1–8; the qualified carry 9–16, so round one pairs legend against challenger.
        const newcomers = state.options.stageFields![following].map((organization, index) => ({ ...organization, seed: index + 1 }));
        const advancing = qualified.map((standing, index) => ({ ...state.byId.get(standing.organizationId)!, seed: newcomers.length + index + 1 }));
        const field = [...newcomers, ...advancing];
        for (const organization of field) state.byId.set(organization.id, organization);
        state.standings = freshStandings(field, 'active');
        state.stage = following;
      } else {
        state.playoffField = qualified.map((standing, index) => ({ ...state.byId.get(standing.organizationId)!, seed: index + 1 }));
      }
    }
```

Trocar `toPublicRound` e `toResult` (linhas 358–373):

```ts
const toPublicRound = (round: TournamentRoundState, staged: boolean): PublicRound =>
  ({ number: round.number, phase: round.phase, ...(staged && round.stage ? { stage: round.stage } : {}), series: round.series.map(toSeriesResult), revealed: true });

/** Everything simulated so far, including the round in progress (its unfinished series carry `winnerId: ''`). */
export function toResult(state: TournamentEngineState): OnlineTournamentResult {
  const staged = Boolean(state.options.stageFields);
  const rounds = state.rounds.map((round) => toPublicRound(round, staged));
  const completedRounds = rounds.filter((_, index) => state.rounds[index].complete);
  const current = [...state.standings].sort(standingOrder).map(({ opponents: _opponents, ...standing }) => standing);
  const stages: PublicStageStandings[] = [
    ...state.stageResults,
    ...(state.stage && !state.stageResults.some((result) => result.stage === state.stage) ? [{ stage: state.stage, standings: current }] : [])
  ];
  return {
    rounds,
    standings: current,
    championId: state.championId,
    currentRound: rounds.length,
    liveCursor: null,
    campaigns: calculateCampaigns(state.participants, completedRounds, state.championId),
    ...(staged ? { stages } : {})
  };
}
```

- [ ] **Step 4: Rodar os testes do motor**

Run: `npx vitest run tests/tournamentEngineStages.test.ts tests/tournamentEngine.test.ts tests/onlineTournament.test.ts tests/normalRunGolden.test.ts tests/sandboxMajor.test.ts`
Expected: todos passam; o dourado sem `written`/`obsolete`. Se o dourado falhar, algum id ou seed do caminho sem `stageFields` mudou: comparar com `swiss-r${n}-m${i}-` e `${seed}:swiss:${n}:`.

- [ ] **Step 5: Typecheck do servidor e do front**

Run: `npm run check && npm run server:build`
Expected: `0 ERRORS 0 WARNINGS` e o bundle do servidor gerado. `server/room-manager.ts` continua compilando porque `entryStage` do `RoomConfig` (`'stage3' | 'playoffs'`) cabe no tipo novo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/online/tournament-engine.ts tests/tournamentEngineStages.test.ts
git commit -m "feat: motor de torneio joga três estágios suíços em sequência com campos por estágio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Run, colocações e campanha com estágios

**Files:**
- Modify: `src/lib/game/simulation.ts` (`toMajorRun`, linhas 487–519)
- Modify: `src/lib/game/majorAwards.ts` (`placementsOf`, linhas 59–76)
- Modify: `src/lib/game/campaign-major.ts` (linhas 27–28, 62–67, 69–99)
- Test: `tests/campaignMajorStages.test.ts`
- Regressão: `tests/normalRunGolden.test.ts`, `tests/majorAwards.test.ts`, `tests/campaignMajor.test.ts`, `tests/majorOverview.test.ts`.

**Interfaces:**
- Consumes: `buildDynastyStageFields` (Task 5); motor da Task 6; `STAGE_PLACEMENT`, `isMajorStage`, `MAJOR_STAGES` (Task 2).
- Produces: `CampaignMajorOptions.dynastyEntryStage?: MajorStage`; `MajorRun.stages`/`entryStage` preenchidos quando o torneio tem estágios; `placementsOf` com `placementStage1/2`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/campaignMajorStages.test.ts
import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import {
  advanceCampaignMajor,
  autoDecideCampaign,
  campaignPlayedSeries,
  createCampaignMajor,
  getCampaignLiveView,
  pendingCampaignDecision,
  stepCampaignSeries,
  type CampaignMajorState
} from '../src/lib/game/campaign-major';
import type { MajorStage, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const create = (seed: string, dynastyEntryStage: MajorStage, played = {}) =>
  createCampaignMajor(roster, 'balanced', teams, players, seed, lineup, { selectedMaps, mode: 'dynasty', dynastyEntryStage, played });

const resolveAll = (state: CampaignMajorState, guard = 40) => {
  let next = state;
  for (let i = 0; i < guard && pendingCampaignDecision(next); i += 1) next = autoDecideCampaign(next);
  return next;
};
const playToEnd = (state: CampaignMajorState) => {
  let next = state;
  for (let series = 0; series < 25 && !next.finished; series += 1) {
    for (let round = 0; round < 600 && !getCampaignLiveView(next)?.finished; round += 1) {
      next = resolveAll(next);
      next = stepCampaignSeries(next);
    }
    next = advanceCampaignMajor(next);
  }
  return next;
};

describe('campanha da Dinastia em três estágios', () => {
  it('começa no Stage 1 e a run registra o estágio de entrada', () => {
    const major = create('dinastia-1', 'stage1');
    expect(major.run.entryStage).toBe('stage1');
    expect(major.run.placement).toBe('placementStage1');
    expect(major.run.tournament?.stages?.[0]).toMatchObject({ stage: 'stage1' });
    expect(major.run.tournament?.rounds[0]).toMatchObject({ phase: 'swiss', stage: 'stage1' });
  });

  it('joga até o fim com registro por estágio e colocação válida', () => {
    const finished = playToEnd(create('dinastia-fim', 'stage1'));
    expect(finished.finished).toBe(true);
    const { run } = finished;
    expect(run.stages?.stage1?.matches.length).toBeGreaterThanOrEqual(3);
    expect(run.stages?.stage1?.matches.length).toBeLessThanOrEqual(5);
    expect(['placementStage1', 'placementStage2', 'placementStage3', 'placement5to8', 'placement3to4', 'placementRunnerUp', 'placementChampion']).toContain(run.placement);
    if (run.stages?.stage1?.qualified) expect(run.stages.stage2?.matches.length).toBeGreaterThanOrEqual(3);
    else expect(run.stages?.stage2).toBeUndefined();
    expect(run.tournament?.rounds).toHaveLength(18);
    expect(run.tournament?.stages).toHaveLength(3);
    const phases = run.matches.map((match) => match.phase);
    const order = ['stage1', 'stage2', 'stage3', 'quarterfinal', 'semifinal', 'final'];
    expect([...phases].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(phases);
  });

  it('como Legend entra direto no Stage 3', () => {
    const major = create('dinastia-legend', 'stage3');
    expect(major.run.entryStage).toBe('stage3');
    expect(major.run.placement).toBe('placementStage3');
    // Stages 1 e 2 já resolvidos entre bots (5 + 5) mais a 1ª rodada do Stage 3 em andamento.
    expect(major.run.tournament?.rounds.filter((round) => round.phase === 'swiss')).toHaveLength(11);
    const live = getCampaignLiveView(major);
    expect(live).not.toBeNull();
    const current = major.run.tournament?.rounds.at(-1)?.series.find((series) => series.userMatch);
    expect(current?.phase).toBe('stage3');
  });

  it('restaura as séries jogadas exatamente', () => {
    let major = create('dinastia-restore', 'stage2');
    for (let series = 0; series < 2; series += 1) {
      for (let round = 0; round < 600 && !getCampaignLiveView(major)?.finished; round += 1) {
        major = resolveAll(major);
        major = stepCampaignSeries(major);
      }
      major = advanceCampaignMajor(major);
    }
    const played = campaignPlayedSeries(major);
    expect(Object.keys(played)).toHaveLength(2);
    const restored = create('dinastia-restore', 'stage2', played);
    expect(restored.restoredSeriesIds.sort()).toEqual(Object.keys(played).sort());
    expect(restored.run.matches.slice(0, 2).map((match) => [match.id, match.winnerId])).toEqual(major.run.matches.slice(0, 2).map((match) => [match.id, match.winnerId]));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/campaignMajorStages.test.ts`
Expected: FAIL, `dynastyEntryStage` não existe em `CampaignMajorOptions`.

- [ ] **Step 3: `toMajorRun` em `src/lib/game/simulation.ts`**

Acrescentar `MAJOR_STAGES`, `STAGE_PLACEMENT`, `isMajorStage` e `MajorStage` aos imports de `./types`, e substituir `toMajorRun` (linhas 487–519) por:

```ts
/** Turns a finished tournament into the campaign run the offline screens read. */
export function toMajorRun(tournament: OnlineTournamentResult, userId: string): MajorRun {
  const userSeries = tournament.rounds.flatMap((round) => round.series).filter((series) => series.userMatch).map((series) => orientSeriesToTeam(series, userId));
  const stageRecord = (stage: MajorStage): Stage3Result => {
    const matches = userSeries.filter((series) => series.phase === stage);
    const wins = matches.filter((series) => series.winnerId === userId).length;
    return { wins, losses: matches.length - wins, qualified: wins === 3, matches };
  };
  const staged = Boolean(tournament.stages);
  const playedStages = MAJOR_STAGES.filter((stage) => userSeries.some((series) => series.phase === stage));
  const entryStage = playedStages[0];
  const stage3 = stageRecord('stage3');
  const qualified = stage3.qualified;
  const champion = tournament.championId === userId;
  const placement = tournament.campaigns.find((campaign) => campaign.organizationId === userId)?.placement
    ?? (entryStage ? STAGE_PLACEMENT[entryStage] : 'placementStage3');
  // Awards look at the whole field, so they are computed before the non-user kill feeds are stripped below.
  const awards = computeMajorAwards(tournament.rounds, tournament.championId);
  const playoffs: PlayoffsResult | undefined = qualified
    ? {
      championId: tournament.championId ?? '',
      placement,
      userMatches: userSeries.filter((series) => !isMajorStage(series.phase)),
      allMatches: tournament.rounds.filter((round) => round.phase !== 'swiss').flatMap((round) => round.series.map((series) => series.userMatch ? series : stripSeriesDetails(series)))
    }
    : undefined;
  return {
    stage3,
    playoffs,
    matches: userSeries,
    champion,
    placement,
    ...(staged ? { stages: Object.fromEntries(playedStages.map((stage) => [stage, stageRecord(stage)])), entryStage } : {}),
    tournament: {
      // Only the user's matches keep their kill feeds: the whole field would not fit comfortably in localStorage.
      rounds: tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, ...(round.stage ? { stage: round.stage } : {}), series: round.series.map((series) => series.userMatch ? series : stripSeriesDetails(series)) })),
      standings: tournament.standings,
      championId: tournament.championId,
      awards,
      ...(tournament.stages ? { stages: tournament.stages } : {})
    }
  };
}
```

- [ ] **Step 4: `placementsOf` em `src/lib/game/majorAwards.ts`**

Importar `STAGE_PLACEMENT` e `MajorStage` de `./types` e substituir a função (linhas 59–76):

```ts
/** Placement of every team in the tournament (key form: placementChampion, placementRunnerUp, ...). */
export function placementsOf(rounds: AwardsRound[], championId: string | null): Map<string, string> {
  const placements = new Map<string, string>();
  for (const round of rounds) {
    for (const series of round.series) {
      if (!series.winnerId) continue;
      // Rounds come in order, so a team that climbs from Stage 1 to Stage 2 ends up with the later stage.
      const stagePlacement = series.phase in STAGE_PLACEMENT ? STAGE_PLACEMENT[series.phase as MajorStage] : null;
      for (const team of [series.teamA, series.teamB]) {
        if (stagePlacement) placements.set(team.id, stagePlacement);
        else if (!placements.has(team.id)) placements.set(team.id, 'placementStage3');
      }
      const loserId = series.winnerId === series.teamA.id ? series.teamB.id : series.teamA.id;
      if (series.phase === 'quarterfinal') placements.set(loserId, 'placement5to8');
      else if (series.phase === 'semifinal') placements.set(loserId, 'placement3to4');
      else if (series.phase === 'final') placements.set(loserId, 'placementRunnerUp');
    }
  }
  if (championId) placements.set(championId, 'placementChampion');
  return placements;
}
```

- [ ] **Step 5: `campaign-major.ts` com a opção de entrada**

Linha 27–28, imports:

```ts
import { buildDynastyStageFields } from './dynasty/field';
import { createMajorField, orientSeriesToTeam, toMajorRun } from './simulation';
import { STAGE_PLACEMENT, type GameMode, type HistoricalTeam, type MajorRun, type MajorStage, type MapId, type MapSide, type OrgStyle, type Player, type SelectedPlayer, type SeriesResult, type TimeoutTiming } from './types';
```

`CampaignMajorOptions` (linha 62):

```ts
export interface CampaignMajorOptions {
  selectedMaps?: MapId[];
  mode?: GameMode;
  /** Series already played in a saved campaign, restored instead of simulated again. */
  played?: Record<string, SeriesResult>;
  /** Dinastia: the Major runs three Swiss stages with fields by tier and the user enters at this stage. */
  dynastyEntryStage?: MajorStage;
}
```

Corpo de `createCampaignMajor` (linhas 78–99):

```ts
  const { user, field, mapContext, tournamentSeed } = createMajorField(players, style, teams, allPlayers, seed, lineup, options);
  const userOrganization = { id: user.id, name: user.name, seed: 1, team: user, human: true };
  const stageFields = options.dynastyEntryStage
    ? buildDynastyStageFields({ teams, allPlayers, user: userOrganization, entryStage: options.dynastyEntryStage, seed: tournamentSeed })
    : undefined;
  const engine = createTournamentEngine({
    organizations: [userOrganization],
    botPool: field,
    entryStage: options.dynastyEntryStage ?? 'stage3',
    ...(stageFields ? { stageFields } : {}),
    seed: tournamentSeed,
    mapContext,
    // 13a0: every offline series is BO3 except the BO5 final.
    swissBestOf: 3,
    controllerFor: (organization) => (organization.human ? 'human' : 'bot'),
    interactiveVeto: (left, right) => left.human || right.human
  });
  const played = options.played ?? {};
  const emptyStage = { wins: 0, losses: 0, qualified: false, matches: [] };
  const state: CampaignMajorState = {
    userTeamId: user.id,
    engine,
    confirmedSeriesIds: Object.keys(played),
    run: {
      stage3: emptyStage,
      matches: [],
      champion: false,
      placement: options.dynastyEntryStage ? STAGE_PLACEMENT[options.dynastyEntryStage] : 'placementStage3',
      ...(options.dynastyEntryStage ? { stages: {}, entryStage: options.dynastyEntryStage } : {})
    },
    restoredSeriesIds: [],
    finished: false
  };
  return settle(state, played);
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run tests/campaignMajorStages.test.ts tests/campaignMajor.test.ts tests/majorAwards.test.ts tests/majorOverview.test.ts tests/normalRunGolden.test.ts tests/runStats.test.ts tests/runCard.test.ts`
Expected: todos passam, dourado intacto. O teste "joga até o fim" leva alguns segundos (até 18 séries).

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/simulation.ts src/lib/game/majorAwards.ts src/lib/game/campaign-major.ts tests/campaignMajorStages.test.ts
git commit -m "feat: campanha da Dinastia roda o Major em três estágios com registro e colocação por estágio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Visão geral do Major por estágio

**Files:**
- Modify: `src/lib/game/majorOverview.ts` (linhas 10–14, 31–50, 190–239)
- Modify: `src/lib/components/MajorOverview.svelte` (script e o cabeçalho do painel suíço)
- Test: `tests/majorOverview.test.ts` (acrescentar um `describe`)

**Interfaces:**
- Consumes: `MajorRound.stage`, `MajorTournament.stages` (Task 2); `SegmentedControl` (`value`, `options`, `label`, `onChange(value: string)`).
- Produces: `OverviewRound.stage?`; `computeStandings(tournament, revealedRounds, stage: MajorStage | null = null)`; `swissRoundsOf(rounds: OverviewRound[], stage: MajorStage | null): OverviewRound[]`.

- [ ] **Step 1: Teste que falha**

Acrescentar ao fim de `tests/majorOverview.test.ts`:

```ts
import { getTeamPlayers } from '../src/lib/game/data';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createCampaignMajor } from '../src/lib/game/campaign-major';
import { swissRoundsOf } from '../src/lib/game/majorOverview';

describe('visão geral com três estágios', () => {
  const roster = getTeamPlayers(teams[0]).slice(0, 5);
  const lineup = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' as const }));
  const staged = createCampaignMajor(roster, 'balanced', teams, players, 'overview-estagios', lineup, { selectedMaps: getDefaultMapSelection(roster, teams), mode: 'dynasty', dynastyEntryStage: 'stage3' }).run.tournament as MajorTournament;

  it('filtra as rodadas suíças por estágio e mantém os playoffs', () => {
    const revealed = revealRounds(staged.rounds, { liveSeriesId: null, complete: true });
    expect(swissRoundsOf(revealed, 'stage1').filter((round) => round.phase === 'swiss')).toHaveLength(5);
    expect(swissRoundsOf(revealed, 'stage1').every((round) => round.phase !== 'swiss' || round.stage === 'stage1')).toBe(true);
    expect(swissRoundsOf(revealed, null)).toEqual(revealed);
  });

  it('classifica um estágio só com os 16 times dele', () => {
    const revealed = revealRounds(staged.rounds, { liveSeriesId: null, complete: true });
    const stage1 = computeStandings(staged, countCompletedRounds(revealed), 'stage1');
    expect(stage1).toHaveLength(16);
    expect(stage1.filter((standing) => standing.status === 'eliminated')).toHaveLength(8);
    expect(stage1.some((standing) => standing.organizationId === 'user')).toBe(false);
    const stage3 = computeStandings(staged, countCompletedRounds(revealed), 'stage3');
    expect(stage3.some((standing) => standing.organizationId === 'user')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/majorOverview.test.ts`
Expected: FAIL, `swissRoundsOf` não exportado.

- [ ] **Step 3: `majorOverview.ts`**

Importar `MajorStage` de `./types`. Em `OverviewRound` (linha 10) acrescentar `stage?: MajorStage;` depois de `phase`. Em `revealRounds` (linhas 32 e 46) incluir o estágio nos dois objetos devolvidos: `{ number: round.number, phase: round.phase, ...(round.stage ? { stage: round.stage } : {}), series: ... }`.

Acrescentar depois de `revealRounds`:

```ts
/** Swiss rounds of one stage plus every playoff round; with `null` returns the rounds untouched (single-stage Majors). */
export const swissRoundsOf = (rounds: OverviewRound[], stage: MajorStage | null): OverviewRound[] =>
  stage ? rounds.filter((round) => round.phase !== 'swiss' || round.stage === stage) : rounds;
```

Substituir a assinatura e o início de `computeStandings` (linhas 191–202):

```ts
export function computeStandings(tournament: MajorTournament, revealedRounds: number, stage: MajorStage | null = null): MajorStanding[] {
  const base = (stage ? tournament.stages?.find((item) => item.stage === stage)?.standings : null) ?? tournament.standings;
  const lastStage = tournament.stages?.at(-1)?.stage ?? null;
  const standings = base.map((standing): MajorStanding & { opponents: string[] } => ({
    ...standing,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status: tournament.rounds[0]?.phase === 'swiss' ? 'active' : 'qualified',
    placement: null,
    opponents: []
  }));
  const byId = new Map(standings.map((standing) => [standing.organizationId, standing]));
  for (const round of tournament.rounds.slice(0, Math.max(0, revealedRounds))) {
    if (stage && round.phase === 'swiss' && round.stage !== stage) continue;
    if (stage && round.phase !== 'swiss' && stage !== lastStage) continue;
```

O restante da função (o `for` interno e a ordenação) fica igual.

- [ ] **Step 4: `MajorOverview.svelte`**

No `<script>`, acrescentar os imports e o estado do estágio:

```ts
  import SegmentedControl from './SegmentedControl.svelte';
  import { buildBracket, buildSwissGraph, computeStandings, countCompletedRounds, revealRounds, swissRoundsOf, type RevealCursor } from '$lib/game/majorOverview';
  import type { Language, MajorStage, MajorTournament } from '$lib/game/types';
```

```ts
  let selectedStage: MajorStage | null = null;
  let followedStage: MajorStage | null = null;
  $: stageOptions = tournament?.stages?.map((item) => item.stage) ?? [];
  $: multiStage = stageOptions.length > 1;
  // The stage of the live series (or the last revealed one) is the default; the viewer can look back at earlier stages.
  $: liveStage = (revealed.find((round) => round.series.some((entry) => entry.status === 'live')) ?? [...revealed].reverse().find((round) => round.phase === 'swiss'))?.stage ?? stageOptions.at(-1) ?? null;
  $: if (liveStage !== followedStage) { followedStage = liveStage; selectedStage = liveStage; }
  $: activeStage = multiStage ? selectedStage : null;
```

Trocar as linhas de `swiss`, `showBracket` e `standings`:

```ts
  $: swiss = buildSwissGraph(swissRoundsOf(revealed, activeStage));
  $: showBracket = playoffRounds.length > 0 || (swiss.done && (!activeStage || activeStage === stageOptions.at(-1)));
  $: standings = tournament ? computeStandings(tournament, countCompletedRounds(revealed), activeStage) : [];
```

No markup, dentro de `<header class="overview-head">` do painel suíço, trocar o `<span class="eyebrow">` por:

```svelte
<span class="eyebrow">{activeStage ? `${t(activeStage)} · ${t('overviewSwissWord')}` : t('overviewSwiss')}{#if swiss.done} · {language === 'en' ? 'COMPLETE' : language === 'es' ? 'COMPLETO' : 'CONCLUÍDO'}{/if}</span>
{#if multiStage}
  <SegmentedControl value={selectedStage ?? ''} label={t('overviewStage')} options={stageOptions.map((stage) => ({ value: stage, label: t(stage) }))} onChange={(value) => { selectedStage = value as MajorStage; }} />
{/if}
```

- [ ] **Step 5: Rodar testes e typecheck**

Run: `npx vitest run tests/majorOverview.test.ts && npm run check`
Expected: testes passam; `0 ERRORS 0 WARNINGS`. Se o `svelte-check` reclamar do `as MajorStage` no markup, mover para uma função no script: `const pickStage = (value: string) => { selectedStage = value as MajorStage; };` e usar `onChange={pickStage}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/majorOverview.ts src/lib/components/MajorOverview.svelte tests/majorOverview.test.ts
git commit -m "feat: visão geral do Major mostra grafo suíço e classificação por estágio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Modo válido, card na fila e atributos visíveis

**Files:**
- Modify: `src/lib/game/store.ts` (linhas 10, 24–46, 49, 75, 170–175)
- Modify: `src/lib/game/teamViews.ts` (linhas 11–12)
- Modify: `src/lib/components/PlayerCard.svelte` (linhas 15, 17), `src/lib/components/DraftHud.svelte` (linha 45), `src/lib/components/PlayerDetailSheet.svelte` (linha 26), `src/lib/components/ShareRunCard.svelte` (linha 35)
- Modify: `src/routes/+page.svelte` (linhas 233, 297–318, 864–874)
- Modify: `src/app.css` (regras `.mode-card.pro`, `.mode-grid`)
- Test: `tests/teamViews.test.ts` (acrescentar um caso)

**Interfaces:**
- Consumes: `createDynastyState`, `ensureDynastyState` (Task 4).
- Produces: `showsFullIntel(mode: GameMode | null | undefined): boolean` em `teamViews.ts`; `GameState.dynasty` criado em `chooseMode('dynasty')`.

- [ ] **Step 1: Teste que falha (teamViews)**

Acrescentar em `tests/teamViews.test.ts`, dentro do `describe` existente (ou num novo):

```ts
import { showsFullIntel } from '../src/lib/game/teamViews';

it('a Dinastia mostra atributos como o Normal', () => {
  expect(showsFullIntel('premier')).toBe(true);
  expect(showsFullIntel('dynasty')).toBe(true);
  expect(showsFullIntel('faceit')).toBe(false);
  expect(showsFullIntel('pro')).toBe(false);
  expect(showsFullIntel(null)).toBe(false);
});
```

Run: `npx vitest run tests/teamViews.test.ts` → FAIL (`showsFullIntel` não exportado).

- [ ] **Step 2: `teamViews.ts`**

Trocar as linhas 11–12:

```ts
/** Normal and Dinastia show numbers, rarity and awards during the draft; Ranked and PRO hide them until the reveal. */
export const showsFullIntel = (mode: GameMode | null | undefined) => mode === 'premier' || mode === 'dynasty';

export const shouldShowPlayerAwards = (mode: GameMode | null | undefined, context: 'game' | 'teams' = 'game') =>
  context === 'teams' || showsFullIntel(mode);
```

- [ ] **Step 3: Componentes**

`PlayerCard.svelte`: importar `import { showsFullIntel } from '$lib/game/teamViews';` e trocar as linhas 15 e 17 por `$: showNumbers = showsFullIntel(mode) || revealed;` e `$: showRarity = showsFullIntel(mode) || revealed;`.

`DraftHud.svelte`: importar `showsFullIntel` e trocar na linha 45 `mode === 'premier' || revealed` por `showsFullIntel(mode) || revealed`.

`PlayerDetailSheet.svelte`: importar `showsFullIntel` e trocar na linha 26 `mode === 'premier' || draftComplete` por `showsFullIntel(mode) || draftComplete`.

`ShareRunCard.svelte`, linha 35:

```ts
  $: modeFlag = mode === 'pro' ? 'PRO MODE' : mode === 'faceit' ? 'RANKED' : mode === 'dynasty' ? 'DINASTIA' : '';
```

- [ ] **Step 4: `store.ts`**

Linha 10, importar o estado da dinastia:

```ts
import { createDynastyState, ensureDynastyState } from './dynasty/state';
import type { GameMode, GameState, LineupSlotRole, MapId, OrgStyle } from './types';
```

Em `defaultState` acrescentar `dynasty: null` depois de `stats: []`. Linha 49:

```ts
const gameModes = new Set<GameMode>(['premier', 'faceit', 'pro', 'dynasty']);
```

Linha 75 (link compartilhado não reproduz a Dinastia: o replay em lote roda um estágio só):

```ts
  const mode = modeParam && gameModes.has(modeParam) && modeParam !== 'dynasty' ? modeParam : 'premier';
```

Em `loadState`, logo antes do `return` final (linha 170), normalizar:

```ts
    if (parsed.mode && !gameModes.has(parsed.mode)) parsed.mode = 'premier';
    parsed.dynasty = parsed.mode === 'dynasty' ? ensureDynastyState(parsed.dynasty) : null;
```

Em `chooseMode` da página (linha 297), acrescentar ao objeto do `update`:

```ts
      dynasty: mode === 'dynasty' ? createDynastyState() : null,
```

e importar `createDynastyState` de `$lib/game/dynasty/state` no topo do script da página.

- [ ] **Step 5: Card na fila e CSS**

Linha 233 da página:

```ts
  $: rerollsMax = $game.mode === 'premier' || $game.mode === 'dynasty' ? 3 : $game.mode === 'faceit' ? 1 : $game.mode === 'pro' ? PRO_REROLLS_MAX : 0;
```

Depois do card `pro` (linha 873), acrescentar:

```svelte
        <button class="mode-card dynasty" type="button" on:click={() => chooseMode('dynasty')}>
          <span class="mode-number">04</span><span class="mode-icon">D</span><h2>{t('dynasty')}</h2><p>{t('dynastyDesc')}</p><b>LEGACY RUN →</b>
        </button>
```

Em `src/app.css`: depois de `.mode-card.pro .mode-icon{...}` acrescentar `.mode-card.dynasty .mode-icon{border-color:#d9a441;color:#d9a441}`; depois de `.mode-card.pro b{color:#f2c94c}` acrescentar `.mode-card.dynasty b{color:#d9a441}`; trocar `.mode-grid{grid-template-columns:repeat(3,1fr)}` por `.mode-grid{grid-template-columns:repeat(2,1fr)}` e acrescentar ao fim do arquivo `@media (min-width:1100px){.mode-grid{grid-template-columns:repeat(4,1fr)}}`.

- [ ] **Step 6: Verificar**

Run: `npx vitest run tests/teamViews.test.ts && npm run check`
Expected: testes passam; `0 ERRORS 0 WARNINGS`.

Run: `npm run dev` e abrir `http://localhost:5173`: Jogar → fila mostra 4 cards; escolher Dinastia → draft com atributos visíveis, 3 ressorteios; recarregar a página mantém o modo. Parar o servidor.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/store.ts src/lib/game/teamViews.ts src/lib/components/PlayerCard.svelte src/lib/components/DraftHud.svelte src/lib/components/PlayerDetailSheet.svelte src/lib/components/ShareRunCard.svelte src/routes/+page.svelte src/app.css tests/teamViews.test.ts
git commit -m "feat: modo Dinastia na fila com draft e atributos iguais ao Normal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Página: Major em três estágios, prêmio, "Próximo Major" e cabeçalho

**Files:**
- Create: `src/lib/components/DynastyHeader.svelte`
- Modify: `src/routes/+page.svelte` (imports; linhas 162–180, 249–260, 485–501, 517–535, 683–697, 709–735, 735–745, 789–796, 824–826, 1135, 1293–1352)

**Interfaces:**
- Consumes: `settleDynastyMajor`, `beginNextDynastyMajor` (Task 4); `formatUsd`, `prizeForPlacement`, `awardsBonus` (Task 3); `CampaignMajorOptions.dynastyEntryStage` (Task 7); `isMajorStage`, `MAJOR_STAGES` (Task 2).
- Produces: componente `DynastyHeader` (`dynasty: DynastyState`, `language: Language`); funções `settleDynastyIfNeeded()`, `startNextDynastyMajor()`, `endDynasty()` na página.

- [ ] **Step 1: Componente do cabeçalho**

```svelte
<!-- src/lib/components/DynastyHeader.svelte -->
<script lang="ts">
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { translate } from '$lib/game/i18n';
  import type { DynastyState, Language } from '$lib/game/types';

  export let dynasty: DynastyState;
  export let language: Language = 'pt-BR';

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
</script>

<div class="dynasty-bar" role="status">
  <span class="eyebrow">DINASTIA</span>
  <strong>{t('dynastyMajorNumber')} #{dynasty.majorNumber}</strong>
  <span class="pill" class:legend={dynasty.status === 'legend'}>{dynasty.status === 'legend' ? t('dynastyLegend') : t('dynastyChallenger')} · {t('dynastyEntry')} {t(dynasty.entryStage)}</span>
  <span>{t('dynastyTitles')} <b>{dynasty.titles}</b></span>
  <span>{t('dynastyCash')} <b>{formatUsd(dynasty.cash, language)}</b></span>
</div>

<style>
  .dynasty-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--line); background: var(--surface); font-size: .78rem; }
  .dynasty-bar strong { font-size: .95rem; }
  .dynasty-bar b { color: var(--accent); }
  .pill { padding: 2px 8px; border: 1px solid var(--line); color: var(--muted); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; font-size: .62rem; }
  .pill.legend { border-color: #d9a441; color: #d9a441; }
</style>
```

- [ ] **Step 2: Imports e derivados na página**

No topo do `<script>` de `src/routes/+page.svelte`:

```ts
  import DynastyHeader from '$lib/components/DynastyHeader.svelte';
  import { awardsBonus, formatUsd, prizeForPlacement } from '$lib/game/dynasty/prizes';
  import { beginNextDynastyMajor, createDynastyState, settleDynastyMajor } from '$lib/game/dynasty/state';
  import { isMajorStage, MAJOR_STAGES, type MajorRun, type MajorStage } from '$lib/game/types';
```

(Se `MajorRun` já estiver importado do mesmo módulo, só acrescentar `isMajorStage`, `MAJOR_STAGES` e `MajorStage` à lista existente.)

Depois de `$: isProMode = $game.mode === 'pro';` (linha 222):

```ts
  $: isDynasty = $game.mode === 'dynasty';
```

Trocar as linhas 258–260 pelo registro do estágio ao vivo:

```ts
  $: liveStage = currentSeries && isMajorStage(currentSeries.phase) ? currentSeries.phase : null;
  $: stageWins = completedMatches.filter((match) => match.phase === (liveStage ?? 'stage3') && match.winnerId === 'user').length;
  $: stageLosses = completedMatches.filter((match) => match.phase === (liveStage ?? 'stage3') && match.winnerId !== 'user').length;
  $: hasStageRecord = stageWins + stageLosses > 0;
```

- [ ] **Step 3: Rótulos por estágio**

Em `getPhaseLabel` (linha 162) acrescentar `stage1: t('stage1'), stage2: t('stage2'),` antes de `stage3`. Em `groupMatchesByPhase` (linha 174):

```ts
    const phaseOrder: SeriesResult['phase'][] = ['stage1', 'stage2', 'stage3', 'quarterfinal', 'semifinal', 'final'];
```

Substituir `phaseLabel` (linhas 789–796):

```ts
  function phaseLabel() {
    if (currentSeries && isMajorStage(currentSeries.phase)) return hasStageRecord ? `${t(currentSeries.phase)} · ${stageWins}-${stageLosses}` : t(currentSeries.phase);
    if (currentSeries?.phase === 'quarterfinal') return t('quarterfinal');
    if (currentSeries?.phase === 'semifinal') return t('semifinal');
    if (currentSeries?.phase === 'final') return t('final');
    if ($game.phase === 'stage3') return hasStageRecord ? `${t(liveStage ?? 'stage3')} · ${stageWins}-${stageLosses}` : t(liveStage ?? 'stage3');
    return t('playoffs');
  }
```

Em `advanceSeries` (linha 693) trocar a fase de destino:

```ts
    update({ completedSeries: nextIndex, phase: isMajorStage(next.phase) ? 'stage3' : 'playoffs' });
```

- [ ] **Step 4: Campos por entrada no `launchMajor` e no `restoreCampaign`**

Nas duas chamadas de `createCampaignMajor` (linhas 490 e 526), acrescentar às opções:

```ts
      ...(isDynasty && $game.dynasty ? { dynastyEntryStage: $game.dynasty.entryStage } : {}),
```

- [ ] **Step 5: Crédito do prêmio e próximo Major**

Depois de `resetRun` (linha 718), acrescentar:

```ts
  /** Credits the prize of the finished Major once (also after a reload straight into the result screen). */
  function settleDynastyIfNeeded(): void {
    const run = $game.majorRun;
    if (!isDynasty || !$game.dynasty || !run || $game.phase !== 'result') return;
    if ($game.dynasty.prizeCreditedFor >= $game.dynasty.majorNumber) return;
    update({ dynasty: settleDynastyMajor($game.dynasty, run, { seed: $game.seed, lineup: selectedLineup, stats: $game.stats }) });
  }

  /** Keeps the lineup, opens the next Major of the dynasty and lets the user revisit the map pool before Stage 1/2/3. */
  function startNextDynastyMajor() {
    if (!isDynasty || !$game.dynasty || selectedLineup.length !== 5) return;
    settleDynastyIfNeeded();
    const dynasty = beginNextDynastyMajor($game.dynasty);
    resetSupportNudge();
    closePlayer();
    closeEnemyTeam();
    clearAdvanceTimer();
    stopLiveTick();
    awaitingAdvance = false;
    autoPausedHalf = '';
    campaign = null;
    resultStatsOpen = false;
    update({ dynasty, seed: makeSeed(), majorRun: null, playedSeries: {}, stats: [], completedSeries: 0, phase: 'map-selection' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function endDynasty() {
    if (window.confirm(t('dynastyEndConfirm'))) resetRun(true);
  }

  const stageEntries = (run: MajorRun) => MAJOR_STAGES.filter((stage) => run.stages?.[stage]).map((stage) => ({ stage, record: run.stages![stage]! }));
```

Em `advanceSeries`, no ramo sem próxima série (linha 690), creditar depois de ir ao resultado:

```ts
    if (!next) {
      update({ completedSeries: nextIndex, phase: 'result' });
      settleDynastyIfNeeded();
      return;
    }
```

No `onMount` que chama `restoreCampaign()` (linha 204), acrescentar `settleDynastyIfNeeded();` logo depois de `restoreCampaign();`.

Em `copyLink` (linha 739), a Dinastia não gera link de resultado:

```ts
    if (($game.phase === 'result' || $game.phase === 'stats') && $game.majorRun && selectedLineup.length === 5 && !isDynasty) {
```

- [ ] **Step 6: Cabeçalho no markup**

Depois do bloco `{#if $game.phase !== 'home' && ...}<div class="offline-settings shell">...</div>{/if}` (linhas 824–826):

```svelte
  {#if isDynasty && $game.dynasty && $game.phase !== 'home' && $game.phase !== 'mode-select'}
    <div class="shell"><DynastyHeader dynasty={$game.dynasty} language={$game.language} /></div>
  {/if}
```

- [ ] **Step 7: Tela de resultado**

Na `campaign-grid` (linha 1301), trocar o primeiro `<article>` (`STAGE 3`) por:

```svelte
{#if run.stages}{#each stageEntries(run) as entry (entry.stage)}<article><small>{t(entry.stage).toUpperCase()}</small><strong>{entry.record.wins}-{entry.record.losses}</strong></article>{/each}{:else}<article><small>STAGE 3</small><strong>{run.stage3.wins}-{run.stage3.losses}</strong></article>{/if}{#if isDynasty}<article><small>{t('dynastyPrize')}</small><strong>{formatUsd(prizeForPlacement(run.placement) + awardsBonus(run.tournament?.awards, selectedLineup.map((selected) => selected.playerId)), $game.language)}</strong></article>{/if}
```

Antes de `<ShareRunCard ...>` (linha 1351), o histórico da dinastia:

```svelte
        {#if isDynasty && $game.dynasty && $game.dynasty.history.length}
          <section class="panel dynasty-history">
            <div class="section-heading"><div><span class="eyebrow">DINASTIA</span><h2>{t('dynastyHistory')}</h2></div></div>
            <ul>
              {#each $game.dynasty.history as item (item.majorNumber)}
                <li><b>{t('dynastyMajorNumber')} #{item.majorNumber}</b> · {t(item.entryStage)} → {translatePlacement($game.language, item.placement)} · {formatUsd(item.prize + item.awardsBonus, $game.language)}</li>
              {/each}
            </ul>
          </section>
        {/if}
```

Substituir a linha 1352 inteira (`result-actions`) por:

```svelte
        <div class="result-actions">{#if isDynasty}<button class="primary" type="button" disabled={selectedLineup.length !== 5} on:click={startNextDynastyMajor}>{t('dynastyNextMajor')}</button>{:else}<button class="primary" type="button" on:click={() => resetRun(true)}>{t('tryAgain')}</button>{/if}<button class="secondary" type="button" aria-expanded={resultStatsOpen} aria-controls="run-stats" on:click={() => { resultStatsOpen = !resultStatsOpen; if (resultStatsOpen) tick().then(() => document.getElementById('run-stats')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>{resultStatsOpen ? t('hideStats') : t('seeStats')}</button>{#if !isDynasty}<button class="secondary" type="button" on:click={copyLink}>{t('copyRunLink')}</button>{/if}<button class="secondary" type="button" disabled={downloadingImage} on:click={downloadRunImage}>{t('downloadRunImage')}</button>{#if isDynasty}<button class="ghost" type="button" on:click={endDynasty}>{t('dynastyEnd')}</button>{:else}<button class="secondary" type="button" disabled={selectedLineup.length !== 5} on:click={playAgainWithSameLineup}>{t('sameLineupNewMajor')}</button><button class="ghost" type="button" on:click={() => resetRun(false)}>{t('playSameSeed')}</button>{/if}</div>
```

No `<style>` da página acrescentar: `.dynasty-history ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}.dynasty-history li{font-size:.85rem}.dynasty-history b{color:var(--accent)}`.

- [ ] **Step 8: Typecheck e testes**

Run: `npm run check && npx vitest run`
Expected: `0 ERRORS 0 WARNINGS`; todos os testes passam.

- [ ] **Step 9: Verificação no navegador**

Run: `npm run dev`. Em `http://localhost:5173`:

1. Jogar → Dinastia → draft de 5 → mapas → Iniciar Major. O cabeçalho mostra "Major #1 · Challenger · Entrada Stage 1 · Títulos 0 · Caixa US$ 0". O topo do Major mostra "Stage 1" com o recorde.
2. Modo automático, velocidade Ultra: o Major roda até o resultado. Na visão geral, o seletor de estágio mostra Stage 1, 2 e 3 quando há classificação.
3. Resultado: cards por estágio jogado, card "Premiação" com o valor da tabela, histórico com uma linha. Recarregar a página: o caixa não dobra.
4. "Próximo Major": volta à seleção de mapas com o mesmo elenco; o cabeçalho diz "Major #2" e a entrada segue a colocação (Stage 1, 2 ou 3).
5. "Encerrar dinastia": pede confirmação e volta à fila.
6. Normal com uma seed fixa (`?seed=dourado-normal-2026`): o resultado é idêntico ao de antes desta entrega (comparar com o snapshot da Task 1 pelo campeão e pelas séries).
7. Largura 375 px: fila com 2 colunas, cabeçalho da dinastia quebrando linha sem overflow horizontal.

Parar o servidor.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/DynastyHeader.svelte src/routes/+page.svelte
git commit -m "feat: Dinastia joga o Major em três estágios com prêmio, histórico e próximo Major

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Gate final e fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (linha de status da sequência de entregas)

- [ ] **Step 1: Gate**

Run: `npm run validate`
Expected: svelte-check `0 ERRORS 0 WARNINGS`, vitest com todos os arquivos passando (os 38 existentes mais `normalRunGolden`, `dynastyPrizes`, `dynastyState`, `dynastyField`, `tournamentEngineStages`, `campaignMajorStages`), `✓ built` do front e bundle do servidor.

- [ ] **Step 2: Snapshot dourado intacto**

Run: `git status --short tests/__snapshots__`
Expected: nenhuma linha (o snapshot da Task 1 não foi reescrito).

- [ ] **Step 3: Registrar a entrega na spec**

Na seção "Sequência de entregas" da spec, trocar a linha 1 por:

```markdown
1. **Dinastia A** (plano `docs/superpowers/plans/2026-09-14-dinastia-a-modo-e-tres-estagios.md`): modo novo, cabeçalho, Major de três estágios, colocações e premiação. Jogável com "Próximo Major" mantendo o elenco e aplicando status e entrada.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-14-dinastia-design.md
git commit -m "docs: aponta o plano da Dinastia A na spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Relato final**

Relatar: arquivos alterados, testes executados e contagem, que não houve migração (save único com bloco novo opcional), riscos restantes (a campanha do Stage 1 tem até 18 séries em modo manual; o link compartilhado não reproduz a Dinastia) e o que ficou de fora (coach, valor, janela, evolução, Rating 3.0). Não fazer push: o usuário mescla e publica.

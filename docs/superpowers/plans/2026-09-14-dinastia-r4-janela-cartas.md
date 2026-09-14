# Dinastia R4: janela e cartas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A janela de transferências da Dinastia vira uma tela de cartas. Posição errada deixa de bloquear e passa a custar força. Surgem as trocas diretas jogador por jogador, e cada carta abre o histórico por Major do jogador ou do coach.

**Architecture:**
- **Regras puras.** Três módulos em `src/lib/game/dynasty/`:
  - `position.ts`: penalidade de posição, aplicada em `buildDynastyUserTeam`, que só roda com `majorRules === 2`.
  - `window.ts`: `assignRole`, trocas diretas com rng próprio e confirmação sem bloqueio de posição.
  - `cards.ts`: histórico por linhagem.
- **Componentes novos** `Dynasty*`, com CSS escopado: carta de jogador com frente e verso, carta de coach, chips de posição e folha de histórico.
- **Reescritas.** `DynastyWindow.svelte` e `DynastyTeamPanel.svelte` passam a usar esses componentes. A página só repassa props.

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest. Plano aprovado: `/home/itcenterai/.claude/plans/certo-quero-que-mande-harmonic-catmull.md` (seções "Fase 4" e "Números de desenho").

## Global Constraints

- **Repositório.** `/home/itcenterai/worktree/worktree-pessoal/cs20a0`, branch `feat/dinastia` (HEAD de partida `ddd166e`).
  - Nunca fazer push de `main`.
  - Push só de `feat/dinastia`, na Task 7.
- **Commits.** Formato `feat: assunto em pt-BR` (ou `fix:`/`test:`), terminados com:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
- **`git add`.** Sempre com caminhos explícitos. Nunca incluir `.superpowers/` nem `docs/superpowers/plans/2026-09-14-offline-accounts-and-campaigns.md`.
- **Gate.**
  - `npm run check`: 0 erros e 0 avisos.
  - `npx vitest run`: suíte completa.
  - `npm run build` e `npm run server:build`.
  - `git status --short tests/__snapshots__` precisa sair vazio. Nunca rodar vitest com `-u`.
- **Outros modos.** Normal, Ranked, PRO, Sandbox e online não mudam. `buildDynastyUserTeam` só é chamado nos caminhos da Dinastia v2 (`campaign-major.ts` com `dynastyPlan` e a página com `isDynasty`).
- **Números de desenho** (copiados do plano aprovado):
  - **Posição:** −1,5% de força por jogador fora de uma posição elegível, cumulativo, com máximo de −7,5%.
  - **Limite de posição:** o `ROLE_LIMITS` continua valendo (rifler 3, as demais 1). Escolher uma posição cheia troca a posição com quem a ocupa, então a tela nunca bloqueia.
  - **Troca direta:** 2 ofertas por janela. O jogador deles tem até ±5 de overall em relação ao seu e é elegível para a posição do seu.
    - `d = valor(deles) − valor(seu)`.
    - Se `d > 0`, você paga `d × 1,10`. Se `d < 0`, você recebe `|d| × 0,90`. Se `|d| < 5.000`, sai por $0.
    - Tudo arredondado a 5 mil. Aceitar conta como 1 troca.
  - **Rng das trocas:** `${seed}:window:${majorNumber}:swap`, sorteado depois de tudo. Propostas, mercado e coaches ficam idênticos para a mesma seed.
- **Save antigo.** Janela sem `swapOffers` continua abrindo e mostra zero trocas diretas.
- **Textos.** pt-BR, en e es, com textos locais por componente (padrão dos `Dynasty*`). As chaves `window*` existentes em `src/lib/game/i18n.ts` continuam em uso.
- **Responsivo.** Largura de 375 px sem scroll horizontal. `prefers-reduced-motion` desliga flip e animação de entrada.
- **CSS.** Nenhuma regra global nova em `src/app.css`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/game/dynasty/position.ts` (novo) | `OFF_ROLE_PENALTY`, `MAX_OFF_ROLE_PENALTY`, `offRolePlayerIds`, `positionMultiplier`. |
| `src/lib/game/dynasty/seriesPlan.ts` | `buildDynastyUserTeam` aplica a penalidade de posição. |
| `src/lib/game/types.ts` | `WindowSwapOffer`, `WindowState.swapOffers?`, `WindowMove.kind` com `'swap'`. |
| `src/lib/game/dynasty/window.ts` | Trocas diretas (`swapCashDelta`, `swapOfferFor`, geração e movimento), `assignRole` (substitui `setRole`), `lineupProblems` só com limite de posição, `windowOffRolePlayerIds`, confirmação sem bloqueio de posição. |
| `src/lib/game/dynasty/cards.ts` (novo) | `playerMajorHistory` e `coachMajorHistory`. |
| `src/lib/components/DynastyRoleChips.svelte` (novo) | Radiogroup de posições com setas; inelegíveis marcadas com −1,5%. |
| `src/lib/components/DynastyPlayerCard.svelte` (novo) | Carta com OVR, raridade, posição, delta e verso com atributos e treino. |
| `src/lib/components/DynastyCoachCard.svelte` (novo) | Carta de coach com OVR e 4 barras. |
| `src/lib/components/DynastyCardSheet.svelte` (novo) | Modal genérico com tabela de histórico. |
| `src/lib/components/DynastyWindow.svelte` | Reescrito: barra de caixa, elenco em cartas com chips, propostas e trocas diretas, mercado em cartas, alvo livre, trocas feitas, coaches em carta. |
| `src/lib/components/DynastyTeamPanel.svelte` | Painel analítico com cartas do elenco e do coach e folha de histórico. |
| `src/routes/+page.svelte` | Novas props nos dois componentes. |
| `tests/dynastyPosition.test.ts` (novo), `tests/dynastyCards.test.ts` (novo), `tests/dynastyWindow.test.ts` | Testes. |

### Testes existentes que mudam (e por quê)

| Arquivo · teste | Mudança | Motivo |
|---|---|---|
| `tests/dynastyWindow.test.ts` · "posição herdada inválida exige reatribuir antes de confirmar" | Vira "posição herdada fora das elegíveis confirma e só custa força": `lineupProblems` vazio, `windowOffRolePlayerIds` com o jogador, `canConfirmWindow` verdadeiro | O plano aprovado troca o bloqueio pela penalidade de −1,5% |
| `tests/dynastyWindow.test.ts` · "coach custa o valor e confirmar aplica elenco…" | A linha `expect(() => confirmWindow(dynasty, moved, playerById)).toThrow()` passa a verificar que a confirmação funciona com o jogador fora de posição; `setRole` vira `assignRole` | Mesmo motivo, e o nome novo da função |
| `tests/dynastyWindow.test.ts` · imports | `setRole` sai; entram `assignRole`, `SWAP_OFFERS`, `SWAP_OVERALL_BAND`, `swapCashDelta`, `windowOffRolePlayerIds` | API nova |

Os demais testes (`dynastySeriesPlan`, `campaignMajorPlans`, `dynastyValue`, `dynastyEvolution`, `dynastyTraining` e o golden) não mudam. Os elencos desses testes usam posições elegíveis (`getEligibleSlotRoles(player)[0]`), então o multiplicador de posição fica em 1.

---

### Task 1: Penalidade de posição

**Files:**
- Create: `src/lib/game/dynasty/position.ts`, `tests/dynastyPosition.test.ts`
- Modify: `src/lib/game/dynasty/seriesPlan.ts` (fim de `buildDynastyUserTeam`)

**Interfaces:**
- Consumes: `getEligibleSlotRoles(player)` de `src/lib/game/roleRules.ts`; `buildDynastyUserTeam` já existente.
- Produces:
  - `OFF_ROLE_PENALTY = 0.015`;
  - `MAX_OFF_ROLE_PENALTY = 0.075`;
  - `offRolePlayerIds(players: Player[], lineup: SelectedPlayer[]): string[]`;
  - `positionMultiplier(offRoleCount: number): number`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyPosition.test.ts
import { describe, expect, it } from 'vitest';
import { teams } from '../src/lib/game/data';
import { MAX_OFF_ROLE_PENALTY, offRolePlayerIds, positionMultiplier } from '../src/lib/game/dynasty/position';
import { buildDynastyUserTeam } from '../src/lib/game/dynasty/seriesPlan';
import type { LineupSlotRole, Player, SelectedPlayer } from '../src/lib/game/types';

// Same attributes and ids for every roster: only `role` changes, so eligibility is the only difference.
const makePlayer = (id: string, role: string): Player => ({
  id, baseId: id, nickname: id, title: '', traits: [], teamId: `${id}-team`, year: 2020, role, overall: 82, rarity: 'common',
  firepower: 80, clutch: 80, entry: 80, awp: 60, support: 60, igl: 30, experience: 80, consistency: 80, mental: 80
});
const SLOTS: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'support'];
const roster = (roles: string[]) => SLOTS.map((_, index) => makePlayer(`posicao-${index}`, roles[index]));
const lineupOf = (players: Player[]): SelectedPlayer[] => players.map((player, index) => ({ playerId: player.id, selectedSlotRole: SLOTS[index] }));
const plan = { style: 'balanced' as const, tactic: 'standard' as const, study: false };

describe('penalidade de posição da Dinastia', () => {
  it('conta só quem está fora das posições elegíveis', () => {
    const eligible = roster(['awper', 'igl', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(eligible, lineupOf(eligible))).toEqual([]);
    const oneOff = roster(['rifler', 'igl', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(oneOff, lineupOf(oneOff))).toEqual(['posicao-0']);
    const twoOff = roster(['rifler', 'rifler', 'entry', 'lurker', 'support']);
    expect(offRolePlayerIds(twoOff, lineupOf(twoOff))).toEqual(['posicao-0', 'posicao-1']);
  });

  it('tira 1,5% por jogador, com teto de 7,5%', () => {
    expect(positionMultiplier(0)).toBe(1);
    expect(positionMultiplier(1)).toBeCloseTo(0.985, 10);
    expect(positionMultiplier(3)).toBeCloseTo(0.955, 10);
    expect(positionMultiplier(5)).toBeCloseTo(1 - MAX_OFF_ROLE_PENALTY, 10);
    expect(positionMultiplier(9)).toBeCloseTo(0.925, 10);
    expect(positionMultiplier(-2)).toBe(1);
  });

  it('aplica a penalidade no time da Dinastia sem mexer no resto', () => {
    const eligible = roster(['awper', 'igl', 'entry', 'lurker', 'support']);
    const oneOff = roster(['rifler', 'igl', 'entry', 'lurker', 'support']);
    const base = buildDynastyUserTeam({ players: eligible, lineup: lineupOf(eligible), seed: 'posicao', coach: null, teams, plan });
    const penalized = buildDynastyUserTeam({ players: oneOff, lineup: lineupOf(oneOff), seed: 'posicao', coach: null, teams, plan });
    expect(penalized.power / base.power).toBeCloseTo(0.985, 10);
    expect(penalized.mental).toBe(base.mental);
    expect(penalized.consistency).toBe(base.consistency);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/dynastyPosition.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/game/dynasty/position'`.

- [ ] **Step 3: Implementar `position.ts`**

```ts
// src/lib/game/dynasty/position.ts
import { getEligibleSlotRoles } from '../roleRules';
import type { Player, SelectedPlayer } from '../types';

/** Strength lost for each lineup player placed outside the positions they can play. */
export const OFF_ROLE_PENALTY = 0.015;
export const MAX_OFF_ROLE_PENALTY = 0.075;

/** Ids of the lineup players assigned to a position their profile cannot play. */
export function offRolePlayerIds(players: Player[], lineup: SelectedPlayer[]): string[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return lineup.flatMap((selected) => {
    const player = byId.get(selected.playerId);
    return player && !getEligibleSlotRoles(player).includes(selected.selectedSlotRole) ? [selected.playerId] : [];
  });
}

export const positionMultiplier = (offRoleCount: number): number =>
  1 - Math.min(MAX_OFF_ROLE_PENALTY, OFF_ROLE_PENALTY * Math.max(0, offRoleCount));
```

- [ ] **Step 4: Aplicar em `buildDynastyUserTeam`**

Em `src/lib/game/dynasty/seriesPlan.ts`, acrescentar o import `import { offRolePlayerIds, positionMultiplier } from './position';` e trocar o fim da função:

```ts
  if (plan.study) team = { ...team, power: team.power * 1.015 };
  // Playing out of position never blocks the lineup; it costs strength instead.
  const offRole = offRolePlayerIds(players, lineup).length;
  if (offRole) team = { ...team, power: team.power * positionMultiplier(offRole) };
  return team;
}
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/dynastyPosition.test.ts tests/dynastySeriesPlan.test.ts tests/campaignMajorPlans.test.ts tests/normalRunGolden.test.ts`
Expected: todos passam (3 testes novos). Se o terceiro caso não der exatamente 0,985, algum ponto de `calculateDynastyBaseTeamPower` passou a ler `player.role`: pare e relate.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/dynasty/position.ts src/lib/game/dynasty/seriesPlan.ts tests/dynastyPosition.test.ts
git commit -m "feat: penalidade de 1,5% por jogador fora de posição na Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Janela sem bloqueio de posição e trocas diretas

**Files:**
- Modify: `src/lib/game/types.ts` (`WindowMove`, `WindowState`, novo `WindowSwapOffer`)
- Modify: `src/lib/game/dynasty/window.ts`
- Modify: `tests/dynastyWindow.test.ts`
- Modify (compilação): `src/lib/components/DynastyWindow.svelte`, só a troca de `setRole` por `assignRole` (a reescrita é a Task 5)

**Interfaces:**
- Consumes: `offRolePlayerIds` (Task 1); `playerMarketValue` e `roundToStep` de `value.ts`; `ROLE_LIMITS`, `getEligibleSlotRoles` e `getPlayerBaseId`.
- Produces:
  - constantes `SWAP_OFFERS = 2`, `SWAP_OVERALL_BAND = 5` e `SWAP_EVEN_BELOW = 5_000`;
  - tipo `IncomingPlayer` como união: `{ kind: 'offer' | 'target'; playerId }` ou `{ kind: 'swap'; playerId; offerId }`;
  - `swapCashDelta(theirValue, yourValue): number`;
  - `swapOfferFor(state, offerId): WindowSwapOffer | null`;
  - `assignRole(state, playerId, role): WindowState`;
  - `windowOffRolePlayerIds(state, playerById): string[]`;
  - `lineupProblems(state, _playerById?)`, que só devolve `role:<role>`;
  - `WindowState.swapOffers` preenchido por `createWindow`.

- [ ] **Step 1: Tipos em `src/lib/game/types.ts`**

Trocar `WindowMove` e acrescentar `WindowSwapOffer` logo depois de `WindowProposal`:

```ts
export interface WindowSwapOffer {
  id: string;
  /** Team-year of the player another organization offers. */
  fromTeamId: string;
  theirPlayerId: string;
  /** Lineup player they want in return. */
  forPlayerId: string;
  /** Whole dollars: positive the user receives, negative the user pays. */
  cashDelta: number;
}

export interface WindowMove {
  outPlayerId: string;
  inPlayerId: string;
  salePrice: number;
  buyPrice: number;
  kind: 'offer' | 'target' | 'swap';
}
```

Em `WindowState`, acrescentar depois de `offers: WindowOffer[];`:

```ts
  /** Direct player-for-player offers. Missing in windows saved before they existed. */
  swapOffers?: WindowSwapOffer[];
```

- [ ] **Step 2: Testes que falham**

Em `tests/dynastyWindow.test.ts`:

1. Trocar o import de `window` por:

```ts
import {
  assignRole, canConfirmWindow, checkMove, chooseCoach, confirmWindow, createWindow, FOCUS_OFFERS, lineupProblems, makeMove, MARKET_SIZE,
  movesLeft, salePriceFor, SWAP_OFFERS, SWAP_OVERALL_BAND, swapCashDelta, undoMove, windowCash, windowLineup, windowOffRolePlayerIds
} from '../src/lib/game/dynasty/window';
```

2. Substituir o teste `'posição herdada inválida exige reatribuir antes de confirmar'` por estes dois:

```ts
  it('posição herdada fora das elegíveis confirma e só custa força', () => {
    const state = makeMove(open(dynastyWith(5_000_000)), 'l0', { kind: 'target', playerId: rifler.id }, playerById);
    expect(windowLineup(state)[0]).toEqual({ playerId: rifler.id, selectedSlotRole: 'awper' });
    expect(lineupProblems(state, playerById)).toEqual([]);
    expect(windowOffRolePlayerIds(state, playerById)).toEqual([rifler.id]);
    expect(canConfirmWindow(state, playerById)).toBe(true);
    const fixed = assignRole(state, rifler.id, 'rifler');
    expect(windowOffRolePlayerIds(fixed, playerById)).toEqual([]);
    expect(undoMove(fixed, 0).roleAssignments).toEqual({});
  });

  it('assignRole troca com quem ocupa uma posição cheia e nunca estoura o limite', () => {
    const state = open(dynastyWith(0));
    const swapped = assignRole(state, 'l1', 'awper');
    const roles = Object.fromEntries(windowLineup(swapped).map((selected) => [selected.playerId, selected.selectedSlotRole]));
    expect(roles.l1).toBe('awper');
    expect(roles.l0).toBe('igl');
    expect(lineupProblems(swapped, playerById)).toEqual([]);
    expect(assignRole(state, 'l1', 'igl')).toBe(state);
    expect(assignRole(state, 'inexistente', 'awper')).toBe(state);
  });
```

3. No teste `'coach custa o valor e confirmar aplica elenco, caixa, coach, deriva e histórico'`, substituir as duas linhas:

```ts
    expect(() => confirmWindow(dynasty, moved, playerById)).toThrow();
    const { dynasty: next, lineup: nextLineup } = confirmWindow(dynasty, setRole(moved, rifler.id, 'rifler'), playerById);
```

por:

```ts
    expect(confirmWindow(dynasty, moved, playerById).lineup[0]).toEqual({ playerId: rifler.id, selectedSlotRole: 'awper' });
    const { dynasty: next, lineup: nextLineup } = confirmWindow(dynasty, assignRole(moved, rifler.id, 'rifler'), playerById);
```

4. Acrescentar ao fim do arquivo:

```ts
describe('trocas diretas', () => {
  it('traz 2 ofertas determinísticas, elegíveis, na faixa de overall e fora do mercado', () => {
    const state = open(dynastyWith(0));
    expect(state.swapOffers).toHaveLength(SWAP_OFFERS);
    expect(open(dynastyWith(0)).swapOffers).toEqual(state.swapOffers);
    expect(new Set(state.swapOffers!.map((offer) => offer.forPlayerId)).size).toBe(SWAP_OFFERS);
    for (const offer of state.swapOffers!) {
      const theirs = playerById.get(offer.theirPlayerId)!;
      const mine = windowLineup(state).find((selected) => selected.playerId === offer.forPlayerId)!;
      const mineOverall = state.evolution.find((entry) => entry.toPlayerId === offer.forPlayerId)!.overallAfter;
      expect(Math.abs((theirs.overall ?? 70) - mineOverall)).toBeLessThanOrEqual(SWAP_OVERALL_BAND);
      expect(getEligibleSlotRoles(theirs)).toContain(mine.selectedSlotRole);
      expect(state.offers.some((item) => item.playerId === offer.theirPlayerId)).toBe(false);
      expect(Math.abs(offer.cashDelta) % 5_000).toBe(0);
    }
  });

  it('diferença em dinheiro: paga 110%, recebe 90% e empata abaixo de 5 mil', () => {
    expect(swapCashDelta(300_000, 200_000)).toBe(-110_000);
    expect(swapCashDelta(200_000, 300_000)).toBe(90_000);
    expect(swapCashDelta(204_000, 200_000)).toBe(0);
    expect(swapCashDelta(250_000, 250_000)).toBe(0);
  });

  it('aceitar conta como 1 troca, move o caixa pela diferença e não se repete', () => {
    const state = open(dynastyWith(5_000_000));
    const offer = state.swapOffers![0];
    const incoming = { kind: 'swap' as const, playerId: offer.theirPlayerId, offerId: offer.id };
    const otherLineupPlayer = windowLineup(state).find((selected) => selected.playerId !== offer.forPlayerId)!.playerId;
    expect(checkMove(state, otherLineupPlayer, incoming, playerById)).toBe('not-offered');
    const moved = makeMove(state, offer.forPlayerId, incoming, playerById);
    expect(movesLeft(moved)).toBe(state.maxMoves - 1);
    expect(windowCash(moved)).toBe(5_000_000 + offer.cashDelta);
    expect(moved.moves[0]).toMatchObject({ kind: 'swap', outPlayerId: offer.forPlayerId, inPlayerId: offer.theirPlayerId });
    expect(windowLineup(moved).some((selected) => selected.playerId === offer.theirPlayerId)).toBe(true);
    expect(checkMove(moved, offer.forPlayerId, incoming, playerById)).toBe('already-sold');
  });

  it('troca que custa dinheiro respeita o caixa e janela antiga sem trocas continua válida', () => {
    const state = open(dynastyWith(0));
    const paying = { ...state, swapOffers: [{ id: 'swap-teste', fromTeamId: 'x-team', theirPlayerId: rifler.id, forPlayerId: 'l4', cashDelta: -50_000 }] };
    expect(checkMove(paying, 'l4', { kind: 'swap', playerId: rifler.id, offerId: 'swap-teste' }, playerById)).toBe('no-cash');
    const legacy = { ...state, swapOffers: undefined };
    expect(checkMove(legacy, 'l4', { kind: 'swap', playerId: rifler.id, offerId: 'swap-teste' }, playerById)).toBe('not-offered');
    expect(canConfirmWindow(legacy, playerById)).toBe(true);
  });
});
```

Run: `npx vitest run tests/dynastyWindow.test.ts`
Expected: FAIL (`assignRole`, `SWAP_OFFERS`, `swapCashDelta` e `windowOffRolePlayerIds` não exportados).

- [ ] **Step 3: Implementar em `src/lib/game/dynasty/window.ts`**

Imports:

```ts
import type { Coach, DynastyState, LineupSlotRole, Player, PlayerRunStats, SelectedPlayer, WindowOffer, WindowProposal, WindowState, WindowSwapOffer } from '../types';
import { offRolePlayerIds } from './position';
```

Constantes depois de `OVERALL_BAND`:

```ts
export const SWAP_OFFERS = 2;
export const SWAP_OVERALL_BAND = 5;
/** Below this value difference a direct swap is even. */
export const SWAP_EVEN_BELOW = 5_000;
```

Trocar `IncomingPlayer`:

```ts
export type IncomingPlayer =
  | { kind: 'offer' | 'target'; playerId: string }
  | { kind: 'swap'; playerId: string; offerId: string };
```

Antes de `createWindow`:

```ts
/** Cash the user receives (+) or pays (−) to swap their player for another organization's. */
export function swapCashDelta(theirValue: number, yourValue: number): number {
  const difference = theirValue - yourValue;
  if (Math.abs(difference) < SWAP_EVEN_BELOW) return 0;
  return difference > 0 ? -roundToStep(difference * 1.1) : roundToStep(-difference * 0.9);
}
```

Em `createWindow`, depois do cálculo de `coachOfferIds` e antes do `return`:

```ts
  // Own generator, drawn after everything else, so proposals, market and coaches stay identical for the same seed.
  const swapRng = createSeededRng(`${input.seed}:window:${dynasty.majorNumber}:swap`);
  const swapOffers: WindowSwapOffer[] = [];
  const takenBaseIds = new Set([...lineupBaseIds, ...offered]);
  const swapPool = [...resolved];
  while (swapOffers.length < SWAP_OFFERS && swapPool.length) {
    const [mine] = swapPool.splice(pickIndex(swapRng, swapPool.length), 1);
    const role = mine.selected.selectedSlotRole;
    const mineOverall = mine.player.overall ?? 70;
    const matches = input.catalog.filter((player) => Boolean(player.teamId)
      && !takenBaseIds.has(getPlayerBaseId(player))
      && Math.abs((player.overall ?? 70) - mineOverall) <= SWAP_OVERALL_BAND
      && getEligibleSlotRoles(player).includes(role));
    if (!matches.length) continue;
    const theirs = matches[pickIndex(swapRng, matches.length)];
    takenBaseIds.add(getPlayerBaseId(theirs));
    swapOffers.push({
      id: `swap-${dynasty.majorNumber}-${swapOffers.length + 1}`,
      fromTeamId: theirs.teamId ?? '',
      theirPlayerId: theirs.id,
      forPlayerId: mine.selected.playerId,
      cashDelta: swapCashDelta(playerMarketValue(theirs), playerMarketValue(mine.player))
    });
  }
```

No objeto devolvido, acrescentar `swapOffers,` depois de `offers,`.

Substituir `buyPriceFor`, `checkMove`, `makeMove`, `setRole`, `lineupProblems` e `canConfirmWindow`, e ajustar a mensagem de `confirmWindow`:

```ts
export const swapOfferFor = (state: WindowState, offerId: string): WindowSwapOffer | null =>
  (state.swapOffers ?? []).find((offer) => offer.id === offerId) ?? null;

export function buyPriceFor(state: WindowState, incoming: IncomingPlayer, playerById: Map<string, Player>): number | null {
  if (incoming.kind === 'swap') {
    const offer = swapOfferFor(state, incoming.offerId);
    return offer ? Math.max(0, -offer.cashDelta) : null;
  }
  if (incoming.kind === 'offer') return state.offers.find((offer) => offer.playerId === incoming.playerId)?.price ?? null;
  const player = playerById.get(incoming.playerId);
  return player ? roundToStep(playerMarketValue(player) * TARGET_MARKUP) : null;
}

function movePrices(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>) {
  if (incoming.kind === 'swap') {
    const delta = swapOfferFor(state, incoming.offerId)?.cashDelta ?? 0;
    return { salePrice: Math.max(0, delta), buyPrice: Math.max(0, -delta) };
  }
  return { salePrice: salePriceFor(state, outPlayerId, playerById), buyPrice: buyPriceFor(state, incoming, playerById) ?? 0 };
}

export function checkMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): MoveProblem | null {
  if (movesLeft(state) <= 0) return 'no-moves';
  if (!state.baseLineup.some((selected) => selected.playerId === outPlayerId)) return 'not-in-lineup';
  if (state.moves.some((move) => move.outPlayerId === outPlayerId)) return 'already-sold';
  const player = playerById.get(incoming.playerId);
  if (!player) return 'unknown-player';
  const lineupBaseIds = new Set(windowLineup(state).flatMap((selected) => {
    const current = playerById.get(selected.playerId);
    return current ? [getPlayerBaseId(current)] : [];
  }));
  if (lineupBaseIds.has(getPlayerBaseId(player))) return 'duplicate-player';
  if (incoming.kind === 'swap') {
    const offer = swapOfferFor(state, incoming.offerId);
    if (!offer || offer.theirPlayerId !== incoming.playerId || offer.forPlayerId !== outPlayerId) return 'not-offered';
    if (state.moves.some((move) => move.kind === 'swap' && move.inPlayerId === incoming.playerId)) return 'offer-used';
  } else if (incoming.kind === 'offer') {
    if (!state.offers.some((offer) => offer.playerId === incoming.playerId)) return 'not-offered';
    if (state.moves.some((move) => move.inPlayerId === incoming.playerId)) return 'offer-used';
  } else if (state.moves.some((move) => move.kind === 'target')) {
    return 'target-used';
  }
  const { salePrice, buyPrice } = movePrices(state, outPlayerId, incoming, playerById);
  if (windowCash(state) + salePrice - buyPrice < 0) return 'no-cash';
  return null;
}

export function makeMove(state: WindowState, outPlayerId: string, incoming: IncomingPlayer, playerById: Map<string, Player>): WindowState {
  const problem = checkMove(state, outPlayerId, incoming, playerById);
  if (problem) throw new Error(`Troca inválida: ${problem}`);
  const { salePrice, buyPrice } = movePrices(state, outPlayerId, incoming, playerById);
  return { ...state, moves: [...state.moves, { outPlayerId, inPlayerId: incoming.playerId, salePrice, buyPrice, kind: incoming.kind }] };
}
```

(`undoMove` fica como está.)

```ts
/** Moves a player to a position. A full position hands its last holder the vacated one, so the window never blocks. */
export function assignRole(state: WindowState, playerId: string, role: LineupSlotRole): WindowState {
  const lineup = windowLineup(state);
  const current = lineup.find((selected) => selected.playerId === playerId);
  if (!current || current.selectedSlotRole === role) return state;
  const holders = lineup.filter((selected) => selected.playerId !== playerId && selected.selectedSlotRole === role);
  const roleAssignments = { ...state.roleAssignments, [playerId]: role };
  if (holders.length >= ROLE_LIMITS[role]) roleAssignments[holders[holders.length - 1].playerId] = current.selectedSlotRole;
  return { ...state, roleAssignments };
}

/** `role:<role>` for a position over its limit. Playing out of position is allowed and costs strength (see `windowOffRolePlayerIds`). */
export function lineupProblems(state: WindowState, _playerById?: Map<string, Player>): string[] {
  const lineup = windowLineup(state);
  return (Object.keys(ROLE_LIMITS) as LineupSlotRole[])
    .filter((role) => lineup.filter((selected) => selected.selectedSlotRole === role).length > ROLE_LIMITS[role])
    .map((role) => `role:${role}`);
}

/** Lineup players currently outside their eligible positions, read with the window's evolution. */
export function windowOffRolePlayerIds(state: WindowState, playerById: Map<string, Player>): string[] {
  const lineup = windowLineup(state);
  const players = lineup.flatMap((selected) => {
    const player = playerById.get(selected.playerId);
    return player ? [resolveDynastyPlayer(player, state.overrides[selected.playerId])] : [];
  });
  return offRolePlayerIds(players, lineup);
}
```

```ts
export const canConfirmWindow = (state: WindowState, _playerById?: Map<string, Player>) =>
  windowCash(state) >= 0 && windowLineup(state).length === 5 && lineupProblems(state).length === 0;
```

Em `confirmWindow`, trocar a mensagem por `'A janela ainda tem caixa negativo ou posição acima do limite'`.

- [ ] **Step 4: Manter a tela compilando**

Em `src/lib/components/DynastyWindow.svelte`, trocar `setRole` por `assignRole` no import e em `pickRole`: `onChange(assignRole(state, playerId, (event.currentTarget as HTMLSelectElement).value as LineupSlotRole));`. A tela nova vem na Task 5.

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/dynastyWindow.test.ts tests/dynastyState.test.ts && npm run check`
Expected: 12 testes em `dynastyWindow` (4 de abertura, 3 de trocas, 1 de coach e 4 de trocas diretas, com o antigo de posição substituído por 2) e `dynastyState` passando; `0 ERRORS 0 WARNINGS`.

Se `toHaveLength(SWAP_OFFERS)` falhar porque o catálogo sintético não tem jogador elegível na faixa, faça duas coisas:
- mostre qual jogador do elenco ficou sem candidato;
- não afrouxe a regra, e troque o teste para aceitar entre 1 e `SWAP_OFFERS`. Registre a troca no relato.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/dynasty/window.ts src/lib/components/DynastyWindow.svelte tests/dynastyWindow.test.ts
git commit -m "feat: trocas diretas na janela da Dinastia e posição errada sem bloquear

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Histórico por linhagem (`cards.ts`)

**Files:**
- Create: `src/lib/game/dynasty/cards.ts`, `tests/dynastyCards.test.ts`

**Interfaces:**
- Consumes: `getPlayerBaseId` (`roleRules.ts`); `DynastyMajorSummary` com `overalls?`, `evolution?`, `training?`, `stats` e `lineup`.
- Produces:
  - `PlayerMajorEntry { majorNumber; placement; playerId; role; rating: number | null; mapsPlayed: number | null; overall: number | null; training: TrainingFocus | null; evolution: EvolutionEntry | null }`;
  - `playerMajorHistory(history, player, playerById): PlayerMajorEntry[]`;
  - `CoachMajorEntry { majorNumber; placement; averageRating: number | null }`;
  - `coachMajorHistory(history, coachId): CoachMajorEntry[]`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyCards.test.ts
import { describe, expect, it } from 'vitest';
import { coachMajorHistory, playerMajorHistory } from '../src/lib/game/dynasty/cards';
import type { DynastyMajorSummary, Player, PlayerRunStats } from '../src/lib/game/types';

const makePlayer = (id: string, baseId: string, year: number): Player => ({ id, baseId, nickname: baseId, year, role: 'rifler', overall: 80 } as Player);
const ace2020 = makePlayer('cartaace-2020', 'cartaace', 2020);
const ace2021 = makePlayer('cartaace-2021', 'cartaace', 2021);
const bob = makePlayer('cartabob-2020', 'cartabob', 2020);
const playerById = new Map([ace2020, ace2021, bob].map((player) => [player.id, player]));

const summary = (majorNumber: number, acePlayerId: string, extra: Partial<DynastyMajorSummary> = {}): DynastyMajorSummary => ({
  majorNumber, seed: `s${majorNumber}`, entryStage: 'stage1', placement: majorNumber === 1 ? 'placementStage2' : 'placementChampion',
  prize: 0, awardsBonus: 0, movesMade: 0, coachId: majorNumber === 1 ? 'coach-a' : 'coach-b',
  lineup: [{ playerId: acePlayerId, selectedSlotRole: 'rifler' }, { playerId: bob.id, selectedSlotRole: 'igl' }],
  stats: [{ playerId: acePlayerId, runRating: 1.12, mapsPlayed: 9 } as PlayerRunStats, { playerId: bob.id, runRating: 0.9, mapsPlayed: 7 } as PlayerRunStats],
  ...extra
});

describe('histórico das cartas da Dinastia', () => {
  const history = [
    summary(1, ace2020.id, { rules: 2, overalls: { [ace2020.id]: 81 }, training: 'aim', evolution: [{ fromPlayerId: ace2020.id, toPlayerId: ace2021.id, kind: 'version', overallBefore: 81, overallAfter: 86 }] }),
    summary(2, ace2021.id)
  ];

  it('segue a linhagem do jogador entre versões de ano', () => {
    const entries = playerMajorHistory(history, ace2021, playerById);
    expect(entries.map((entry) => [entry.majorNumber, entry.playerId, entry.placement])).toEqual([
      [1, ace2020.id, 'placementStage2'],
      [2, ace2021.id, 'placementChampion']
    ]);
    expect(entries[0]).toMatchObject({ role: 'rifler', rating: 1.12, mapsPlayed: 9, overall: 81, training: 'aim' });
    expect(entries[0].evolution).toMatchObject({ kind: 'version', overallAfter: 86 });
  });

  it('summary antigo sem overall, treino ou evolução devolve null nesses campos', () => {
    const [, legacy] = playerMajorHistory(history, ace2020, playerById);
    expect(legacy).toMatchObject({ overall: null, training: null, evolution: null, rating: 1.12 });
    expect(playerMajorHistory(history, makePlayer('outro-2020', 'outro', 2020), playerById)).toEqual([]);
  });

  it('histórico do coach traz os Majors dele com o rating médio do elenco', () => {
    expect(coachMajorHistory(history, 'coach-a')).toEqual([{ majorNumber: 1, placement: 'placementStage2', averageRating: 1.01 }]);
    expect(coachMajorHistory(history, 'coach-x')).toEqual([]);
  });
});
```

Run: `npx vitest run tests/dynastyCards.test.ts`
Expected: FAIL, módulo inexistente.

- [ ] **Step 2: Implementar**

```ts
// src/lib/game/dynasty/cards.ts
import { getPlayerBaseId } from '../roleRules';
import type { DynastyMajorSummary, EvolutionEntry, LineupSlotRole, Player, TrainingFocus } from '../types';

export interface PlayerMajorEntry {
  majorNumber: number;
  placement: string;
  /** Version of the player used in that Major. */
  playerId: string;
  role: LineupSlotRole;
  rating: number | null;
  mapsPlayed: number | null;
  /** Overall at the start of that Major; null in summaries saved before it was recorded. */
  overall: number | null;
  training: TrainingFocus | null;
  evolution: EvolutionEntry | null;
}

export interface CoachMajorEntry {
  majorNumber: number;
  placement: string;
  averageRating: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Every Major the player's lineage took part in, following version changes through `getPlayerBaseId`. */
export function playerMajorHistory(history: DynastyMajorSummary[], player: Player, playerById: Map<string, Player>): PlayerMajorEntry[] {
  const baseId = getPlayerBaseId(player);
  return history.flatMap((summary) => {
    const selected = summary.lineup.find((item) => {
      const version = playerById.get(item.playerId);
      return version ? getPlayerBaseId(version) === baseId : false;
    });
    if (!selected) return [];
    const stat = summary.stats.find((item) => item.playerId === selected.playerId);
    return [{
      majorNumber: summary.majorNumber,
      placement: summary.placement,
      playerId: selected.playerId,
      role: selected.selectedSlotRole,
      rating: typeof stat?.runRating === 'number' ? stat.runRating : null,
      mapsPlayed: typeof stat?.mapsPlayed === 'number' ? stat.mapsPlayed : null,
      overall: summary.overalls?.[selected.playerId] ?? null,
      training: summary.training ?? null,
      evolution: summary.evolution?.find((entry) => entry.fromPlayerId === selected.playerId) ?? null
    }];
  });
}

/** Majors a coach led, with the lineup's average rating in each. */
export function coachMajorHistory(history: DynastyMajorSummary[], coachId: string): CoachMajorEntry[] {
  return history.filter((summary) => summary.coachId === coachId).map((summary) => {
    const ratings = summary.stats.map((stat) => stat.runRating).filter((rating): rating is number => typeof rating === 'number');
    return {
      majorNumber: summary.majorNumber,
      placement: summary.placement,
      averageRating: ratings.length ? round2(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null
    };
  });
}
```

- [ ] **Step 3: Rodar**

Run: `npx vitest run tests/dynastyCards.test.ts && npm run check`
Expected: 3 testes passando; `0 ERRORS 0 WARNINGS`.

Se `getPlayerBaseId` normalizar os ids sintéticos de outro jeito e a linhagem não casar, confira o que ele devolve para `cartaace-2020` e `cartaace-2021`. O teste precisa usar ids que ele trate como a mesma pessoa. Registre o ajuste.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/dynasty/cards.ts tests/dynastyCards.test.ts
git commit -m "feat: histórico por Major das cartas de jogador e coach da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Componentes de carta

**Files:**
- Create:
  - `src/lib/components/DynastyRoleChips.svelte`
  - `src/lib/components/DynastyPlayerCard.svelte`
  - `src/lib/components/DynastyCoachCard.svelte`
  - `src/lib/components/DynastyCardSheet.svelte`

**Interfaces:**
- **`DynastyRoleChips`** props:
  - `value: LineupSlotRole`
  - `eligible: LineupSlotRole[]`
  - `language: Language`
  - `label: string`
  - `disabled: boolean`
  - `onChange(role)`
- **`DynastyPlayerCard`** props:
  - `player: Player`, já resolvido
  - `role: LineupSlotRole | null`
  - `offRole: boolean`
  - `evolution: EvolutionEntry | null`
  - `training: PlayerOverride['training'] | null`
  - `teamLabel: string`
  - `language`
  - `selected: boolean`
  - `onOpen: (() => void) | null`
  - `<slot />` no rodapé para ações
- **`DynastyCoachCard`** props:
  - `coach: Coach`
  - `teamLabel: string`
  - `language`
  - `selected: boolean`
  - `onOpen: (() => void) | null`
  - `<slot />` no rodapé
- **`DynastyCardSheet`** props:
  - `title: string`
  - `subtitle: string`
  - `headers: string[]`
  - `rows: string[][]`
  - `emptyLabel: string`
  - `language`
  - `onClose()`

- [ ] **Step 1: `DynastyRoleChips.svelte`**

```svelte
<script lang="ts">
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { Language, LineupSlotRole } from '$lib/game/types';

  export let value: LineupSlotRole;
  export let eligible: LineupSlotRole[] = [];
  export let language: Language = 'pt-BR';
  export let label = '';
  export let disabled = false;
  export let onChange: (role: LineupSlotRole) => void = () => {};

  const ROLES: LineupSlotRole[] = ['awper', 'igl', 'entry', 'lurker', 'rifler', 'support'];
  const hint = { 'pt-BR': 'Fora de posição: −1,5% de força', es: 'Fuera de posición: −1,5% de fuerza', en: 'Out of position: −1.5% strength' } as const;
  let buttons: HTMLButtonElement[] = [];

  function onKey(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + ROLES.length) % ROLES.length;
    buttons[next]?.focus();
    onChange(ROLES[next]);
  }
</script>

<div class="role-chips" role="radiogroup" aria-label={label}>
  {#each ROLES as role, index}
    {@const off = !eligible.includes(role)}
    <button
      bind:this={buttons[index]}
      type="button"
      role="radio"
      aria-checked={value === role}
      tabindex={value === role ? 0 : -1}
      class:selected={value === role}
      class:off
      {disabled}
      title={off ? hint[language] : undefined}
      on:click={() => onChange(role)}
      on:keydown={(event) => onKey(event, index)}
    >
      {getRoleLabel(role)}{#if off}<small>{language === 'en' ? '−1.5%' : '−1,5%'}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .role-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  button { display: inline-flex; align-items: baseline; gap: 4px; min-height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font: 800 .66rem/1 Inter, Arial, sans-serif; letter-spacing: .04em; text-transform: uppercase; cursor: pointer; }
  button:hover:not(:disabled) { color: var(--text); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  button.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--surface)); color: var(--accent); }
  button.off { border-style: dashed; }
  button.off.selected { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, var(--surface)); color: var(--accent-2); }
  small { font-size: .56rem; color: var(--accent-2); }
</style>
```

- [ ] **Step 2: `DynastyPlayerCard.svelte`**

```svelte
<script lang="ts">
  import { getRoleLabel } from '$lib/game/roleRules';
  import type { EvolutionEntry, Language, LineupSlotRole, Player, PlayerOverride } from '$lib/game/types';

  export let player: Player;
  export let role: LineupSlotRole | null = null;
  export let offRole = false;
  export let evolution: EvolutionEntry | null = null;
  export let training: PlayerOverride['training'] | null = null;
  export let teamLabel = '';
  export let language: Language = 'pt-BR';
  export let selected = false;
  export let onOpen: (() => void) | null = null;

  const ATTRIBUTES = ['firepower', 'entry', 'clutch', 'awp', 'support', 'igl'] as const;
  const copy = {
    'pt-BR': { flip: 'Atributos', front: 'Carta', history: 'Histórico', trained: 'treino', firepower: 'Mira', entry: 'Entrada', clutch: 'Clutch', awp: 'AWP', support: 'Suporte', igl: 'IGL' },
    es: { flip: 'Atributos', front: 'Carta', history: 'Historial', trained: 'entreno', firepower: 'Puntería', entry: 'Entrada', clutch: 'Clutch', awp: 'AWP', support: 'Apoyo', igl: 'IGL' },
    en: { flip: 'Attributes', front: 'Card', history: 'History', trained: 'training', firepower: 'Aim', entry: 'Entry', clutch: 'Clutch', awp: 'AWP', support: 'Support', igl: 'IGL' }
  } as const;

  let flipped = false;
  $: c = copy[language];
  $: rarity = (player.rarity ?? 'common').toLowerCase();
  $: delta = evolution ? evolution.overallAfter - evolution.overallBefore : 0;
  const gainOf = (key: string) => (training as Record<string, number | undefined> | null | undefined)?.[key] ?? 0;
</script>

<article class="dynasty-card" class:selected class:flipped>
  <div class="card-inner rarity-{rarity}">
    <div class="face front" aria-hidden={flipped}>
      <header>
        <span class="ovr">{player.overall ?? 70}</span>
        <span class="rarity">{rarity}</span>
      </header>
      <strong class="name">{player.nickname ?? player.id}</strong>
      <small class="team">{teamLabel}{player.year ? ` · ${player.year}` : ''}</small>
      <div class="tags">
        {#if role}<span class="role" class:warn={offRole}>{getRoleLabel(role)}{#if offRole} · {language === 'en' ? '−1.5%' : '−1,5%'}{/if}</span>{/if}
        {#if delta !== 0}<span class="delta" class:up={delta > 0} class:down={delta < 0}>{delta > 0 ? '+' : ''}{delta}</span>{/if}
      </div>
    </div>
    <div class="face back" aria-hidden={!flipped}>
      <ul>
        {#each ATTRIBUTES as key}
          <li>
            <span>{c[key]}</span>
            <i style={`--value:${player[key] ?? 0}%`}></i>
            <b>{player[key] ?? '—'}{#if gainOf(key)}<small> +{gainOf(key)} {c.trained}</small>{/if}</b>
          </li>
        {/each}
      </ul>
    </div>
  </div>
  <footer>
    <button type="button" class="card-action" aria-pressed={flipped} on:click={() => (flipped = !flipped)}>{flipped ? c.front : c.flip}</button>
    {#if onOpen}<button type="button" class="card-action" on:click={onOpen}>{c.history}</button>{/if}
    <slot />
  </footer>
</article>

<style>
  .dynasty-card { display: grid; gap: 8px; min-width: 0; perspective: 900px; }
  .card-inner { position: relative; min-height: 176px; border: 1px solid var(--line); border-radius: 6px; transform-style: preserve-3d; transition: transform .45s cubic-bezier(.16, 1, .3, 1); }
  .selected .card-inner { outline: 2px solid var(--accent); outline-offset: 2px; }
  .flipped .card-inner { transform: rotateY(180deg); }
  .face { position: absolute; inset: 0; display: grid; align-content: start; gap: 6px; padding: 12px; border-radius: 6px; overflow: hidden; background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 7%, var(--surface-2)), var(--surface)); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .back { transform: rotateY(180deg); }
  header { display: flex; justify-content: space-between; align-items: start; }
  .ovr { font: 900 2.2rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  .rarity { font-size: .56rem; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .name { font-size: 1.15rem; overflow-wrap: anywhere; }
  .team { color: var(--muted); font-size: .7rem; overflow-wrap: anywhere; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
  .role, .delta { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: .62rem; font-weight: 900; text-transform: uppercase; }
  .role.warn { border-color: var(--accent-2); color: var(--accent-2); }
  .delta.up { color: var(--accent); border-color: var(--accent); }
  .delta.down { color: var(--danger); border-color: var(--danger); }
  ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: .68rem; }
  li i { height: 5px; background: linear-gradient(90deg, var(--accent) var(--value), var(--line) var(--value)); }
  li b small { color: var(--accent); font-size: .56rem; }
  footer { display: flex; flex-wrap: wrap; gap: 6px; }
  .card-action { min-height: 30px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .card-action:hover { color: var(--text); }
  @media (prefers-reduced-motion: reduce) { .card-inner { transition: none; } }
</style>
```

- [ ] **Step 3: `DynastyCoachCard.svelte`**

```svelte
<script lang="ts">
  import type { Coach, Language } from '$lib/game/types';

  export let coach: Coach;
  export let teamLabel = '';
  export let language: Language = 'pt-BR';
  export let selected = false;
  export let onOpen: (() => void) | null = null;

  const copy = {
    'pt-BR': { tactics: 'Tática', discipline: 'Disciplina', aggression: 'Agressão', development: 'Desenvolvimento', history: 'Histórico' },
    es: { tactics: 'Táctica', discipline: 'Disciplina', aggression: 'Agresión', development: 'Desarrollo', history: 'Historial' },
    en: { tactics: 'Tactics', discipline: 'Discipline', aggression: 'Aggression', development: 'Development', history: 'History' }
  } as const;
  const ATTRIBUTES = ['tactics', 'discipline', 'aggression', 'development'] as const;
  $: c = copy[language];
</script>

<article class="coach-card rarity-{coach.rarity}" class:selected>
  <header>
    <span class="ovr">{coach.overall}</span>
    <div><strong>{coach.name}</strong><small>{teamLabel}</small></div>
  </header>
  <ul>
    {#each ATTRIBUTES as key}
      <li><span>{c[key]}</span><i style={`--value:${coach[key]}%`}></i><b>{coach[key]}</b></li>
    {/each}
  </ul>
  <footer>
    {#if onOpen}<button type="button" class="card-action" on:click={onOpen}>{c.history}</button>{/if}
    <slot />
  </footer>
</article>

<style>
  .coach-card { display: grid; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 6px; background: linear-gradient(160deg, color-mix(in srgb, var(--accent-2) 8%, var(--surface-2)), var(--surface)); }
  .coach-card.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
  header { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: center; }
  .ovr { font: 900 2rem/1 'Arial Narrow', Impact, sans-serif; color: var(--accent); }
  strong { display: block; overflow-wrap: anywhere; }
  small { color: var(--muted); font-size: .7rem; overflow-wrap: anywhere; }
  ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: .68rem; }
  li i { height: 5px; background: linear-gradient(90deg, var(--accent) var(--value), var(--line) var(--value)); }
  footer { display: flex; flex-wrap: wrap; gap: 6px; }
  .card-action { min-height: 30px; padding: 0 10px; border: 1px solid var(--line); background: transparent; color: var(--muted); font: 800 .62rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
</style>
```

- [ ] **Step 4: `DynastyCardSheet.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Language } from '$lib/game/types';

  export let title = '';
  export let subtitle = '';
  export let headers: string[] = [];
  export let rows: string[][] = [];
  export let emptyLabel = '';
  export let language: Language = 'pt-BR';
  export let onClose: () => void = () => {};

  let closeButton: HTMLButtonElement;
  const closeLabel = { 'pt-BR': 'Fechar', es: 'Cerrar', en: 'Close' } as const;
  onMount(() => closeButton?.focus());
</script>

<svelte:window on:keydown={(event) => { if (event.key === 'Escape') onClose(); }} />

<div class="sheet-backdrop" role="presentation" on:click|self={onClose}>
  <section class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <div><span class="eyebrow">DINASTIA</span><h2>{title}</h2>{#if subtitle}<p>{subtitle}</p>{/if}</div>
      <button bind:this={closeButton} type="button" class="close" on:click={onClose}>{closeLabel[language]}</button>
    </header>
    {#if rows.length}
      <div class="table-wrap">
        <table>
          <thead><tr>{#each headers as header}<th scope="col">{header}</th>{/each}</tr></thead>
          <tbody>{#each rows as row}<tr>{#each row as cell}<td>{cell}</td>{/each}</tr>{/each}</tbody>
        </table>
      </div>
    {:else}
      <p class="empty">{emptyLabel}</p>
    {/if}
  </section>
</div>

<style>
  .sheet-backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: end center; padding: 16px; background: rgb(0 0 0 / 55%); }
  .sheet { display: grid; gap: 14px; width: min(720px, 100%); max-height: min(80vh, 640px); padding: 18px; overflow: auto; border: 1px solid var(--line); border-radius: 8px 8px 0 0; background: var(--surface); }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
  h2, p { margin: 0; } p { color: var(--muted); font-size: .8rem; }
  .close { min-height: 36px; padding: 0 12px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 800 .66rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .78rem; }
  th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  th { color: var(--muted); font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; }
  .empty { padding: 12px 0; }
  @media (min-width: 680px) { .sheet-backdrop { place-items: center; } .sheet { border-radius: 8px; } }
</style>
```

- [ ] **Step 5: Verificar**

Run: `npm run check && npm run build`
Expected: `0 ERRORS 0 WARNINGS` e build ok (os componentes ainda não estão montados).

Alguns avisos podem aparecer (a11y do backdrop clicável, `bind:this` em array). Nesse caso, corrija com o mínimo, sem desligar regras:
- `role="presentation"` já está no backdrop;
- use `tabindex="-1"` se o aviso pedir;
- registre o que mudou.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/DynastyRoleChips.svelte src/lib/components/DynastyPlayerCard.svelte src/lib/components/DynastyCoachCard.svelte src/lib/components/DynastyCardSheet.svelte
git commit -m "feat: cartas de jogador e coach, chips de posição e folha de histórico da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Janela em cartas

**Files:**
- Modify: `src/lib/components/DynastyWindow.svelte` (reescrita completa)
- Modify: `src/routes/+page.svelte` (props do `<DynastyWindow ... />`, linha ~1283)

**Interfaces:**
- Consumes:
  - de `window.ts`: `assignRole`, `buyPriceFor`, `canConfirmWindow`, `checkMove`, `chooseCoach`, `lineupProblems`, `makeMove`, `movesLeft`, `salePriceFor`, `swapOfferFor`, `undoMove`, `windowCash`, `windowLineup`, `windowOffRolePlayerIds`;
  - de `cards.ts`: `playerMajorHistory` e `coachMajorHistory`;
  - os componentes da Task 4.
- Produces:
  - props da janela: as mesmas de antes (`state`, `language`, `playerById`, `coachById`, `currentCoach`, `catalog`, `teamLabel`, `onChange`, `onConfirm`) mais `history: DynastyMajorSummary[] = []`.

- [ ] **Step 1: Reescrever `DynastyWindow.svelte`**

```svelte
<script lang="ts">
  import DynastyCardSheet from './DynastyCardSheet.svelte';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import DynastyPlayerCard from './DynastyPlayerCard.svelte';
  import DynastyRoleChips from './DynastyRoleChips.svelte';
  import { coachMajorHistory, playerMajorHistory } from '$lib/game/dynasty/cards';
  import { formatUsd } from '$lib/game/dynasty/prizes';
  import { OFF_ROLE_PENALTY, positionMultiplier } from '$lib/game/dynasty/position';
  import { resolveDynastyPlayer } from '$lib/game/dynasty/resolve';
  import { coachMarketValue } from '$lib/game/dynasty/value';
  import {
    assignRole, buyPriceFor, canConfirmWindow, checkMove, chooseCoach, lineupProblems, makeMove, movesLeft, salePriceFor,
    undoMove, windowCash, windowLineup, windowOffRolePlayerIds, type IncomingPlayer, type MoveProblem
  } from '$lib/game/dynasty/window';
  import { translate, translatePlacement } from '$lib/game/i18n';
  import { getEligibleSlotRoles, getPlayerBaseId, getRoleLabel } from '$lib/game/roleRules';
  import type { Coach, DynastyMajorSummary, Language, Player, WindowState } from '$lib/game/types';

  export let state: WindowState;
  export let language: Language = 'pt-BR';
  export let playerById: Map<string, Player>;
  export let coachById: Map<string, Coach>;
  export let currentCoach: Coach | null = null;
  export let catalog: Player[] = [];
  export let history: DynastyMajorSummary[] = [];
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onChange: (next: WindowState) => void = () => {};
  export let onConfirm: () => void = () => {};

  const copy = {
    'pt-BR': { swaps: 'Trocas diretas', gives: 'Você entrega', gets: 'Você recebe', pay: 'Você paga', receive: 'Você recebe', even: 'Sem diferença', accept: 'Aceitar troca', offRole: 'fora de posição', strength: 'força', empty: 'Sem Majors registrados ainda', major: 'Major', placement: 'Colocação', rating: 'Rating', overall: 'OVR', training: 'Treino', evolution: 'Evolução', ready: 'Pronto para confirmar', notReady: 'Ajuste caixa ou posições', from: 'de', aim: 'Mira', utility: 'Utilitária', clutch: 'Clutch', opening: 'Abertura', recovery: 'Recuperação' },
    es: { swaps: 'Intercambios directos', gives: 'Entregas', gets: 'Recibes', pay: 'Pagas', receive: 'Recibes', even: 'Sin diferencia', accept: 'Aceptar intercambio', offRole: 'fuera de posición', strength: 'fuerza', empty: 'Aún sin Majors registrados', major: 'Major', placement: 'Posición', rating: 'Rating', overall: 'OVR', training: 'Entreno', evolution: 'Evolución', ready: 'Listo para confirmar', notReady: 'Ajusta caja o posiciones', from: 'de', aim: 'Puntería', utility: 'Utilidad', clutch: 'Clutch', opening: 'Apertura', recovery: 'Recuperación' },
    en: { swaps: 'Direct swaps', gives: 'You give', gets: 'You get', pay: 'You pay', receive: 'You receive', even: 'Even swap', accept: 'Accept swap', offRole: 'out of position', strength: 'strength', empty: 'No Majors recorded yet', major: 'Major', placement: 'Placement', rating: 'Rating', overall: 'OVR', training: 'Training', evolution: 'Evolution', ready: 'Ready to confirm', notReady: 'Fix cash or positions', from: 'from', aim: 'Aim', utility: 'Utility', clutch: 'Clutch', opening: 'Opening', recovery: 'Recovery' }
  } as const;

  let selectedOut: string | null = null;
  let query = '';
  let error = '';
  let sheet: { title: string; subtitle: string; headers: string[]; rows: string[][] } | null = null;
  let dealtFor = -1;
  let fresh = false;

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  $: c = copy[language];
  $: lineup = windowLineup(state);
  $: cash = windowCash(state);
  $: left = movesLeft(state);
  $: problems = lineupProblems(state);
  $: offRole = windowOffRolePlayerIds(state, playerById);
  $: ready = canConfirmWindow(state);
  $: soldIds = new Set(state.moves.map((move) => move.outPlayerId));
  $: boughtIds = new Set(state.moves.map((move) => move.inPlayerId));
  $: targetUsed = state.moves.some((move) => move.kind === 'target');
  $: swapOffers = state.swapOffers ?? [];
  $: lineupBaseIds = new Set(lineup.flatMap((selected) => { const player = playerById.get(selected.playerId); return player ? [getPlayerBaseId(player)] : []; }));
  $: searchResults = query.trim().length >= 2
    ? catalog.filter((player) => (player.nickname ?? '').toLowerCase().includes(query.trim().toLowerCase()) && !lineupBaseIds.has(getPlayerBaseId(player))).slice(0, 12)
    : [];
  // Deal the market cards once per window; reloads of the same window do not replay the animation.
  $: if (state.majorNumber !== dealtFor) { dealtFor = state.majorNumber; fresh = true; setTimeout(() => { fresh = false; }, 1400); }

  const view = (playerId: string) => {
    const player = playerById.get(playerId);
    return player ? resolveDynastyPlayer(player, state.overrides[playerId]) : null;
  };
  const nick = (playerId: string) => playerById.get(playerId)?.nickname ?? playerId;
  const problemMessage = (problem: MoveProblem) => (problem === 'no-cash' ? t('windowNoCash') : problem === 'no-moves' ? t('windowNoMoves') : t('windowInvalidMove'));
  const signedUsd = (value: number) => (value === 0 ? c.even : value > 0 ? `${c.receive} ${formatUsd(value, language)}` : `${c.pay} ${formatUsd(-value, language)}`);

  function tryMove(outPlayerId: string | null, incoming: IncomingPlayer) {
    error = '';
    if (!outPlayerId) { error = t('windowPickSale'); return; }
    const problem = checkMove(state, outPlayerId, incoming, playerById);
    if (problem) { error = problemMessage(problem); return; }
    onChange(makeMove(state, outPlayerId, incoming, playerById));
    selectedOut = null;
  }

  function pickCoach(coachId: string | null) {
    error = '';
    onChange(chooseCoach(state, coachId, coachById));
  }

  function openPlayer(playerId: string) {
    const player = playerById.get(playerId);
    if (!player) return;
    const entries = playerMajorHistory(history, player, playerById);
    sheet = {
      title: player.nickname ?? player.id,
      subtitle: teamLabel(player.teamId ?? ''),
      headers: [c.major, c.placement, c.rating, c.overall, c.training, c.evolution],
      rows: entries.map((entry) => [
        `#${entry.majorNumber}`,
        translatePlacement(language, entry.placement),
        entry.rating === null ? '—' : entry.rating.toFixed(2),
        entry.overall === null ? '—' : String(entry.overall),
        entry.training ? c[entry.training] : '—',
        entry.evolution ? `${entry.evolution.overallBefore} → ${entry.evolution.overallAfter}` : '—'
      ])
    };
  }

  function openCoach(coach: Coach) {
    sheet = {
      title: coach.name,
      subtitle: teamLabel(coach.teamId),
      headers: [c.major, c.placement, c.rating],
      rows: coachMajorHistory(history, coach.id).map((entry) => [
        `#${entry.majorNumber}`, translatePlacement(language, entry.placement), entry.averageRating === null ? '—' : entry.averageRating.toFixed(2)
      ])
    };
  }
</script>

<div class="window">
  <section class="status" role="status">
    <span>{t('windowCash')} <b class:negative={cash < 0}>{formatUsd(cash, language)}</b></span>
    <span>{t('windowMovesLeft')} <b>{left}</b></span>
    {#if offRole.length}
      <span class="warn">{offRole.length} {c.offRole} · −{(OFF_ROLE_PENALTY * 100 * offRole.length).toLocaleString(language, { maximumFractionDigits: 1 })}% {c.strength} (×{positionMultiplier(offRole.length).toFixed(3)})</span>
    {/if}
    <span class="readiness" class:ok={ready}>{ready ? c.ready : c.notReady}</span>
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowEvolution')}</span>
    <ul class="evolution">
      {#each state.evolution as entry (entry.fromPlayerId)}
        <li class={entry.kind}>
          <b>{nick(entry.fromPlayerId)}</b>
          <span>{entry.kind === 'version' ? `${t('windowVersion')} · ${playerById.get(entry.toPlayerId)?.year ?? ''}` : entry.kind === 'drift' ? t('windowDrift') : t('windowStable')}</span>
          <em>{entry.overallBefore} → {entry.overallAfter}</em>
          {#if entry.training}<small>+{entry.training.delta} {entry.training.attribute}</small>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowLineup')}</span>
    <div class="cards lineup">
      {#each lineup as selected (selected.playerId)}
        {@const player = view(selected.playerId)}
        {#if player}
          <DynastyPlayerCard
            {player}
            role={selected.selectedSlotRole}
            offRole={offRole.includes(selected.playerId)}
            evolution={state.evolution.find((entry) => entry.toPlayerId === selected.playerId) ?? null}
            training={state.overrides[selected.playerId]?.training ?? null}
            teamLabel={teamLabel(player.teamId ?? '')}
            {language}
            selected={selectedOut === selected.playerId}
            onOpen={() => openPlayer(selected.playerId)}
          >
            <DynastyRoleChips value={selected.selectedSlotRole} eligible={getEligibleSlotRoles(player)} {language} label={getRoleLabel(selected.selectedSlotRole)} onChange={(role) => onChange(assignRole(state, selected.playerId, role))} />
            {#if !boughtIds.has(selected.playerId) && !soldIds.has(selected.playerId)}
              <button class="sell" type="button" class:active={selectedOut === selected.playerId} disabled={left <= 0} on:click={() => { selectedOut = selectedOut === selected.playerId ? null : selected.playerId; error = ''; }}>
                {selectedOut === selected.playerId ? t('windowSelling') : t('windowSell')} · {formatUsd(salePriceFor(state, selected.playerId, playerById), language)}
              </button>
            {/if}
          </DynastyPlayerCard>
        {/if}
      {/each}
    </div>
    {#if problems.length}<p class="warning">{t('windowFixRoles')}</p>{/if}
    {#if error}<p class="warning" role="alert">{error}</p>{/if}
  </section>

  {#if state.proposals.length || swapOffers.length}
    <section class="block">
      {#if state.proposals.length}
        <span class="eyebrow">{t('windowProposals')}</span>
        <ul class="deals">{#each state.proposals as proposal (proposal.playerId)}<li><b>{nick(proposal.playerId)}</b><em>{formatUsd(proposal.price, language)}</em></li>{/each}</ul>
      {/if}
      {#if swapOffers.length}
        <span class="eyebrow">{c.swaps}</span>
        <div class="swaps">
          {#each swapOffers as offer (offer.id)}
            {@const theirs = playerById.get(offer.theirPlayerId)}
            {@const used = state.moves.some((move) => move.kind === 'swap' && move.inPlayerId === offer.theirPlayerId)}
            {#if theirs}
              <article class="swap" class:used>
                <div><small>{c.gives}</small><b>{nick(offer.forPlayerId)}</b><span>{view(offer.forPlayerId)?.overall ?? '—'}</span></div>
                <div><small>{c.gets} · {c.from} {teamLabel(offer.fromTeamId)}</small><b>{theirs.nickname}</b><span>{theirs.overall ?? '—'}</span></div>
                <p>{signedUsd(offer.cashDelta)}</p>
                <button class="primary" type="button" disabled={used || left <= 0 || soldIds.has(offer.forPlayerId)} on:click={() => tryMove(offer.forPlayerId, { kind: 'swap', playerId: offer.theirPlayerId, offerId: offer.id })}>{c.accept}</button>
              </article>
            {/if}
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="block">
    <span class="eyebrow">{t('windowMarket')}</span>
    <div class="cards market" class:fresh>
      {#each state.offers as offer, index (offer.playerId)}
        {@const player = playerById.get(offer.playerId)}
        {#if player}
          <div class="deal" style={`--reveal-delay:${index * 60}ms`}>
            <DynastyPlayerCard {player} teamLabel={teamLabel(player.teamId ?? '')} {language} onOpen={null}>
              {#if offer.focusRole}<small class="focus">{t('windowFocus')} · {getRoleLabel(offer.focusRole)}</small>{/if}
              <button class="primary" type="button" disabled={boughtIds.has(offer.playerId) || left <= 0} on:click={() => tryMove(selectedOut, { kind: 'offer', playerId: offer.playerId })}>{t('windowBuy')} · {formatUsd(offer.price, language)}</button>
            </DynastyPlayerCard>
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <section class="block">
    <span class="eyebrow">{t('windowTarget')}</span>
    <label class="search">
      <span class="sr-only">{t('windowSearch')}</span>
      <input type="search" bind:value={query} placeholder={t('windowSearch')} disabled={targetUsed} autocomplete="off" />
    </label>
    {#if !targetUsed && searchResults.length}
      <ul class="deals">
        {#each searchResults as player (player.id)}
          <li><b>{player.nickname} {player.year ?? ''}</b><span class="ovr">{player.overall ?? 70}</span><button class="secondary" type="button" disabled={left <= 0} on:click={() => tryMove(selectedOut, { kind: 'target', playerId: player.id })}>{t('windowBuy')} · {formatUsd(buyPriceFor(state, { kind: 'target', playerId: player.id }, playerById) ?? 0, language)}</button></li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if state.moves.length}
    <section class="block">
      <span class="eyebrow">{t('windowMoves')}</span>
      <ul class="deals">
        {#each state.moves as move, index (move.outPlayerId)}
          <li><b>{nick(move.outPlayerId)} → {nick(move.inPlayerId)}</b><em>+{formatUsd(move.salePrice, language)} / −{formatUsd(move.buyPrice, language)}</em><button class="ghost" type="button" on:click={() => onChange(undoMove(state, index))}>{t('windowUndo')}</button></li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="block">
    <span class="eyebrow">{t('windowCoachOffers')}</span>
    <div class="cards coaches">
      {#if currentCoach}
        <DynastyCoachCard coach={currentCoach} teamLabel={teamLabel(currentCoach.teamId)} {language} selected={state.coachChange === null} onOpen={() => currentCoach && openCoach(currentCoach)}>
          <button class="secondary" type="button" disabled={state.coachChange === null} on:click={() => pickCoach(null)}>{t('windowCoachKeep')}</button>
        </DynastyCoachCard>
      {/if}
      {#each state.coachOfferIds as coachId (coachId)}
        {@const coach = coachById.get(coachId)}
        {#if coach}
          <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language} selected={state.coachChange?.coachId === coachId} onOpen={() => openCoach(coach)}>
            <button class="primary" type="button" disabled={state.coachChange?.coachId === coachId} on:click={() => pickCoach(coachId)}>{t('windowHire')} · {formatUsd(coachMarketValue(coach), language)}</button>
          </DynastyCoachCard>
        {/if}
      {/each}
    </div>
  </section>

  <button class="primary confirm" type="button" disabled={!ready} on:click={onConfirm}>{t('windowConfirm')} →</button>
</div>

{#if sheet}
  <DynastyCardSheet title={sheet.title} subtitle={sheet.subtitle} headers={sheet.headers} rows={sheet.rows} emptyLabel={c.empty} {language} onClose={() => (sheet = null)} />
{/if}

<style>
  .window { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .block { display: grid; gap: 12px; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .status { position: sticky; top: 8px; z-index: 4; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 12px 16px; border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 6%, var(--surface)); font-size: .8rem; }
  .status b { color: var(--accent); font-size: 1rem; }
  .status b.negative { color: var(--danger); }
  .status .warn { color: var(--accent-2); font-weight: 800; }
  .readiness { margin-left: auto; font-size: .66rem; font-weight: 900; text-transform: uppercase; color: var(--accent-2); }
  .readiness.ok { color: var(--accent); }
  .evolution { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); margin: 0; padding: 0; list-style: none; }
  .evolution li { display: grid; gap: 2px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); font-size: .74rem; }
  .evolution li.version em, .evolution li.drift em { color: var(--accent); }
  .evolution small { color: var(--accent); font-weight: 900; text-transform: uppercase; }
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
  .sell { min-height: 36px; padding: 0 10px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: 800 .66rem/1 Inter, Arial, sans-serif; text-transform: uppercase; cursor: pointer; }
  .sell.active { border-color: var(--accent); color: var(--accent); }
  .warning { margin: 0; color: var(--accent-2); font-size: .78rem; }
  .deals { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .deals li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); }
  .deals b { overflow-wrap: anywhere; }
  .swaps { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }
  .swap { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); border-radius: 6px; background: var(--surface-2); }
  .swap.used { opacity: .55; }
  .swap div { display: grid; gap: 2px; min-width: 0; }
  .swap small { color: var(--muted); font-size: .6rem; text-transform: uppercase; overflow-wrap: anywhere; }
  .swap span { color: var(--accent); font-weight: 900; }
  .swap p, .swap button { grid-column: 1 / -1; margin: 0; }
  .focus { color: var(--accent); font-size: .6rem; font-weight: 900; text-transform: uppercase; }
  .market.fresh .deal { animation: deal-in 520ms cubic-bezier(.16, 1, .3, 1) backwards; animation-delay: var(--reveal-delay, 0ms); }
  @keyframes deal-in { from { transform: perspective(900px) rotateY(80deg) translateY(12px); opacity: 0; } }
  .search input { width: 100%; min-height: 46px; padding: 0 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); color: var(--text); font: 600 .9rem/1 Inter, Arial, sans-serif; }
  .search input::placeholder { color: var(--muted); }
  .search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
  .search input:disabled { opacity: .5; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .ovr { color: var(--accent); font-weight: 900; }
  .confirm { width: 100%; }
  @media (max-width: 560px) { .deals li { grid-template-columns: minmax(0, 1fr) auto; } .deals li button { grid-column: 1 / -1; } .readiness { margin-left: 0; } }
  @media (prefers-reduced-motion: reduce) { .market.fresh .deal { animation: none; } }
</style>
```

- [ ] **Step 2: Página**

Em `src/routes/+page.svelte`, no `<DynastyWindow ... />` (linha ~1283), acrescentar `history={$game.dynasty.history}` depois de `catalog={players}`.

- [ ] **Step 3: Verificar**

Run: `npm run check && npx vitest run && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, suíte verde, build ok.

Se o `svelte-check` apontar `translatePlacement` inexistente, confirme o export em `src/lib/game/i18n.ts`. A página já o importa, então ele existe.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/DynastyWindow.svelte src/routes/+page.svelte
git commit -m "feat: janela da Dinastia em cartas com chips de posição, trocas diretas e histórico

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 6: Aba Time com cartas

**Files:**
- Modify: `src/lib/components/DynastyTeamPanel.svelte` (reescrita)
- Modify: `src/routes/+page.svelte` (props do `<DynastyTeamPanel ... />`, linha ~1372)

**Interfaces:**
- Consumes:
  - componentes: `DynastyPlayerCard`, `DynastyCoachCard` e `DynastyCardSheet`;
  - funções: `offRolePlayerIds` e `positionMultiplier`; `playerMajorHistory` e `coachMajorHistory`.
- Produces:
  - props mantidas: `players`, `coach`, `plan`, `power`, `studiesLeft`, `language`, `training`;
  - props novas: `lineup: SelectedPlayer[] = []`, `history: DynastyMajorSummary[] = []`, `playerById: Map<string, Player> = new Map()`, `overrides: Record<string, PlayerOverride> = {}`, `teamLabel: (teamId: string) => string`.

- [ ] **Step 1: Reescrever `DynastyTeamPanel.svelte`**

```svelte
<script lang="ts">
  import DynastyCardSheet from './DynastyCardSheet.svelte';
  import DynastyCoachCard from './DynastyCoachCard.svelte';
  import DynastyPlayerCard from './DynastyPlayerCard.svelte';
  import { coachMajorHistory, playerMajorHistory } from '$lib/game/dynasty/cards';
  import { offRolePlayerIds, positionMultiplier } from '$lib/game/dynasty/position';
  import { translatePlacement } from '$lib/game/i18n';
  import type { Coach, DynastyMajorSummary, Language, Player, PlayerOverride, SelectedPlayer, SeriesPlan, TrainingFocus } from '$lib/game/types';

  export let players: Player[] = [];
  export let lineup: SelectedPlayer[] = [];
  export let coach: Coach | null = null;
  export let plan: SeriesPlan;
  export let power = 0;
  export let studiesLeft = 0;
  export let language: Language = 'pt-BR';
  export let training: TrainingFocus | null = null;
  export let history: DynastyMajorSummary[] = [];
  export let playerById: Map<string, Player> = new Map();
  export let overrides: Record<string, PlayerOverride> = {};
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;

  const copy = {
    'pt-BR': { title: 'Análise do time', power: 'Poder efetivo', coach: 'Coach', studies: 'Estudos restantes', plan: 'Plano', training: 'Treino', positions: 'Posições', offRole: 'fora de posição', allGood: 'todas elegíveis', major: 'Major', placement: 'Colocação', rating: 'Rating', overall: 'OVR', evolution: 'Evolução', empty: 'Sem Majors registrados ainda', aggressive: 'Agressivo', balanced: 'Controlador', tactical: 'Tático', standard: 'Padrão', pressure: 'Pressão', control: 'Controle', antistrat: 'Anti-strat', aim: 'Mira', utility: 'Utilitária', clutch: 'Clutch', opening: 'Abertura', recovery: 'Recuperação' },
    es: { title: 'Análisis del equipo', power: 'Poder efectivo', coach: 'Coach', studies: 'Estudios restantes', plan: 'Plan', training: 'Entrenamiento', positions: 'Posiciones', offRole: 'fuera de posición', allGood: 'todas elegibles', major: 'Major', placement: 'Posición', rating: 'Rating', overall: 'OVR', evolution: 'Evolución', empty: 'Aún sin Majors registrados', aggressive: 'Agresivo', balanced: 'Controlador', tactical: 'Táctico', standard: 'Estándar', pressure: 'Presión', control: 'Control', antistrat: 'Anti-strat', aim: 'Puntería', utility: 'Utilidad', clutch: 'Clutch', opening: 'Apertura', recovery: 'Recuperación' },
    en: { title: 'Team analysis', power: 'Effective power', coach: 'Coach', studies: 'Studies left', plan: 'Plan', training: 'Training', positions: 'Positions', offRole: 'out of position', allGood: 'all eligible', major: 'Major', placement: 'Placement', rating: 'Rating', overall: 'OVR', evolution: 'Evolution', empty: 'No Majors recorded yet', aggressive: 'Aggressive', balanced: 'Controller', tactical: 'Tactical', standard: 'Standard', pressure: 'Pressure', control: 'Control', antistrat: 'Anti-strat', aim: 'Aim', utility: 'Utility', clutch: 'Clutch', opening: 'Opening', recovery: 'Recovery' }
  } as const;

  let sheet: { title: string; subtitle: string; headers: string[]; rows: string[][] } | null = null;

  $: labels = copy[language];
  $: offRole = offRolePlayerIds(players, lineup);
  $: roleOf = (playerId: string) => lineup.find((selected) => selected.playerId === playerId)?.selectedSlotRole ?? null;

  function openPlayer(player: Player) {
    const entries = playerMajorHistory(history, player, playerById);
    sheet = {
      title: player.nickname ?? player.id,
      subtitle: teamLabel(player.teamId ?? ''),
      headers: [labels.major, labels.placement, labels.rating, labels.overall, labels.training, labels.evolution],
      rows: entries.map((entry) => [
        `#${entry.majorNumber}`,
        translatePlacement(language, entry.placement),
        entry.rating === null ? '—' : entry.rating.toFixed(2),
        entry.overall === null ? '—' : String(entry.overall),
        entry.training ? labels[entry.training] : '—',
        entry.evolution ? `${entry.evolution.overallBefore} → ${entry.evolution.overallAfter}` : '—'
      ])
    };
  }

  function openCoach(current: Coach) {
    sheet = {
      title: current.name,
      subtitle: teamLabel(current.teamId),
      headers: [labels.major, labels.placement, labels.rating],
      rows: coachMajorHistory(history, current.id).map((entry) => [`#${entry.majorNumber}`, translatePlacement(language, entry.placement), entry.averageRating === null ? '—' : entry.averageRating.toFixed(2)])
    };
  }
</script>

<section class="team-panel">
  <header>
    <div><span class="eyebrow">DINASTIA</span><h2>{labels.title}</h2></div>
    <strong>{power.toFixed(1)}</strong>
  </header>

  <div class="metrics">
    <span>{labels.power}<b>{power.toFixed(1)}</b></span>
    <span>{labels.plan}<b>{labels[plan.style]} · {labels[plan.tactic]}</b></span>
    <span>{labels.studies}<b>{studiesLeft}</b></span>
    <span>{labels.training}<b>{training ? labels[training] : '—'}</b></span>
    <span class:warn={offRole.length > 0}>{labels.positions}<b>{offRole.length ? `${offRole.length} ${labels.offRole} · ×${positionMultiplier(offRole.length).toFixed(3)}` : labels.allGood}</b></span>
  </div>

  <div class="cards">
    {#each players as player (player.id)}
      <DynastyPlayerCard
        {player}
        role={roleOf(player.id)}
        offRole={offRole.includes(player.id)}
        training={overrides[player.id]?.training ?? null}
        teamLabel={teamLabel(player.teamId ?? '')}
        {language}
        onOpen={() => openPlayer(player)}
      />
    {/each}
    {#if coach}
      <DynastyCoachCard {coach} teamLabel={teamLabel(coach.teamId)} {language} onOpen={() => coach && openCoach(coach)} />
    {/if}
  </div>
</section>

{#if sheet}
  <DynastyCardSheet title={sheet.title} subtitle={sheet.subtitle} headers={sheet.headers} rows={sheet.rows} emptyLabel={labels.empty} {language} onClose={() => (sheet = null)} />
{/if}

<style>
  .team-panel { display: grid; gap: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  header { display: flex; justify-content: space-between; align-items: end; gap: 12px; }
  h2 { margin: 0; }
  header > strong { color: var(--accent); font: 900 2.4rem/1 'Arial Narrow', Impact, sans-serif; }
  .metrics { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); }
  .metrics span { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .metrics b { color: var(--text); font-size: .9rem; letter-spacing: 0; text-transform: none; overflow-wrap: anywhere; }
  .metrics .warn b { color: var(--accent-2); }
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr)); }
</style>
```

- [ ] **Step 2: Página**

No `<DynastyTeamPanel ... />` (linha ~1372), acrescentar:

```svelte
lineup={selectedLineup} history={$game.dynasty.history} {playerById} overrides={$game.dynasty.playerOverrides} teamLabel={coachTeamLabel}
```

`coachTeamLabel` e `playerById` já existem na página. Confirme com `grep -n "const coachTeamLabel\|playerById" src/routes/+page.svelte`.

- [ ] **Step 3: Verificar**

Run: `npm run check && npx vitest run && npm run build`
Expected: `0 ERRORS 0 WARNINGS`, suíte verde e build ok.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/DynastyTeamPanel.svelte src/routes/+page.svelte
git commit -m "feat: aba Time da Dinastia com cartas do elenco e do coach e histórico por Major

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 7: Gate final e push

- [ ] **Step 1: Gate**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected:
- svelte-check `0 ERRORS 0 WARNINGS`;
- vitest com todos os arquivos passando, incluindo `dynastyPosition`, `dynastyCards` e `dynastyWindow` (12);
- builds do front e do servidor;
- nenhuma linha de snapshot.

- [ ] **Step 2: Verificação no navegador**

Execute se houver navegador. Se não houver, registre no relato que não foi feita. Use `npm run dev` em http://127.0.0.1:5173, em 1280 px e em 375 px:
1. Jogar um Major da Dinastia até o resultado e abrir a janela.
2. Mercado: as cartas entram com a animação de distribuir. A barra de status fica fixa.
3. Mover um jogador para uma posição inelegível pelos chips. O status mostra "1 fora de posição · −1,5%" e o botão confirmar continua habilitado.
4. Escolher uma posição cheia: os dois jogadores trocam de posição.
5. Aceitar uma troca direta: o caixa muda pela diferença e as trocas restantes caem 1.
6. Abrir o histórico de uma carta. No 1º Major a folha pode vir vazia; no 2º mostra a linha do Major anterior.
7. Com `prefers-reduced-motion` ligado no DevTools, o flip é instantâneo e as cartas entram sem animação.
8. Em 375 px, nenhum scroll horizontal.
9. Normal com a seed `dourado-normal-2026` continua igual.

- [ ] **Step 3: Push**

```bash
git push origin feat/dinastia
git ls-remote --heads origin feat/dinastia main
```

Expected: `feat/dinastia` no mesmo hash do HEAD local e `main` remota inalterada.

- [ ] **Step 4: Relato**

Relatar:
- commits e testes com as contagens;
- testes existentes alterados, com o motivo;
- se a verificação no navegador foi feita;
- divergências em relação ao plano.

## Riscos

- **Faixa das trocas.** O catálogo real pode não ter jogador elegível a ±5 de overall para jogadores muito fortes, com overall 95 ou mais. Nesse caso sai menos de 2 ofertas. É o comportamento aceito: a regra não é afrouxada.
- **Flip 3D.** O Safari precisa de `-webkit-backface-visibility`, que já está no CSS. Em aparelhos fracos o flip pode travar; `prefers-reduced-motion` remove a animação.
- **Folha de histórico.** Summaries antigos não têm `overalls`, `training` nem `evolution`, então essas colunas saem "—".
- **Troca de posição em cascata.** Com `assignRole`, quem é deslocado fica com a posição de quem entrou, que pode ser inelegível para ele. A penalidade reflete isso, e a tela mostra o aviso na carta.

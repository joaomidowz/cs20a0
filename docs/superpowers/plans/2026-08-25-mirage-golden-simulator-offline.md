# Mirage Golden Simulator Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir, somente em Mirage offline, o radar esquemático pelo simulador visual do `tests/simulator.html`, integrado ao resultado oficial da campanha e às funções, estilos e economia da line escolhida.

**Architecture:** O HTML ouro será decomposto em dados imutáveis de Mirage, navegação, tática, economia, simulação determinística a 32 ticks e renderização Canvas. Um componente específico reproduzirá o HUD ouro para Mirage; o componente atual continuará atendendo os outros seis mapas. O resultado de `MapResult` permanecerá autoritativo e a velocidade será uma propriedade local do viewer.

**Tech Stack:** TypeScript estrito, Svelte 5, Canvas 2D, Vitest, APIs nativas do navegador e script Node.js de extração mecânica.

## Global Constraints

- Trabalhar somente no modo offline/singleplayer; não alterar servidor, protocolo, contratos online, push ou deploy.
- Preservar `tests/simulator.html` intacto e fora dos commits.
- Mirage deve usar os bytes exatos de `MAP_IMG` e `GRID_B64` do HTML ouro.
- SHA-256 esperado da imagem WebP: `6868b21b2dc71ced062df6c9edf8b8249fcd7a0236f0c902bbc136b9c599b380`.
- SHA-256 esperado da grade decodificada: `c95a9e7cb1d6a18186994075c57afd9193882edb3cb7ce5a79000663ecccaba5`.
- Não levar calibrador, marcação de pixel, `localStorage` de calibração ou edição de utilitárias ao produto.
- Ancient, Anubis, Cache, Dust II, Inferno e Nuke devem continuar no viewer atual.
- O placar e o vencedor de cada round vêm de `MapResult`; a replay não recalcula a campanha nem substitui `createRunStats`.
- Normal é `4x`, Rápido é `8x` e Ultra termina o round instantaneamente.
- Preservar `selectedSlotRole`; não converter IGL, support ou lurker em outra função para preencher uma responsabilidade de squad.
- Não introduzir dependências de runtime nem TypeScript `any`.

---

## File Structure

- `scripts/extract-mirage-golden.mjs`: extrai mecanicamente imagem e grade do HTML ouro e valida os hashes.
- `static/replay/maps/mirage.webp`: radar real extraído byte a byte.
- `src/lib/game/replay/golden/mirage-grid.generated.ts`: base64 exato da grade de colisão.
- `src/lib/game/replay/golden/mirage-data.ts`: constantes, spawns, sites e pontos canônicos.
- `src/lib/game/replay/golden/types.ts`: contratos compactos de estado, frames, eventos, inventário e itens no chão.
- `src/lib/game/replay/golden/navigation.ts`: colisão, flow fields, LOS e movimento.
- `src/lib/game/replay/golden/tactics.ts`: estilos, estratégias e responsabilidades de squad.
- `src/lib/game/replay/golden/economy.ts`: compras, entregas, drops, coleta e persistência entre rounds.
- `src/lib/game/replay/golden/simulate.ts`: motor determinístico de Mirage e trava do resultado oficial.
- `src/lib/game/replay/golden/render.ts`: desenho Canvas fiel ao HTML ouro.
- `src/lib/game/replay/golden/snapshot.ts`: leitura e interpolação dos arrays compactos.
- `src/lib/components/GoldenMirageReplayViewer.svelte`: HUD e player ouro sem ferramentas de edição.
- `src/lib/components/SchematicReplayViewer.svelte`: viewer atual, movido sem mudança funcional.
- `src/lib/components/ReplayViewer.svelte`: roteador pequeno entre o viewer ouro e o esquemático.
- `tests/goldenMirageAssets.test.ts`: integridade dos dados extraídos.
- `tests/goldenMirageNavigation.test.ts`: colisão e caminhos.
- `tests/goldenMirageTactics.test.ts`: estilos e funções.
- `tests/goldenMirageEconomy.test.ts`: compras, itens no chão e entregas.
- `tests/goldenMirageSimulation.test.ts`: determinismo, resultado oficial e regras do round.
- `tests/goldenMirageRenderer.test.ts`: contratos do renderer e ausência do editor.
- `tests/goldenMirageIntegration.test.ts`: seleção do viewer e HUD.

---

### Task 1: Extrair e fixar os dados ouro de Mirage

**Files:**
- Create: `scripts/extract-mirage-golden.mjs`
- Create: `static/replay/maps/mirage.webp`
- Create: `src/lib/game/replay/golden/mirage-grid.generated.ts`
- Create: `tests/goldenMirageAssets.test.ts`

**Interfaces:**
- Produces: `MIRAGE_GRID_B64: string`
- Produces: `/replay/maps/mirage.webp`
- Consumes: `tests/simulator.html` somente quando o script de extração é executado manualmente.

- [ ] **Step 1: Escrever o teste de integridade que falha antes dos artefatos existirem**

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIRAGE_GRID_B64 } from '../src/lib/game/replay/golden/mirage-grid.generated';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('Mirage golden assets', () => {
  it('preserves the exact embedded radar bytes', () => {
    const image = readFileSync(new URL('../static/replay/maps/mirage.webp', import.meta.url));
    expect(image.byteLength).toBe(21_224);
    expect(sha256(image)).toBe('6868b21b2dc71ced062df6c9edf8b8249fcd7a0236f0c902bbc136b9c599b380');
  });

  it('preserves the exact embedded collision grid', () => {
    const grid = Buffer.from(MIRAGE_GRID_B64, 'base64');
    expect(grid.byteLength).toBe(4_608);
    expect(sha256(grid)).toBe('c95a9e7cb1d6a18186994075c57afd9193882edb3cb7ce5a79000663ecccaba5');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha esperada**

Run: `npm test -- --run tests/goldenMirageAssets.test.ts`

Expected: FAIL porque `mirage-grid.generated.ts` e `mirage.webp` ainda não existem.

- [ ] **Step 3: Criar o extrator mecânico com validação antes da escrita**

```js
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('tests/simulator.html', 'utf8');
const literal = (name) => {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`));
  if (!match) throw new Error(`${name} not found in tests/simulator.html`);
  return match[1];
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assertHash = (label, bytes, expected) => {
  const actual = hash(bytes);
  if (actual !== expected) throw new Error(`${label} hash mismatch: ${actual}`);
};

const imageDataUrl = literal('MAP_IMG');
const imageBytes = Buffer.from(imageDataUrl.slice(imageDataUrl.indexOf(',') + 1), 'base64');
const gridBase64 = literal('GRID_B64');
const gridBytes = Buffer.from(gridBase64, 'base64');

assertHash('MAP_IMG', imageBytes, '6868b21b2dc71ced062df6c9edf8b8249fcd7a0236f0c902bbc136b9c599b380');
assertHash('GRID_B64', gridBytes, 'c95a9e7cb1d6a18186994075c57afd9193882edb3cb7ce5a79000663ecccaba5');

mkdirSync('static/replay/maps', { recursive: true });
mkdirSync('src/lib/game/replay/golden', { recursive: true });
writeFileSync('static/replay/maps/mirage.webp', imageBytes);
writeFileSync(
  'src/lib/game/replay/golden/mirage-grid.generated.ts',
  `// Generated from tests/simulator.html. Do not edit by hand.\nexport const MIRAGE_GRID_B64 = '${gridBase64}' as const;\n`
);
```

- [ ] **Step 4: Executar o extrator e fazer o teste passar**

Run: `node scripts/extract-mirage-golden.mjs`

Run: `npm test -- --run tests/goldenMirageAssets.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Commitar somente script, asset, módulo gerado e teste**

```bash
git add scripts/extract-mirage-golden.mjs static/replay/maps/mirage.webp src/lib/game/replay/golden/mirage-grid.generated.ts tests/goldenMirageAssets.test.ts
git commit -m "feat: extrai radar ouro de Mirage"
```

---

### Task 2: Tipar o modelo ouro e portar colisão, LOS e navegação

**Files:**
- Create: `src/lib/game/replay/golden/types.ts`
- Create: `src/lib/game/replay/golden/mirage-data.ts`
- Create: `src/lib/game/replay/golden/navigation.ts`
- Create: `tests/goldenMirageNavigation.test.ts`

**Interfaces:**
- Produces: `createMirageNavigation(): GoldenNavigation`
- Produces: `GoldenRoundReplayV1`, `GoldenPlayerState`, `GoldenGroundItem`, `GoldenReplayEvent`
- Consumes: `MIRAGE_GRID_B64`

- [ ] **Step 1: Escrever testes de colisão e caminho usando pontos literais do HTML**

```ts
import { describe, expect, it } from 'vitest';
import { createMirageNavigation } from '../src/lib/game/replay/golden/navigation';
import { MIRAGE_POINTS } from '../src/lib/game/replay/golden/mirage-data';

describe('Mirage golden navigation', () => {
  it('decodes the 192 by 192 collision grid', () => {
    const navigation = createMirageNavigation();
    expect(navigation.gridSize).toBe(192);
    expect(navigation.worldSize).toBe(1_024);
    expect(navigation.walkableCells).toBeGreaterThan(1_000);
  });

  it('keeps canonical spawns and sites connected through walkable cells', () => {
    const navigation = createMirageNavigation();
    for (const destination of [MIRAGE_POINTS.siteA, MIRAGE_POINTS.siteB, MIRAGE_POINTS.mid]) {
      const path = navigation.findPath(MIRAGE_POINTS.tSpawn, destination);
      expect(path.length).toBeGreaterThan(2);
      expect(path.every((point) => navigation.isFree(point.x, point.y))).toBe(true);
    }
  });

  it('blocks line of sight through radar walls', () => {
    const navigation = createMirageNavigation();
    expect(navigation.hasWallBetween({ x: 677, y: 960 }, { x: 768.5, y: 193.6 })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por módulos ausentes**

Run: `npm test -- --run tests/goldenMirageNavigation.test.ts`

Expected: FAIL com erro de importação de `golden/navigation`.

- [ ] **Step 3: Criar os contratos compactos sem `any`**

```ts
import type { LineupSlotRole, OrgStyle } from '../../types';
import type { ReplaySide } from '../types';

export type GoldenWeapon = 'knife' | 'glock' | 'usp' | 'p2000' | 'duals' | 'p250' | 'deagle' | 'mp9' | 'mac10' | 'ump' | 'nova' | 'galil' | 'famas' | 'ak47' | 'm4a1' | 'awp';
export type GoldenGrenade = 'he' | 'flash' | 'smoke' | 'molotov';
export type GoldenStrategy = 'A_exec' | 'B_exec' | 'A_rush' | 'B_rush' | 'mid_A' | 'mid_B' | 'A_slow' | 'B_slow' | 'A_split' | 'B_split';

export interface GoldenPoint { x: number; y: number }
export interface GoldenInventory {
  primary: GoldenWeapon;
  secondary: GoldenWeapon;
  armor: number;
  helmet: boolean;
  kit: boolean;
  grenades: Record<GoldenGrenade, number>;
}
export interface GoldenPlayerState {
  id: string;
  organizationId: string;
  side: ReplaySide;
  selectedRole: LineupSlotRole;
  style: OrgStyle;
  money: number;
  inventory: GoldenInventory;
  x: number;
  y: number;
  angle: number;
  hp: number;
  alive: boolean;
}
export interface GoldenPlayerSnapshot {
  x: number;
  y: number;
  angle: number;
  hp: number;
  alive: boolean;
  planting: boolean;
  defusing: boolean;
  blind: boolean;
  hasBomb: boolean;
  firing: boolean;
  weapon: GoldenWeapon;
  actionProgress: number;
}
export interface GoldenGroundItem {
  id: string;
  kind: 'weapon' | 'grenade';
  weapon?: GoldenWeapon;
  grenade?: GoldenGrenade;
  x: number;
  y: number;
  sourcePlayerId: string;
  reservedForRole?: 'awper';
}
export interface GoldenRoundReplayV1 {
  number: number;
  tickRate: 32;
  frameStrideTicks: 2;
  playerIds: string[];
  sides: ReplaySide[];
  frames: number;
  snapshots: Float32Array;
  shots: Float32Array;
  events: GoldenReplayEvent[];
  winnerOrganizationId: string;
  durationMs: number;
  roleMetrics: {
    entryFirstChokeCrossing: boolean;
    lurkerSeparateUntilMs: number;
    awperAwpShare: number;
  };
}
export interface GoldenReplayEvent {
  tick: number;
  type: 'go' | 'shot' | 'kill' | 'grenade' | 'smoke' | 'fire' | 'flash' | 'he' | 'weapon-drop' | 'grenade-drop' | 'pickup' | 'delivery' | 'bomb-drop' | 'bomb-pickup' | 'plant' | 'defuse' | 'explode' | 'round-end';
  playerId?: string;
  targetPlayerId?: string;
  itemId?: string;
  weapon?: GoldenWeapon;
  grenade?: GoldenGrenade;
  x?: number;
  y?: number;
  site?: 'A' | 'B';
  winnerOrganizationId?: string;
}
export interface GoldenMatchReplayV1 {
  version: 1;
  planId: string;
  mapId: 'mirage';
  rounds: GoldenRoundReplayV1[];
  validation: {
    blockedPlayerSnapshots: number;
    mismatchedRoundWinners: number[];
  };
}
export interface GoldenStrategyProfile {
  weights: { exec: number; rush: number; mid: number; slow: number; split: number };
  executeShiftSeconds: number;
  reactiveFlashChance: number;
  ctDomainMultiplier: number;
}
export interface GoldenTacticalPlan {
  kind: GoldenStrategy;
  site: 'A' | 'B';
  executeAtSeconds: number;
  smokeTargets: GoldenPoint[];
  flashTargets: GoldenPoint[];
  coordinatedUtilityCount: number;
  profile: GoldenStrategyProfile;
}
export interface GoldenSquadAssignment {
  playerId: string;
  responsibility: 'ENTRY' | 'BANGER' | 'TRADER' | 'SECOND' | 'LURK';
  stackOrder: number;
  separateRoute: boolean;
}
```

- [ ] **Step 4: Portar o núcleo de navegação do HTML sem a calibração**

Portar as constantes e os corpos das funções de `tests/simulator.html:427-581`: RNG, `WORLD`, `GS`, `CSZ`, `PRAD`, unpack da grade, `isFree`, `nearestFree`, flow fields, `steerPoint`, `walkLine`, `losWall` e `segCircle`. Expor uma instância por replay para que caches não vazem entre seeds.

```ts
export interface GoldenNavigation {
  worldSize: 1_024;
  gridSize: 192;
  walkableCells: number;
  isFree(x: number, y: number): boolean;
  nearestFree(x: number, y: number): GoldenPoint;
  findPath(from: GoldenPoint, to: GoldenPoint): GoldenPoint[];
  steerPoint(from: GoldenPoint, to: GoldenPoint): GoldenPoint | null;
  hasWallBetween(from: GoldenPoint, to: GoldenPoint): boolean;
  segmentCrossesCircle(from: GoldenPoint, to: GoldenPoint, center: GoldenPoint, radius: number): boolean;
}
```

`mirage-data.ts` deve declarar literalmente `SITE_RECT`, `SITE_CENTER`, `SPAWN_CT`, `SPAWN_T`, `PLANT_SPOTS`, `UTIL_POINT`, `CT_POST`, `T_STAGE`, `T_CHOKE` e `PLAYBOOK` de `tests/simulator.html:593-665`, omitindo `CALIBRATION_STORAGE` e `CALIBRATION_TARGETS`.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test -- --run tests/goldenMirageAssets.test.ts tests/goldenMirageNavigation.test.ts`

Expected: 5 tests PASS.

```bash
git add src/lib/game/replay/golden/types.ts src/lib/game/replay/golden/mirage-data.ts src/lib/game/replay/golden/navigation.ts tests/goldenMirageNavigation.test.ts
git commit -m "feat: porta navegação ouro de Mirage"
```

---

### Task 3: Preservar estilos e funções no ReplayPlan

**Files:**
- Modify: `src/lib/game/replay/types.ts`
- Modify: `src/lib/game/replay/plan.ts`
- Create: `src/lib/game/replay/golden/tactics.ts`
- Modify: `tests/replayPlan.test.ts`
- Create: `tests/goldenMirageTactics.test.ts`

**Interfaces:**
- Produces: `selectGoldenStrategy(style, seed): GoldenTacticalPlan`
- Produces: `assignGoldenSquadResponsibilities(players, strategy): GoldenSquadAssignment[]`
- Extends: `ReplayOrganizationV1.style: OrgStyle`
- Extends: `ReplayTacticalRole` com `igl`

- [ ] **Step 1: Escrever testes que preservam a função escolhida e medem a cadência dos estilos**

```ts
import { describe, expect, it } from 'vitest';
import { selectGoldenStrategy } from '../src/lib/game/replay/golden/tactics';

describe('Mirage golden tactics', () => {
  it('makes aggressive teams faster without removing smoke executions', () => {
    const plans = Array.from({ length: 512 }, (_, index) => selectGoldenStrategy('aggressive', `aggressive:${index}`));
    const rushOrMid = plans.filter((plan) => plan.kind.includes('rush') || plan.kind.startsWith('mid_')).length;
    expect(rushOrMid).toBeGreaterThan(plans.length * 0.5);
    expect(plans.every((plan) => plan.smokeTargets.length > 0)).toBe(true);
    expect(plans.reduce((sum, plan) => sum + plan.executeAtSeconds, 0) / plans.length).toBeLessThan(18);
  });

  it('makes tactical teams slower and more coordinated', () => {
    const plans = Array.from({ length: 512 }, (_, index) => selectGoldenStrategy('tactical', `tactical:${index}`));
    expect(plans.reduce((sum, plan) => sum + plan.executeAtSeconds, 0) / plans.length).toBeGreaterThan(23);
    expect(plans.filter((plan) => plan.coordinatedUtilityCount >= 3).length).toBeGreaterThan(plans.length * 0.7);
  });

  it('keeps balanced weights equal to the HTML gold baseline', () => {
    const plan = selectGoldenStrategy('balanced', 'balanced:fixed');
    expect(plan.profile.weights).toEqual({ exec: 1, rush: 0.35, mid: 0.9, slow: 0.7, split: 0.8 });
  });
});
```

Adicionar em `tests/replayPlan.test.ts` uma line com `awper`, `igl`, `entry`, `lurker` e `support` e exigir que `plan.players.map(player => player.tacticalRole)` preserve `['awp', 'igl', 'entry', 'lurk', 'support']` na mesma ordem dos jogadores.

- [ ] **Step 2: Rodar testes e confirmar as falhas de contrato**

Run: `npm test -- --run tests/replayPlan.test.ts tests/goldenMirageTactics.test.ts`

Expected: FAIL porque `igl` ainda não é um `ReplayTacticalRole` e o seletor não existe.

- [ ] **Step 3: Corrigir o plano sem fabricar uma função de trade**

```ts
export type ReplayTacticalRole = 'entry' | 'trade' | 'support' | 'awp' | 'igl' | 'lurk' | 'rifler';

const directRole = (role: LineupSlotRole): ReplayTacticalRole =>
  role === 'awper' ? 'awp'
    : role === 'igl' ? 'igl'
      : role === 'lurker' ? 'lurk'
        : role === 'entry' ? 'entry'
          : role === 'support' ? 'support'
            : 'rifler';
```

Adicionar `style: team.style ?? 'balanced'` às duas organizações de `ReplayPlanV1`. O responsável pelo trade será escolhido por `assignGoldenSquadResponsibilities` sem alterar `tacticalRole`.

- [ ] **Step 4: Implementar perfis e seleção determinística**

```ts
export const GOLDEN_STYLE_PROFILES = {
  balanced: { weights: { exec: 1, rush: 0.35, mid: 0.9, slow: 0.7, split: 0.8 }, executeShiftSeconds: 0, reactiveFlashChance: 0.045, ctDomainMultiplier: 1 },
  aggressive: { weights: { exec: 1.2, rush: 1.5, mid: 1.35, slow: 0.15, split: 0.55 }, executeShiftSeconds: -6, reactiveFlashChance: 0.075, ctDomainMultiplier: 1.35 },
  tactical: { weights: { exec: 1.3, rush: 0.1, mid: 1.05, slow: 1.4, split: 1.2 }, executeShiftSeconds: 8, reactiveFlashChance: 0.055, ctDomainMultiplier: 1.6 }
} as const;
```

`entry` recebe `ENTRY`; um rifler, support ou IGL recebe `BANGER`; outro recebe `TRADER`; AWPer recebe `SECOND`; lurker recebe `LURK`. O entry sempre possui o menor `stackOrder`, e o lurker recebe rota separada e liberação posterior fora de rush.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test -- --run tests/replayPlan.test.ts tests/goldenMirageTactics.test.ts`

Expected: todos os testes PASS.

```bash
git add src/lib/game/replay/types.ts src/lib/game/replay/plan.ts src/lib/game/replay/golden/tactics.ts tests/replayPlan.test.ts tests/goldenMirageTactics.test.ts
git commit -m "feat: diferencia estilos e funções na replay"
```

---

### Task 4: Implementar economia coletiva, drops e coleta física

**Files:**
- Create: `src/lib/game/replay/golden/economy.ts`
- Create: `tests/helpers/goldenMirage.ts`
- Create: `tests/goldenMirageEconomy.test.ts`

**Interfaces:**
- Produces: `prepareGoldenRoundEconomy(state, context, rng): GoldenBuySummary`
- Produces: `dropGoldenInventory(player, deathPoint): GoldenGroundItem[]`
- Produces: `collectGoldenGroundItems(player, team, items): GoldenPickup[]`
- Produces: `settleGoldenRoundEconomy(state, result): void`
- Produces: `createGoldenEconomyState(players): GoldenEconomyState`

- [ ] **Step 1: Escrever os cenários de aceitação descritos pelo usuário**

```ts
import { describe, expect, it } from 'vitest';
import { collectGoldenGroundItems, deliverSavedWeapons, dropGoldenInventory, prepareGoldenRoundEconomy } from '../src/lib/game/replay/golden/economy';
import { goldenPlayer } from './helpers/goldenMirage';

describe('Mirage golden economy', () => {
  it('lets a T physically collect an M4A1 and remaining grenades from a CT body', () => {
    const ct = goldenPlayer({ id: 'ct', side: 'CT', primary: 'm4a1', grenades: { smoke: 1, flash: 1, he: 0, molotov: 0 }, x: 400, y: 500 });
    const t = goldenPlayer({ id: 't', side: 'T', primary: 'p250', x: 400, y: 500 });
    const items = dropGoldenInventory(ct, { x: 400, y: 500 });
    const pickups = collectGoldenGroundItems(t, [t], items);
    expect(t.inventory.primary).toBe('m4a1');
    expect(t.inventory.grenades.smoke).toBe(1);
    expect(t.inventory.grenades.flash).toBe(1);
    expect(pickups).toHaveLength(3);
  });

  it('does not collect an item without walking over the death position', () => {
    const t = goldenPlayer({ id: 't', side: 'T', primary: 'p250', x: 100, y: 100 });
    const items = [{ id: 'awp', kind: 'weapon', weapon: 'awp', x: 300, y: 300, sourcePlayerId: 'ct' }] as const;
    expect(collectGoldenGroundItems(t, [t], [...items])).toEqual([]);
    expect(t.inventory.primary).toBe('p250');
  });

  it('carries an enemy AWP and gives it to the team AWPer next round', () => {
    const carrier = goldenPlayer({ id: 'rifler', selectedRole: 'rifler', primary: 'ak47', x: 300, y: 300 });
    const awper = goldenPlayer({ id: 'awper', selectedRole: 'awper', primary: 'p250', x: 310, y: 300 });
    const items = [{ id: 'enemy-awp', kind: 'weapon', weapon: 'awp', x: 300, y: 300, sourcePlayerId: 'ct', reservedForRole: 'awper' }] as const;
    collectGoldenGroundItems(carrier, [carrier, awper], [...items]);
    deliverSavedWeapons([carrier, awper]);
    expect(awper.inventory.primary).toBe('awp');
    expect(carrier.inventory.primary).toBe('ak47');
  });

  it('makes the IGL buy a needed rifle before upgrading their own weapon', () => {
    const entry = goldenPlayer({ id: 'entry', selectedRole: 'entry', money: 300, primary: 'p250' });
    const igl = goldenPlayer({ id: 'igl', selectedRole: 'igl', money: 3_600, primary: 'p250' });
    const summary = prepareGoldenRoundEconomy([entry, igl], { side: 'T', plan: 'full', pistolRound: false }, () => 0.5);
    expect(summary.deliveries).toContainEqual(expect.objectContaining({ fromPlayerId: 'igl', toPlayerId: 'entry', weapon: 'ak47' }));
    expect(entry.inventory.primary).toBe('ak47');
    expect(igl.inventory.primary).toBe('p250');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha de módulo ausente**

Run: `npm test -- --run tests/goldenMirageEconomy.test.ts`

Expected: FAIL com importação ausente de `golden/economy`.

- [ ] **Step 3: Portar o catálogo econômico do HTML e adicionar as regras coletivas**

Portar preços, classes, dano, RPM, precisão, alcance, recompensa e velocidade de `tests/simulator.html:759-786`. Usar `m4a1` e `ak47` como chaves compatíveis com o domínio existente.

```ts
export const GOLDEN_PICKUP_RADIUS = 20;
export const GOLDEN_WEAPON_VALUE: Record<GoldenWeapon, number> = {
  knife: 0, glock: 1, usp: 1, p2000: 1, duals: 2, p250: 2, deagle: 4,
  mp9: 5, mac10: 5, ump: 5, nova: 5, galil: 6, famas: 6,
  ak47: 8, m4a1: 8, awp: 10
};

export function shouldPickupWeapon(player: GoldenPlayerState, weapon: GoldenWeapon, team: GoldenPlayerState[]) {
  if (weapon === 'awp') {
    if (player.selectedRole === 'awper') return true;
    return team.some((mate) => mate.selectedRole === 'awper' && mate.inventory.primary !== 'awp');
  }
  return GOLDEN_WEAPON_VALUE[weapon] > GOLDEN_WEAPON_VALUE[player.inventory.primary];
}
```

Declarar também os retornos usados pelos testes:

```ts
export interface GoldenPickup {
  playerId: string;
  itemId: string;
  kind: 'weapon' | 'grenade';
}
export interface GoldenDelivery {
  fromPlayerId: string;
  toPlayerId: string;
  weapon: GoldenWeapon;
}
export interface GoldenBuySummary {
  plan: 'pistol' | 'eco' | 'force' | 'full';
  deliveries: GoldenDelivery[];
  equipmentValue: number;
}
export interface GoldenEconomyState {
  players: GoldenPlayerState[];
  lossBonus: Record<'T' | 'CT', number>;
  previousPlan: Record<'T' | 'CT', 'pistol' | 'eco' | 'force' | 'full'>;
  savedItems: GoldenGroundItem[];
}
```

Criar `tests/helpers/goldenMirage.ts` com `goldenPlayer`, preenchendo defaults determinísticos e aplicando apenas os overrides passados:

```ts
import type { GoldenGrenade, GoldenPlayerState, GoldenWeapon } from '../../src/lib/game/replay/golden/types';

type GoldenPlayerOverrides = Partial<Omit<GoldenPlayerState, 'inventory'>> & {
  primary?: GoldenWeapon;
  grenades?: Partial<Record<GoldenGrenade, number>>;
};

export function goldenPlayer(overrides: GoldenPlayerOverrides = {}): GoldenPlayerState {
  return {
    id: overrides.id ?? 'player',
    organizationId: overrides.organizationId ?? 'alpha',
    side: overrides.side ?? 'T',
    selectedRole: overrides.selectedRole ?? 'rifler',
    style: overrides.style ?? 'balanced',
    money: overrides.money ?? 800,
    inventory: {
      primary: overrides.primary ?? 'glock',
      secondary: overrides.side === 'CT' ? 'usp' : 'glock',
      armor: 0,
      helmet: false,
      kit: false,
      grenades: {
        he: overrides.grenades?.he ?? 0,
        flash: overrides.grenades?.flash ?? 0,
        smoke: overrides.grenades?.smoke ?? 0,
        molotov: overrides.grenades?.molotov ?? 0
      }
    },
    x: overrides.x ?? 677,
    y: overrides.y ?? 960,
    angle: overrides.angle ?? 0,
    hp: overrides.hp ?? 100,
    alive: overrides.alive ?? true
  };
}
```

Ao morrer, o jogador solta a arma primária e uma entrada por granada restante. A coleta exige distância menor ou igual a `20`. O inventário mantém no máximo uma primária, duas flashes e uma unidade das demais granadas.

- [ ] **Step 4: Implementar persistência e prioridade do IGL**

Antes da compra, `deliverSavedWeapons` entrega AWP reservada ao AWPer. Depois, o IGL compra nesta ordem: AWP faltante para o AWPer quando possível; rifle para entry sem primária; colete para entry; utilitária de support; equipamento próprio. O IGL nunca transfere dinheiro abstratamente: compra uma arma e gera um evento físico de entrega na freeze time.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test -- --run tests/goldenMirageEconomy.test.ts`

Expected: 4 tests PASS.

```bash
git add src/lib/game/replay/golden/economy.ts tests/helpers/goldenMirage.ts tests/goldenMirageEconomy.test.ts
git commit -m "feat: adiciona economia e coleta de equipamentos"
```

---

### Task 5: Portar o motor de round e travar o resultado oficial

**Files:**
- Create: `src/lib/game/replay/golden/simulate.ts`
- Modify: `tests/helpers/goldenMirage.ts`
- Create: `tests/goldenMirageSimulation.test.ts`

**Interfaces:**
- Produces: `simulateGoldenMirage(plan: ReplayPlanV1): GoldenMatchReplayV1`
- Produces: `simulateGoldenMirageRound(context): GoldenRoundReplayV1`
- Consumes: navegação, tática e economia das Tasks 2–4.

- [ ] **Step 1: Escrever testes de determinismo, colisão, função e resultado autoritativo**

```ts
import { describe, expect, it } from 'vitest';
import { simulateGoldenMirage } from '../src/lib/game/replay/golden/simulate';
import { createGoldenReplayPlanFixture } from './helpers/goldenMirage';

describe('Mirage golden simulation', () => {
  it('is deterministic for the same replay plan', () => {
    const plan = createGoldenReplayPlanFixture();
    const first = simulateGoldenMirage(plan);
    const second = simulateGoldenMirage(plan);
    expect([...first.rounds[0].snapshots]).toEqual([...second.rounds[0].snapshots]);
    expect(first.rounds[0].events).toEqual(second.rounds[0].events);
  });

  it('finishes every round with the official winner', () => {
    const plan = createGoldenReplayPlanFixture({ winners: ['alpha', 'beta', 'alpha', 'alpha'] });
    const replay = simulateGoldenMirage(plan);
    expect(replay.rounds.map((round) => round.winnerOrganizationId)).toEqual(['alpha', 'beta', 'alpha', 'alpha']);
  });

  it('keeps every live snapshot on a free grid cell', () => {
    const replay = simulateGoldenMirage(createGoldenReplayPlanFixture());
    expect(replay.validation.blockedPlayerSnapshots).toBe(0);
  });

  it('keeps entry ahead and lurker on a separate late route', () => {
    const round = simulateGoldenMirage(createGoldenReplayPlanFixture()).rounds[0];
    expect(round.roleMetrics.entryFirstChokeCrossing).toBe(true);
    expect(round.roleMetrics.lurkerSeparateUntilMs).toBeGreaterThan(8_000);
    expect(round.roleMetrics.awperAwpShare).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por motor ausente**

Run: `npm test -- --run tests/goldenMirageSimulation.test.ts`

Expected: FAIL com importação ausente de `golden/simulate`.

- [ ] **Step 3: Portar o loop físico do HTML em unidades tipadas**

Portar, preservando fórmulas e constantes, os corpos relevantes de:

- `tests/simulator.html:931-1215`: criação do round, spawns, bomba, planos, setup CT, utilitárias e snapshots.
- `tests/simulator.html:1220-1457`: passo, percepção e combate.
- `tests/simulator.html:1479-1757`: movimento, IA T, entry/trade e IA CT.
- `tests/simulator.html:1760-1959`: tiro, dano, granadas, bomba, encerramento e economia.
- `tests/simulator.html:2012-2079`: empacotamento do round.

O estado deve ser criado por uma factory, sem globais mutáveis. `REC_EVERY = 2`, `TICK = 1 / 32`, `FREEZE = 5`, `ROUNDTIME = 115`, `BOMBTIME = 40`, `PLANT_TIME = 3.2`, `DEFUSE_TIME = 10` e `KIT_DEFUSE_TIME = 4` permanecem literais.

Antes de implementar o motor, ampliar `tests/helpers/goldenMirage.ts` com `createGoldenReplayPlanFixture` e `goldenRoundReplay`. A fixture deve criar duas organizações balanceadas, cinco funções por lado, mapa Mirage e os vencedores recebidos em `options.winners`; `goldenRoundReplay` deve criar dois frames compactos em que o primeiro jogador vai de `(100, 200, 100 HP)` para `(200, 300, 50 HP)`.

```ts
export function simulateGoldenMirage(plan: ReplayPlanV1): GoldenMatchReplayV1 {
  if (plan.mapId !== 'mirage') throw new Error(`Golden simulator only supports Mirage, received ${plan.mapId}`);
  const economy = createGoldenEconomyState(plan.players);
  const rounds = plan.rounds.map((roundPlan) => simulateGoldenMirageRound({ plan, roundPlan, economy }));
  return {
    version: 1,
    planId: plan.id,
    mapId: 'mirage',
    rounds,
    validation: validateGoldenReplay(rounds)
  };
}
```

O estado interno usado pelo diretor tem contrato explícito:

```ts
interface GoldenSimulationState {
  players: GoldenPlayerState[];
  officialWinnerOrganizationId: string;
  liveTimeSeconds: number;
  ended: boolean;
  bomb: { state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded'; x: number; y: number };
  events: GoldenReplayEvent[];
}
```

- [ ] **Step 4: Integrar estilos, funções, itens no chão e diretor de resultado**

O seletor tático define timings e protocolos. A IA chama `collectGoldenGroundItems` somente depois de `tryMove`. `damage` chama `dropGoldenInventory` na posição da morte. O fim do round usa a organização oficial como trava.

```ts
function officialOutcomeMultiplier(state: GoldenSimulationState, player: GoldenPlayerState) {
  const liveSeconds = Math.max(0, state.liveTimeSeconds);
  if (liveSeconds < 35) return 1;
  const progress = Math.min(1, (liveSeconds - 35) / 70);
  const favored = player.organizationId === state.officialWinnerOrganizationId;
  return favored ? 1 + progress * 0.18 : 1 - progress * 0.12;
}

function finishAtOfficialBoundary(state: GoldenSimulationState) {
  if (state.ended || state.liveTimeSeconds < 115) return;
  const winner = state.officialWinnerOrganizationId;
  const winnerSide = state.players.find((player) => player.organizationId === winner)?.side;
  if (winnerSide === 'CT' && state.bomb.state !== 'planted') endGoldenRound(state, winner, 'time');
  else if (winnerSide === 'T' && state.bomb.state === 'planted') explodeGoldenBomb(state, winner);
  else resolveGoldenFinalContact(state, winner);
}
```

`resolveGoldenFinalContact` usa o vencedor vivo mais próximo e o perdedor vivo mais próximo, registra tiro e dano nas posições atuais e nunca move jogadores. Esse fallback só ocorre no limite temporal e sempre produz `round-end` com o vencedor oficial.

- [ ] **Step 5: Rodar testes de domínio e regressão**

Run: `npm test -- --run tests/goldenMirageAssets.test.ts tests/goldenMirageNavigation.test.ts tests/goldenMirageTactics.test.ts tests/goldenMirageEconomy.test.ts tests/goldenMirageSimulation.test.ts`

Expected: todos os testes PASS e nenhuma seed termina com vencedor divergente.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/replay/golden/simulate.ts tests/helpers/goldenMirage.ts tests/goldenMirageSimulation.test.ts
git commit -m "feat: porta simulação ouro de Mirage"
```

---

### Task 6: Portar o renderer Canvas do HTML ouro

**Files:**
- Create: `src/lib/game/replay/golden/snapshot.ts`
- Create: `src/lib/game/replay/golden/render.ts`
- Create: `tests/goldenMirageRenderer.test.ts`

**Interfaces:**
- Produces: `readGoldenPlayerSnapshot(round, frame, playerIndex): GoldenPlayerSnapshot`
- Produces: `drawGoldenMirageMap(context, image, size, dpr): void`
- Produces: `drawGoldenMirageFrame(context, round, frame, options): void`

- [ ] **Step 1: Escrever testes do layout compacto e das constantes visuais**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_RENDER_PALETTE } from '../src/lib/game/replay/golden/render';
import { readGoldenPlayerSnapshot } from '../src/lib/game/replay/golden/snapshot';
import { goldenRoundReplay } from './helpers/goldenMirage';

describe('Mirage golden renderer', () => {
  it('reads seven floats per player and interpolates angle through the shortest arc', () => {
    const round = goldenRoundReplay();
    const player = readGoldenPlayerSnapshot(round, 0.5, 0);
    expect(player).toMatchObject({ x: 150, y: 250, hp: 75, alive: true });
  });

  it('uses the exact gold palette and real radar asset', () => {
    expect(GOLDEN_RENDER_PALETTE).toMatchObject({ background: '#05070b', ct: '#5aa9e6', t: '#e8b44f', smoke: '#aab4bd', fire: '#ff7a2f' });
    const source = readFileSync(new URL('../src/lib/game/replay/golden/render.ts', import.meta.url), 'utf8');
    expect(source).toContain("'/replay/maps/mirage.webp'");
    expect(source).toContain("brightness(1.42) contrast(1.06) saturate(0.92)");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha de módulos ausentes**

Run: `npm test -- --run tests/goldenMirageRenderer.test.ts`

Expected: FAIL com importação ausente de `golden/render`.

- [ ] **Step 3: Portar desenho e interpolação sem código de calibração**

Portar os corpos de `pSnap`, `shotRange` e `bombState` de `tests/simulator.html:2100-2122,2437-2452`. Portar a paleta, cache do radar, resize e desenho de `tests/simulator.html:2149-2197,2242-2435`.

Remover integralmente `calibration`, `drawCalibrationMarker`, eventos de clique no mapa e qualquer acesso a `localStorage`. Preservar filtros, cores, raios, cones de visão, vida, cegueira, tiro, C4, fumaça, fogo, trajetória de granada, flashes, HE, explosão e marcas de morte.

```ts
export const GOLDEN_RENDER_PALETTE = {
  background: '#05070b', floor: '#1b2634', floorHighlight: '#212e3d', edge: '#3f5468',
  ct: '#5aa9e6', t: '#e8b44f', ctDark: '#1d4a70', tDark: '#7a5c1e',
  smoke: '#aab4bd', fire: '#ff7a2f', flash: '#ffffff', bomb: '#ff8a3d',
  success: '#3ddc84', danger: '#e5484d'
} as const;
export const GOLDEN_MIRAGE_RADAR_URL = '/replay/maps/mirage.webp';
```

- [ ] **Step 4: Rodar testes e commit**

Run: `npm test -- --run tests/goldenMirageRenderer.test.ts tests/goldenMirageSimulation.test.ts`

Expected: todos os testes PASS.

```bash
git add src/lib/game/replay/golden/snapshot.ts src/lib/game/replay/golden/render.ts tests/goldenMirageRenderer.test.ts
git commit -m "feat: replica renderer ouro de Mirage"
```

---

### Task 7: Integrar o HUD ouro somente em Mirage

**Files:**
- Create: `src/lib/components/SchematicReplayViewer.svelte`
- Create: `src/lib/components/GoldenMirageReplayViewer.svelte`
- Modify: `src/lib/components/ReplayViewer.svelte`
- Modify: `src/lib/game/i18n.ts`
- Modify: `tests/replayViewerIntegration.test.ts`
- Create: `tests/goldenMirageIntegration.test.ts`

**Interfaces:**
- `GoldenMirageReplayViewer` consumes: `series`, `mapIndex`, `visibleRounds`, `language`, `theme`
- `SchematicReplayViewer` preserves the same props.
- `ReplayViewer` routes by `series.maps[mapIndex].mapId === 'mirage'`.

- [ ] **Step 1: Escrever testes de roteamento, HUD e ausência do editor**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapper = readFileSync(new URL('../src/lib/components/ReplayViewer.svelte', import.meta.url), 'utf8');
const golden = readFileSync(new URL('../src/lib/components/GoldenMirageReplayViewer.svelte', import.meta.url), 'utf8');

describe('Mirage golden viewer integration', () => {
  it('routes Mirage to gold and keeps every other map schematic', () => {
    expect(wrapper).toContain("mapId === 'mirage'");
    expect(wrapper).toContain('<GoldenMirageReplayViewer');
    expect(wrapper).toContain('<SchematicReplayViewer');
  });

  it('replicates the gold HUD without calibration or editing controls', () => {
    for (const className of ['golden-topbar', 'golden-player-list', 'golden-map-canvas', 'golden-kill-feed', 'golden-timeline', 'golden-controls']) {
      expect(golden).toContain(`class=\"${className}`);
    }
    expect(golden).not.toMatch(/calibr|marcar pixel|localStorage|btnApplyCal|btnResetCal/i);
  });

  it('does not send network commands from either offline viewer', () => {
    expect(wrapper + golden).not.toMatch(/WebSocket|fetch\s*\(|send\s*\(/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por componentes ausentes**

Run: `npm test -- --run tests/goldenMirageIntegration.test.ts tests/replayViewerIntegration.test.ts`

Expected: FAIL porque o wrapper e o componente ouro ainda não existem.

- [ ] **Step 3: Mover o viewer atual sem alteração funcional e criar o wrapper**

```svelte
<script lang="ts">
  import GoldenMirageReplayViewer from './GoldenMirageReplayViewer.svelte';
  import SchematicReplayViewer from './SchematicReplayViewer.svelte';
  import type { Language, SeriesResult, Theme } from '$lib/game/types';

  export let series: SeriesResult;
  export let mapIndex: number;
  export let visibleRounds: number;
  export let language: Language = 'en';
  export let theme: Theme = 'dark';

  $: mapId = series.maps[mapIndex]?.mapId;
</script>

{#if mapId === 'mirage'}
  <GoldenMirageReplayViewer {series} {mapIndex} {visibleRounds} {language} {theme} />
{:else}
  <SchematicReplayViewer {series} {mapIndex} {visibleRounds} {language} {theme} />
{/if}
```

- [ ] **Step 4: Construir o componente ouro com markup e CSS do HTML**

Copiar a estrutura de `tests/simulator.html:1-416`, removendo o modal, o calibrador, botão “SIMULAR TUDO”, seed editável e listeners de edição. Manter topbar, três colunas, cards, mapa quadrado, kill feed, banner de fim, timeline, play/pause, round anterior/próximo e scrub.

O componente cria `plan = createReplayPlan(series, mapIndex)`, `goldenReplay = simulateGoldenMirage(plan)` e limita a timeline a `visibleRounds`. Nomes vêm de `playerById`; equipes vêm de `series.teamA/teamB`. O Canvas chama `drawGoldenMirageFrame` em `requestAnimationFrame` e usa `ResizeObserver` com DPR máximo 2.

- [ ] **Step 5: Localizar os novos rótulos e preservar responsividade**

Adicionar chaves PT-BR, EN e ES para freeze time, bomba plantada, equipamento, full/force/eco/pistol, lado T/CT e mensagens de fim. Em desktop, preservar `236px / mapa flexível / 236px`; abaixo de `900px`, manter o mapa quadrado no topo e colocar as duas listas em uma faixa horizontal rolável, sem reduzir o radar a menos de `320px`.

- [ ] **Step 6: Rodar check, testes e commit**

Run: `npm run check`

Expected: 0 errors e 0 warnings.

Run: `npm test -- --run tests/goldenMirageIntegration.test.ts tests/replayViewerIntegration.test.ts`

Expected: todos os testes PASS.

```bash
git add src/lib/components/ReplayViewer.svelte src/lib/components/SchematicReplayViewer.svelte src/lib/components/GoldenMirageReplayViewer.svelte src/lib/game/i18n.ts tests/replayViewerIntegration.test.ts tests/goldenMirageIntegration.test.ts
git commit -m "feat: integra simulador ouro de Mirage"
```

---

### Task 8: Aplicar velocidades locais de 4x, 8x e Ultra

**Files:**
- Modify: `src/lib/game/replay/canvas/clock.ts`
- Modify: `src/lib/game/replay/live.ts`
- Modify: `src/lib/components/SchematicReplayViewer.svelte`
- Modify: `src/lib/components/GoldenMirageReplayViewer.svelte`
- Modify: `tests/replayCanvas.test.ts`
- Modify: `tests/replayLive.test.ts`

**Interfaces:**
- `ReplayClock.setSpeed('normal')` advances at `4x`.
- `ReplayClock.setSpeed('fast')` advances at `8x`.
- `ReplayClock.setSpeed('ultra')` jumps to the current round boundary.
- `ReplayLiveQueue` still changes rounds only after rendered `round-end`.

- [ ] **Step 1: Substituir testes de janelas comprimidas por multiplicadores literais**

```ts
it('plays normal at 4x, fast at 8x and ultra instantly', () => {
  const clock = new ReplayClock(40_000);
  clock.play();
  clock.advance(1_000);
  expect(clock.currentMs).toBe(4_000);
  clock.setSpeed('fast');
  clock.advance(1_000);
  expect(clock.currentMs).toBe(12_000);
  clock.setSpeed('ultra');
  expect(clock.currentMs).toBe(40_000);
  expect(clock.playing).toBe(false);
});
```

Remover de `tests/replayLive.test.ts` as expectativas de `8_000/3_000` e manter os testes de fila, fronteira e salto entre rounds.

- [ ] **Step 2: Rodar os testes e confirmar falha nos multiplicadores antigos**

Run: `npm test -- --run tests/replayCanvas.test.ts tests/replayLive.test.ts`

Expected: FAIL porque Normal ainda é 1x e Rápido ainda é 2,5x/janela adaptativa.

- [ ] **Step 3: Simplificar o relógio para velocidade exata**

```ts
const SPEED_MULTIPLIER: Record<Exclude<ReplayPlaybackSpeed, 'ultra'>, number> = {
  normal: 4,
  fast: 8
};

advance(deltaMs: number) {
  if (!this.playing || this.speed === 'ultra') return this.currentMs;
  this.currentMs = Math.min(this.durationMs, this.currentMs + Math.max(0, deltaMs) * SPEED_MULTIPLIER[this.speed]);
  if (this.currentMs >= this.durationMs) this.playing = false;
  return this.currentMs;
}
```

Remover `setRoundPlaybackWindow`, `ROUND_PLAYBACK_WINDOW_MS`, `getReplayPlaybackWindowMs` e chamadas correspondentes. Não alterar `ReplayLiveQueue.markRoundEndRendered` ou `advanceBetweenRounds`.

- [ ] **Step 4: Atualizar os dois viewers**

Exibir botões `NORMAL · 4×`, `RÁPIDO · 8×` e `ULTRA · INSTANTÂNEO`. Ultra deve saltar ao fim do round ativo, desenhar `round-end` e somente depois liberar o próximo round da fila.

- [ ] **Step 5: Rodar testes e commit**

Run: `npm test -- --run tests/replayCanvas.test.ts tests/replayLive.test.ts tests/goldenMirageIntegration.test.ts`

Expected: todos os testes PASS.

```bash
git add src/lib/game/replay/canvas/clock.ts src/lib/game/replay/live.ts src/lib/components/SchematicReplayViewer.svelte src/lib/components/GoldenMirageReplayViewer.svelte tests/replayCanvas.test.ts tests/replayLive.test.ts
git commit -m "feat: ajusta replay para 4x 8x e instantâneo"
```

---

### Task 9: Validar a história completa offline

**Files:**
- Modify if needed: only files already listed in Tasks 1–8.
- Verify: `tests/simulator.html` remains untracked and unchanged.

**Interfaces:**
- Produces: evidência de domínio, build e navegador para Mirage desktop/mobile.

- [ ] **Step 1: Rodar a suíte focal**

Run: `npm test -- --run tests/goldenMirageAssets.test.ts tests/goldenMirageNavigation.test.ts tests/goldenMirageTactics.test.ts tests/goldenMirageEconomy.test.ts tests/goldenMirageSimulation.test.ts tests/goldenMirageRenderer.test.ts tests/goldenMirageIntegration.test.ts`

Expected: todos os testes PASS.

- [ ] **Step 2: Rodar o gate completo**

Run: `npm run check`

Expected: 0 errors e 0 warnings.

Run: `npm test`

Expected: toda a suíte PASS.

Run: `npm run build`

Expected: build estático concluído.

Run: `npm run server:build`

Expected: build do servidor concluído, sem alteração de protocolo.

- [ ] **Step 3: Fazer verificação visual desktop no fluxo real**

Run: `npm run dev -- --host 127.0.0.1`

Abrir a run offline, iniciar uma série em Mirage e confirmar:

- radar WebP real idêntico ao HTML ouro;
- HUD com times, lados, dinheiro, armas, granadas e funções;
- entry cruza o choke primeiro e lurker joga separado;
- AWPer aparece com AWP quando a economia permite;
- smokes, flashes, fogo, tiros, C4, mortes e kill feed ficam sobre o radar;
- Normal 4x, Rápido 8x e Ultra instantâneo;
- placar visual termina com o mesmo vencedor do round oficial;
- nenhum controle de calibrar, marcar pixel ou editar utilitária aparece;
- console sem erros.

- [ ] **Step 4: Fazer verificação mobile**

Repetir em viewport de telefone e confirmar mapa com pelo menos `320px`, listas acessíveis por rolagem e controles utilizáveis sem overflow da página.

- [ ] **Step 5: Auditar o escopo e o worktree**

Run: `git status --short && git diff --name-only 7665bbd..HEAD`

Expected:

- `tests/simulator.html` continua `??` e não aparece em nenhum commit;
- nenhum arquivo sob `server/` ou `src/lib/game/online/` foi alterado;
- nenhum deploy ou push foi executado;
- os seis mapas não-Mirage continuam roteados para `SchematicReplayViewer`.

# Dinastia D: Rating 3.0 aproximado, Round Swing e stats reais — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o rating HLTV 1.0 do modo offline e do Sandbox por um Rating 3.0 aproximado com Round Swing, e mostrar assistências, KAST, ADR com dano real, dano de utilitário, duelos de abertura, trocas e multi-kills, sem mudar nenhuma partida e sem mudar o online.

**Architecture:** Um módulo puro novo (`src/lib/game/rating.ts`) analisa cada round do kill feed já gerado pelo motor: probabilidade de vitória por vivos (Round Swing), dano por kill e assistência, utilitário, KAST e trocas, com gerador de números próprio semeado por série, mapa e round. `majorAwards.ts` e `runStats.ts` ganham um parâmetro de modelo (`'v3'` por padrão, `'hltv1'` para o legado). O servidor online passa `'hltv1'` explicitamente e continua idêntico. Os componentes de stats mostram os campos novos só quando existem.

**Tech Stack:** SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-09-14-dinastia-design.md`, seção "Rating 3.0, Round Swing e stats".

## Global Constraints

- Idioma: docs, textos de UI e mensagens de commit em pt-BR; identificadores em inglês. Commits `feat: assunto em pt-BR` (ou `test:`/`docs:`), sem escopo e sem gitmoji, terminados com:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
- Nunca fazer push.
- **A partida não muda.** Nada em `rounds.ts`, `live-series.ts` ou no motor de torneio é alterado, e nenhum código novo chama o RNG do motor (`createSeededRng` de `simulation.ts` também não é usado pelo módulo novo, para não criar ciclo de import). `tests/normalRunGolden.test.ts` passa sem reescrever o snapshot; nunca rodar vitest com `-u`; `git status --short tests/__snapshots__` sempre vazio.
- **O online não muda.** O protocolo 9 fica igual: `server/room-manager.ts` passa `{ model: 'hltv1' }` nas duas chamadas (`computeMajorAwards` e `createRunStats`), e o modelo `'hltv1'` produz objetos com exatamente as mesmas chaves e valores de hoje. Kill feed de séries alheias não é enviado; Rating 3.0 no servidor fica para depois.
- `PlayerRunStats.runRating` passa a ser o Rating 3.0 no offline e no Sandbox. A entrega C só lê esse campo.
- A HLTV não publica os pesos do Rating 3.0. Todo texto de ajuda diz que é uma aproximação.
- Textos novos em pt-BR, es e en.
- Na página `src/routes/+page.svelte` nada é editado: os componentes `RunStatsGrid` e `MajorAwardsPanel` levam os campos novos para o resultado, a tela de stats e o Sandbox. (A entrega C, planejada em paralelo, mexe na página.)
- Gate: `npm run validate`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/game/rating.ts` (novo) | Probabilidade por vivos e lado, gerador de stats, análise de um round (swing, dano, utilitário, KAST, abertura, troca), fórmulas do Rating 3.0 e base do campo. |
| `src/lib/game/types.ts` | `RatingModel`; campos opcionais do 3.0 em `MajorPlayerAward`, `MajorAwards` e `PlayerRunStats`. |
| `src/lib/game/majorAwards.ts` | Acumular os campos do 3.0 por jogador, escolher o modelo, base do campo, MVP com swing, `fieldRatingBaseline`. |
| `src/lib/game/runStats.ts` | `createRunStats` com modelo; ADR e impacto reais e campos novos no caminho do kill feed. |
| `server/room-manager.ts` | Pedir `'hltv1'` explicitamente nas duas chamadas. |
| `src/lib/components/RunStatsGrid.svelte`, `src/lib/components/MajorAwardsPanel.svelte`, `src/lib/game/i18n.ts` | Mostrar Rating 3.0, Swing, K/D/A, KAST, ADR, dano de utilitário, aberturas, trocas e multi-kills; texto de ajuda. |
| `tests/rating3.test.ts` (novo) | Módulo puro. |
| `tests/majorAwards.test.ts`, `tests/runStats.test.ts` | Ajustes listados nas tarefas e casos novos. |

## Testes existentes que mudam (e por quê)

| Teste | Mudança | Motivo |
|---|---|---|
| `tests/runStats.test.ts` › "takes kills, deaths, K/D and rating straight from the user series", linhas com `stat.adr` entre 40 e 115 e `stat.impact` entre 0.5 e 1.6 | As faixas saem desse teste e vão para um teste novo do modelo `'hltv1'` (mesmas faixas, cobertura preservada). No 3.0 o teste checa que `runRating` é o rating 3.0 da linha do kill feed e que ADR, impacto, KAST e swing estão em faixas coerentes. | ADR agora vem do dano real (kills, assistências e utilitário) e o impacto usa a fórmula do 3.0 (`2.13·KPR + 0.42·APR − 0.41`), então as faixas sintéticas antigas não valem. |
| `tests/majorAwards.test.ts` › "favours the champion when raw ratings are close" | O corpo atual passa a rodar com `{ model: 'hltv1' }` (cobertura preservada), e um teste novo cobre o MVP do 3.0 somando `swing / 100`. | O MVP do 3.0 soma rating, bônus de colocação e swing; a condição "diferença de rating menor que o bônus garante o campeão" deixa de ser verdadeira com o termo de swing. |
| Nenhum outro | `tests/simulation.test.ts` (modelo sintético sem kill feed) e `tests/onlineSeason.test.ts` (servidor em `'hltv1'`) não mudam. | O caminho sintético e o servidor continuam iguais. |

---

### Task 1: Módulo puro `rating.ts`

**Files:**
- Create: `src/lib/game/rating.ts`
- Test: `tests/rating3.test.ts`

**Interfaces:**
- Consumes: `MAP_SIDE_BIAS` de `src/lib/game/maps.ts` (o arquivo só importa tipos, não há ciclo); tipos `MapId`, `MapSide`, `RoundDetail`, `TeamSide`.
- Produces:
  - `TRADE_WINDOW_SECONDS = 5`, `ROSTER_SIZE = 5`
  - `aliveWinProbability(own: number, enemy: number): number`
  - `sideAdjustedProbability(probability: number, side: MapSide, mapId?: MapId): number`
  - `statRng(seed: string): () => number`
  - `contributionKey(side: TeamSide, playerId: string): string` → `"a:player-id"`
  - `interface RoundContribution { side; kills; deaths; assists; flashAssists; kast: boolean; damage; utilityDamage; swing; openingKill: boolean; openingDeath: boolean; tradeKills; tradedDeath: boolean }`
  - `analyzeRound(detail: RoundDetail, options: { roster: { a: readonly string[]; b: readonly string[] }; mapId?: MapId; seed: string; utilityWeight?: (side: TeamSide, playerId: string) => number }): Map<string, RoundContribution>`
  - `interface RatingLine { rounds; kills; deaths; assists; kastRounds; damage; utilityDamage; swing }`
  - `kastPercent(line)`, `adrOf(line)`, `swingPerRound(line)`, `impactOf(line)`, `rawRating3(line)`, `ratingBaseline(lines: RatingLine[])`, `rating3(raw: number, baseline: number)`

- [ ] **Step 1: Teste que falha**

```ts
// tests/rating3.test.ts
import { describe, expect, it } from 'vitest';
import {
  aliveWinProbability,
  analyzeRound,
  contributionKey,
  impactOf,
  rating3,
  ratingBaseline,
  rawRating3,
  sideAdjustedProbability,
  statRng,
  type RatingLine
} from '../src/lib/game/rating';
import type { RoundDetail } from '../src/lib/game/types';

const roster = { a: ['a1', 'a2', 'a3', 'a4', 'a5'], b: ['b1', 'b2', 'b3', 'b4', 'b5'] };
const detail: RoundDetail = {
  number: 3,
  winner: 'a',
  sideA: 'ct',
  overtime: false,
  economy: { a: { buy: 'full', awp: false, money: 5000 }, b: { buy: 'full', awp: false, money: 5000 } },
  kills: [
    { killerId: 'a1', killerName: 'A1', killerSide: 'a', victimId: 'b1', victimName: 'B1', weapon: 'm4a1', headshot: true, second: 20, assistId: 'a2', assistName: 'A2', flashAssistId: 'a3', flashAssistName: 'A3' },
    { killerId: 'b2', killerName: 'B2', killerSide: 'b', victimId: 'a1', victimName: 'A1', weapon: 'ak47', headshot: false, second: 23 },
    { killerId: 'a3', killerName: 'A3', killerSide: 'a', victimId: 'b2', victimName: 'B2', weapon: 'm4a1', headshot: false, second: 40 }
  ],
  ending: 'elimination',
  tags: []
};
const at = (lines: ReturnType<typeof analyzeRound>, side: 'a' | 'b', id: string) => lines.get(contributionKey(side, id))!;

describe('probabilidade de vencer o round', () => {
  it('segue a tabela por vivos e é simétrica', () => {
    expect(aliveWinProbability(5, 5)).toBe(0.5);
    expect(aliveWinProbability(5, 4)).toBe(0.71);
    expect(aliveWinProbability(4, 5)).toBeCloseTo(0.29, 10);
    expect(aliveWinProbability(2, 1)).toBe(0.78);
    expect(aliveWinProbability(1, 3)).toBeCloseTo(0.08, 10);
    expect(aliveWinProbability(3, 0)).toBe(1);
    expect(aliveWinProbability(0, 2)).toBe(0);
  });

  it('ajusta pelo lado do mapa sem sair de 1% a 99%', () => {
    expect(sideAdjustedProbability(0.5, 'ct', 'nuke')).toBeCloseTo(0.56, 10);
    expect(sideAdjustedProbability(0.5, 't', 'nuke')).toBeCloseTo(0.44, 10);
    expect(sideAdjustedProbability(0.99, 'ct', 'nuke')).toBe(0.99);
    expect(sideAdjustedProbability(1, 't', 'nuke')).toBe(1);
    expect(sideAdjustedProbability(0.5, 'ct')).toBe(0.5);
  });
});

describe('gerador de stats', () => {
  it('é determinístico e fica em [0, 1)', () => {
    const left = statRng('serie:1:3');
    const right = statRng('serie:1:3');
    const values = Array.from({ length: 50 }, () => left());
    expect(values).toEqual(Array.from({ length: 50 }, () => right()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(statRng('outra')()).not.toBe(values[0]);
  });
});

describe('análise de um round', () => {
  const lines = analyzeRound(detail, { roster, seed: 'serie:1:3' });

  it('conta abates, mortes, assistências, abertura e troca', () => {
    expect(at(lines, 'a', 'a1')).toMatchObject({ kills: 1, deaths: 1, openingKill: true, kast: true });
    expect(at(lines, 'a', 'a2')).toMatchObject({ assists: 1, kills: 0, kast: true });
    expect(at(lines, 'a', 'a3')).toMatchObject({ flashAssists: 1, kills: 1, kast: true });
    expect(at(lines, 'b', 'b1')).toMatchObject({ deaths: 1, openingDeath: true, tradedDeath: true, kast: true });
    expect(at(lines, 'b', 'b2')).toMatchObject({ kills: 1, deaths: 1, tradeKills: 1, kast: true });
    expect(at(lines, 'a', 'a1').tradedDeath).toBe(false);
    expect(at(lines, 'a', 'a4').kast).toBe(true);
    expect(at(lines, 'b', 'b5').kast).toBe(true);
  });

  it('divide o dano do abate com a assistência', () => {
    const killer = at(lines, 'a', 'a1').damage;
    const helper = at(lines, 'a', 'a2').damage;
    expect(killer + helper).toBe(100);
    expect(helper).toBeGreaterThanOrEqual(30);
    expect(helper).toBeLessThanOrEqual(70);
    expect(at(lines, 'b', 'b2').damage).toBe(100);
    expect(at(lines, 'a', 'a3').damage).toBe(100);
  });

  it('dá o swing ao autor e à assistência, tira da vítima e soma zero entre os times', () => {
    expect(at(lines, 'a', 'a1').swing).toBeCloseTo(0.21 * 0.7 - 0.21, 10);
    expect(at(lines, 'a', 'a2').swing).toBeCloseTo(0.21 * 0.3, 10);
    expect(at(lines, 'b', 'b1').swing).toBeCloseTo(-0.21, 10);
    expect(at(lines, 'b', 'b2').swing).toBeCloseTo(0.21 - 0.2, 10);
    expect(at(lines, 'a', 'a3').swing).toBeCloseTo(0.2, 10);
    const total = (side: 'a' | 'b') => [...lines.values()].filter((line) => line.side === side).reduce((sum, line) => sum + line.swing, 0);
    expect(total('a') + total('b')).toBeCloseTo(0, 10);
  });

  it('gera de 0 a 2 eventos de utilitário por lado, de 8 a 45 de dano, sempre igual para a mesma seed', () => {
    const utility = (side: 'a' | 'b', source = lines) => [...source.values()].filter((line) => line.side === side).reduce((sum, line) => sum + line.utilityDamage, 0);
    for (const side of ['a', 'b'] as const) {
      expect(utility(side)).toBeGreaterThanOrEqual(0);
      expect(utility(side)).toBeLessThanOrEqual(90);
    }
    const again = analyzeRound(detail, { roster, seed: 'serie:1:3' });
    expect([...again.entries()]).toEqual([...lines.entries()]);
  });

  it('dá o utilitário a quem tem mais peso', () => {
    const sums = { a4: 0, others: 0 };
    for (let index = 0; index < 200; index += 1) {
      const result = analyzeRound(detail, { roster, seed: `peso:${index}`, utilityWeight: (side, id) => (side === 'a' && id === 'a4' ? 50 : 1) });
      for (const [key, line] of result) {
        if (line.side !== 'a') continue;
        if (key === contributionKey('a', 'a4')) sums.a4 += line.utilityDamage;
        else sums.others += line.utilityDamage;
      }
    }
    expect(sums.a4).toBeGreaterThan(sums.others * 5);
  });
});

describe('fórmulas do Rating 3.0', () => {
  const line: RatingLine = { rounds: 20, kills: 14, deaths: 10, assists: 4, kastRounds: 15, damage: 1700, utilityDamage: 0, swing: 0.6 };

  it('calcula impacto e rating bruto com os pesos da spec', () => {
    expect(impactOf(line)).toBeCloseTo(1.165, 10);
    expect(rawRating3(line)).toBeCloseTo(1.170758, 6);
    expect(rawRating3({ ...line, rounds: 0 })).toBe(0);
  });

  it('divide pela média do campo e arredonda em duas casas', () => {
    expect(rating3(1.170758, 0.9)).toBe(1.3);
    expect(rating3(1, 0)).toBe(0);
    const weaker: RatingLine = { ...line, kills: 6, deaths: 16, kastRounds: 9, damage: 1100, swing: -0.4 };
    const baseline = ratingBaseline([line, weaker, { ...line, rounds: 0 }]);
    expect(baseline).toBeCloseTo((rawRating3(line) + rawRating3(weaker)) / 2, 10);
    expect((rating3(rawRating3(line), baseline) + rating3(rawRating3(weaker), baseline)) / 2).toBeCloseTo(1, 1);
  });
});
```

Contas usadas no teste: antes do 1º abate A tem 50% (sem mapa, sem viés); com 5v4, 71%: ganho 0,21, dividido 0,7/0,3 entre `a1` e `a2`, e −0,21 para `b1`. O 2º abate leva de 5v4 (71%) para 4v4 (50%): +0,21 para `b2`, −0,21 para `a1`. O 3º leva de 4v4 (50%) para 4v3 (70%): +0,20 para `a3`, −0,20 para `b2`. `b1` morreu aos 20 s e seu assassino (`a1`) morreu aos 23 s pelas mãos de `b2`: troca. Rating bruto: KAST 75 → 0,5475; KPR 0,7 → 0,25137; DPR 0,5 → −0,26645; impacto 2,13·0,7 + 0,42·0,2 − 0,41 = 1,165 → 0,276338; ADR 85 → 0,272; swing 0,6·100/20 = 3 pp → 0,09; soma 1,170758.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/rating3.test.ts`
Expected: FAIL, `Failed to resolve import "../src/lib/game/rating"`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/game/rating.ts
import { MAP_SIDE_BIAS } from './maps';
import type { MapId, MapSide, RoundDetail, TeamSide } from './types';

/**
 * Rating 3.0 (approximation) and Round Swing, read from the kill feed the engine already produced. Nothing here uses the
 * engine's RNG: damage and utility come from a private generator seeded by series, map and round, so the match is never
 * altered. HLTV does not publish the Rating 3.0 weights; the formula below extends the public 2.0 fit with Round Swing.
 */

export const TRADE_WINDOW_SECONDS = 5;
export const ROSTER_SIZE = 5;

/** Chance of winning the round with `own` players alive against `enemy`, before the map side. */
const ADVANTAGE: Readonly<Record<string, number>> = {
  '5:5': 0.5, '5:4': 0.71, '5:3': 0.87, '5:2': 0.96, '5:1': 0.99,
  '4:4': 0.5, '4:3': 0.7, '4:2': 0.88, '4:1': 0.97,
  '3:3': 0.5, '3:2': 0.72, '3:1': 0.92,
  '2:2': 0.5, '2:1': 0.78,
  '1:1': 0.5
};

const clampAlive = (value: number) => Math.max(0, Math.min(ROSTER_SIZE, Math.round(value)));

export function aliveWinProbability(own: number, enemy: number): number {
  const mine = clampAlive(own);
  const theirs = clampAlive(enemy);
  if (mine === 0) return 0;
  if (theirs === 0) return 1;
  return mine >= theirs ? ADVANTAGE[`${mine}:${theirs}`] : 1 - ADVANTAGE[`${theirs}:${mine}`];
}

/** Adds the map's CT tilt to an open round (a decided round stays at 0 or 1), kept inside 1%–99%. */
export function sideAdjustedProbability(probability: number, side: MapSide, mapId?: MapId): number {
  if (probability <= 0 || probability >= 1) return probability;
  const bias = mapId ? MAP_SIDE_BIAS[mapId] : 0;
  return Math.min(0.99, Math.max(0.01, probability + (side === 'ct' ? bias : -bias)));
}

/** Small deterministic generator (FNV-1a seed, mulberry32 steps) for statistics only. */
export function statRng(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const contributionKey = (side: TeamSide, playerId: string) => `${side}:${playerId}`;

export interface RoundContribution {
  side: TeamSide;
  kills: number;
  deaths: number;
  assists: number;
  flashAssists: number;
  /** Kill, assist, survival or traded death in the round. */
  kast: boolean;
  /** Damage from kills and damage assists. */
  damage: number;
  utilityDamage: number;
  /** Sum of the round-win probability changes credited to the player (fraction: 0.21 = 21 percentage points). */
  swing: number;
  openingKill: boolean;
  openingDeath: boolean;
  tradeKills: number;
  tradedDeath: boolean;
}

export interface RoundAnalysisOptions {
  /** Players of each side on this map (everyone who killed, died or assisted on it). */
  roster: { a: readonly string[]; b: readonly string[] };
  mapId?: MapId;
  /** Unique per series, map and round. */
  seed: string;
  /** Relative chance of being credited with a utility event (defaults to 1). */
  utilityWeight?: (side: TeamSide, playerId: string) => number;
}

const other = (side: TeamSide): TeamSide => (side === 'a' ? 'b' : 'a');

export function analyzeRound(detail: RoundDetail, options: RoundAnalysisOptions): Map<string, RoundContribution> {
  const rng = statRng(options.seed);
  const lines = new Map<string, RoundContribution>();
  const ensure = (side: TeamSide, playerId: string) => {
    const key = contributionKey(side, playerId);
    let line = lines.get(key);
    if (!line) {
      line = { side, kills: 0, deaths: 0, assists: 0, flashAssists: 0, kast: false, damage: 0, utilityDamage: 0, swing: 0, openingKill: false, openingDeath: false, tradeKills: 0, tradedDeath: false };
      lines.set(key, line);
    }
    return line;
  };
  for (const side of ['a', 'b'] as TeamSide[]) for (const playerId of options.roster[side]) ensure(side, playerId);

  const alive: Record<TeamSide, number> = { a: ROSTER_SIZE, b: ROSTER_SIZE };
  const probabilityA = () => sideAdjustedProbability(aliveWinProbability(alive.a, alive.b), detail.sideA, options.mapId);
  const deaths: Array<{ victimSide: TeamSide; victimId: string; killerId: string; second: number; traded: boolean }> = [];

  detail.kills.forEach((kill, index) => {
    const killerSide = kill.killerSide;
    const victimSide = other(killerSide);
    const killer = ensure(killerSide, kill.killerId);
    const victim = ensure(victimSide, kill.victimId);
    const assistant = kill.assistId ? ensure(killerSide, kill.assistId) : null;

    const before = probabilityA();
    alive[victimSide] = Math.max(0, alive[victimSide] - 1);
    const after = probabilityA();
    const gain = killerSide === 'a' ? after - before : before - after;
    killer.swing += assistant ? gain * 0.7 : gain;
    if (assistant) assistant.swing += gain * 0.3;
    victim.swing -= gain;

    killer.kills += 1;
    victim.deaths += 1;
    if (index === 0) {
      killer.openingKill = true;
      victim.openingDeath = true;
    }
    const assistDamage = assistant ? 30 + Math.floor(rng() * 41) : 0;
    killer.damage += 100 - assistDamage;
    if (assistant) {
      assistant.damage += assistDamage;
      assistant.assists += 1;
    }
    if (kill.flashAssistId) ensure(killerSide, kill.flashAssistId).flashAssists += 1;

    // The killer of an earlier teammate dies within the window: that teammate's death was traded.
    const traded = deaths.find((death) => !death.traded && death.killerId === kill.victimId && death.victimSide === killerSide && kill.second - death.second <= TRADE_WINDOW_SECONDS);
    if (traded) {
      traded.traded = true;
      ensure(killerSide, traded.victimId).tradedDeath = true;
      killer.tradeKills += 1;
    }
    deaths.push({ victimSide, victimId: kill.victimId, killerId: kill.killerId, second: kill.second, traded: false });
  });

  for (const side of ['a', 'b'] as TeamSide[]) {
    const players = options.roster[side];
    if (!players.length) continue;
    const events = Math.floor(rng() * 3);
    for (let event = 0; event < events; event += 1) {
      const amount = 8 + Math.floor(rng() * 38);
      const weights = players.map((playerId) => Math.max(0.01, options.utilityWeight?.(side, playerId) ?? 1));
      let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
      let chosen = players[players.length - 1];
      for (let index = 0; index < players.length; index += 1) {
        roll -= weights[index];
        if (roll < 0) {
          chosen = players[index];
          break;
        }
      }
      ensure(side, chosen).utilityDamage += amount;
    }
  }

  for (const line of lines.values()) {
    line.kast = line.kills > 0 || line.assists > 0 || line.flashAssists > 0 || line.deaths === 0 || line.tradedDeath;
  }
  return lines;
}

export interface RatingLine {
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kastRounds: number;
  damage: number;
  utilityDamage: number;
  /** Sum of swing fractions over every round played. */
  swing: number;
}

const perRound = (value: number, rounds: number) => value / Math.max(1, rounds);

export const kastPercent = (line: RatingLine) => perRound(line.kastRounds, line.rounds) * 100;
export const adrOf = (line: RatingLine) => perRound(line.damage + line.utilityDamage, line.rounds);
export const swingPerRound = (line: RatingLine) => perRound(line.swing, line.rounds) * 100;
export const impactOf = (line: RatingLine) => 2.13 * perRound(line.kills, line.rounds) + 0.42 * perRound(line.assists, line.rounds) - 0.41;

/** raw = 0.0073·KAST + 0.3591·KPR − 0.5329·DPR + 0.2372·impact + 0.0032·ADR + 0.03·swing (percentage points per round). */
export function rawRating3(line: RatingLine): number {
  if (line.rounds <= 0) return 0;
  return 0.0073 * kastPercent(line)
    + 0.3591 * perRound(line.kills, line.rounds)
    - 0.5329 * perRound(line.deaths, line.rounds)
    + 0.2372 * impactOf(line)
    + 0.0032 * adrOf(line)
    + 0.03 * swingPerRound(line);
}

/** Mean raw rating of every player with at least one round: the divisor that makes the field average 1.00. */
export function ratingBaseline(lines: RatingLine[]): number {
  const played = lines.filter((line) => line.rounds > 0);
  return played.length ? played.reduce((sum, line) => sum + rawRating3(line), 0) / played.length : 0;
}

export const rating3 = (raw: number, baseline: number) => Number((baseline > 0 ? raw / baseline : 0).toFixed(2));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/rating3.test.ts`
Expected: `Tests  10 passed (10)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/rating.ts tests/rating3.test.ts
git commit -m "feat: módulo de Rating 3.0 aproximado e Round Swing lido do kill feed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Prêmios do Major com Rating 3.0 (servidor segue no 1.0)

**Files:**
- Modify: `src/lib/game/types.ts` (`MajorPlayerAward`, `MajorAwards`; novo `RatingModel`)
- Modify: `src/lib/game/majorAwards.ts`
- Modify: `server/room-manager.ts` (chamada de `computeMajorAwards`)
- Modify: `src/lib/game/runStats.ts` (só as duas chamadas de `aggregatePlayerLines`, fixadas em `'hltv1'` até a Task 3)
- Modify: `tests/majorAwards.test.ts` (teste "favours the champion…" e casos novos)

**Interfaces:**
- Consumes: tudo de `rating.ts` (Task 1).
- Produces:
  - `type RatingModel = 'hltv1' | 'v3'` em `types.ts`
  - `MajorPlayerAward` com opcionais `assists`, `flashAssists`, `kast` (0–100, 1 casa), `adr` (inteiro), `utilityDamage` (por round, 1 casa), `swing` (pp por round, 2 casas), `impact` (2 casas), `openingDeaths`, `tradeKills`, `tradedDeaths` — presentes só no modelo `'v3'`
  - `MajorAwards` com opcionais `ratingModel?: 'v3'` e `ratingBaseline?: number` — presentes só no `'v3'`
  - `computeMajorAwards(rounds, championId, options?: { model?: RatingModel })` (padrão `'v3'`)
  - `aggregatePlayerLines(series, options?: { model?: RatingModel; baseline?: number })` (padrão `'v3'`; sem `baseline`, usa a base das próprias linhas)
  - `fieldRatingBaseline(series: SeriesResult[]): number`

- [ ] **Step 1: Tipos**

Em `src/lib/game/types.ts`, logo antes de `export interface MajorPlayerAward`:

```ts
/** Rating of awards and run statistics: HLTV 1.0 (online server, legacy) or the Rating 3.0 approximation (offline, Sandbox). */
export type RatingModel = 'hltv1' | 'v3';
```

Em `MajorPlayerAward`, depois de `placement: string;`:

```ts
  /** Rating 3.0 model only; absent in HLTV 1.0 awards (the online server). */
  assists?: number;
  flashAssists?: number;
  /** Rounds with a kill, assist, survival or traded death, in percent (one decimal). */
  kast?: number;
  /** Damage per round: kills, damage assists and utility. */
  adr?: number;
  /** Utility damage per round (one decimal). */
  utilityDamage?: number;
  /** Round Swing in percentage points per round (two decimals). */
  swing?: number;
  impact?: number;
  openingDeaths?: number;
  tradeKills?: number;
  tradedDeaths?: number;
```

Em `MajorAwards`, depois de `highlightReel: MajorPlayerAward | null;`:

```ts
  /** Present when `rating` fields use the Rating 3.0 approximation. */
  ratingModel?: 'v3';
  /** Mean raw Rating 3.0 of the field, the divisor that makes the average 1.00 (v3 only). */
  ratingBaseline?: number;
```

- [ ] **Step 2: Testes (novos e ajustados)**

Em `tests/majorAwards.test.ts`:

1. Trocar o import da linha 4 por:

```ts
import { aggregatePlayerLines, computeMajorAwards, fieldRatingBaseline, placementsOf } from '../src/lib/game/majorAwards';
import { readFileSync } from 'node:fs';
```

2. No teste `'favours the champion when raw ratings are close'`, trocar só a linha `const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;` por:

```ts
    // HLTV 1.0 (the online server) keeps the original rule: rating plus placement bonus.
    const awards = computeMajorAwards(tournament.rounds, tournament.championId, { model: 'hltv1' })!;
```

e renomear o teste para `'favours the champion when raw ratings are close (HLTV 1.0)'`. O restante do corpo fica igual.

3. Acrescentar ao fim do arquivo:

```ts
const LEGACY_AWARD_KEYS = ['clutches', 'deaths', 'headshots', 'kdRatio', 'kills', 'mapsPlayed', 'multiKills', 'name', 'openingKills', 'placement', 'playerId', 'rating', 'rounds', 'teamId', 'teamName'];

describe('Major awards with Rating 3.0', () => {
  it('uses Rating 3.0 by default and records the model and the field baseline', () => {
    const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;
    expect(awards.ratingModel).toBe('v3');
    expect(awards.ratingBaseline).toBeGreaterThan(0);
    const mvp = awards.mvp!;
    expect(mvp.kast).toBeGreaterThanOrEqual(0);
    expect(mvp.kast).toBeLessThanOrEqual(100);
    expect(mvp.adr).toBeGreaterThan(0);
    expect(Number.isFinite(mvp.swing)).toBe(true);
    expect(mvp.assists).toBeGreaterThanOrEqual(0);
    expect(awards.ratingBaseline).toBeCloseTo(fieldRatingBaseline(tournament.rounds.flatMap((round) => round.series)), 10);
  });

  it('makes the field average 1.00', () => {
    const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;
    const lines = aggregatePlayerLines(tournament.rounds.flatMap((round) => round.series), { baseline: awards.ratingBaseline });
    const mean = lines.reduce((sum, line) => sum + line.rating, 0) / lines.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.01);
  });

  it('keeps Round Swing zero-sum across both teams of a series', () => {
    const series = run.matches.find((match) => match.maps.some((map) => map.details?.length))!;
    const lines = aggregatePlayerLines([series]);
    const total = lines.reduce((sum, line) => sum + (line.swing ?? 0) * line.rounds / 100, 0);
    // Each player's swing is rounded to 2 decimals; the rounding error across ten players stays well under 0.1.
    expect(Math.abs(total)).toBeLessThan(0.1);
  });

  it('picks the MVP by rating, placement bonus and swing', () => {
    const awards = computeMajorAwards(tournament.rounds, tournament.championId)!;
    const bonus: Record<string, number> = { placementChampion: 0.12, placementRunnerUp: 0.07, placement3to4: 0.04, placement5to8: 0.02 };
    const score = (award: { rating: number; placement: string; swing?: number }) => award.rating + (bonus[award.placement] ?? 0) + (award.swing ?? 0) / 100;
    expect(awards.topPlayers.every((award) => score(awards.mvp!) >= score(award))).toBe(true);
  });

  it('keeps the HLTV 1.0 shape untouched for the online server', () => {
    const legacy = computeMajorAwards(tournament.rounds, tournament.championId, { model: 'hltv1' })!;
    expect('ratingModel' in legacy).toBe(false);
    expect('ratingBaseline' in legacy).toBe(false);
    expect(Object.keys(legacy.mvp!).sort()).toEqual(LEGACY_AWARD_KEYS);
    expect(legacy.teams.every((team) => Object.keys(team).length === 8)).toBe(true);
  });

  it('asks the online server for HLTV 1.0 explicitly', () => {
    const server = readFileSync('server/room-manager.ts', 'utf8');
    expect(server).toMatch(/computeMajorAwards\([^)]*\{ model: 'hltv1' \}\)/);
  });
});
```

Run: `npx vitest run tests/majorAwards.test.ts`
Expected: FAIL (`fieldRatingBaseline` não exportado; `model` não existe).

- [ ] **Step 3: `majorAwards.ts`**

1. Trocar a linha 1 de imports por:

```ts
import { adrOf, analyzeRound, contributionKey, impactOf, kastPercent, rating3, ratingBaseline, rawRating3, swingPerRound } from './rating';
import { STAGE_PLACEMENT, type MajorAwards, type MajorPlayerAward, type MajorStage, type MajorTeamAward, type MapResult, type RatingModel, type RoundDetail, type SeriesResult, type TeamSide } from './types';
```

2. Em `interface PlayerLine`, depois de `multi: {...};`:

```ts
  assists: number;
  flashAssists: number;
  kastRounds: number;
  damage: number;
  utilityDamage: number;
  swing: number;
  openingDeaths: number;
  tradeKills: number;
  tradedDeaths: number;
```

3. Em `accountMap`, trocar a assinatura e o objeto criado em `ensurePlayer`:

```ts
function accountMap(map: MapResult, series: SeriesResult, players: Map<string, PlayerLine>, teams: Map<string, TeamLine>, model: RatingModel) {
```

```ts
      line = { playerId: id, name, teamId: team.id, teamName: team.name, kills: 0, deaths: 0, headshots: 0, rounds: 0, maps: new Set(), clutches: 0, openingKills: 0, multi: { one: 0, two: 0, triple: 0, quad: 0, ace: 0 }, assists: 0, flashAssists: 0, kastRounds: 0, damage: 0, utilityDamage: 0, swing: 0, openingDeaths: 0, tradeKills: 0, tradedDeaths: 0 };
```

4. Em `accountMap`, logo depois de `const seen = new Set<string>();`, montar elenco, nomes e peso de utilitário do mapa (só no 3.0):

```ts
  // Rating 3.0 only: who played the map, their names and how much they set teammates up (assists weigh utility credit).
  const roster: Record<TeamSide, Set<string>> = { a: new Set(), b: new Set() };
  const names = new Map<string, string>();
  const setUp = new Map<string, number>();
  if (model === 'v3') {
    for (const detail of details) {
      for (const kill of detail.kills) {
        const victimSide: TeamSide = kill.killerSide === 'a' ? 'b' : 'a';
        roster[kill.killerSide].add(kill.killerId);
        roster[victimSide].add(kill.victimId);
        names.set(contributionKey(kill.killerSide, kill.killerId), kill.killerName);
        names.set(contributionKey(victimSide, kill.victimId), kill.victimName);
        if (kill.assistId) {
          roster[kill.killerSide].add(kill.assistId);
          names.set(contributionKey(kill.killerSide, kill.assistId), kill.assistName ?? kill.assistId);
          setUp.set(contributionKey(kill.killerSide, kill.assistId), (setUp.get(contributionKey(kill.killerSide, kill.assistId)) ?? 0) + 1);
        }
        if (kill.flashAssistId) {
          roster[kill.killerSide].add(kill.flashAssistId);
          names.set(contributionKey(kill.killerSide, kill.flashAssistId), kill.flashAssistName ?? kill.flashAssistId);
          setUp.set(contributionKey(kill.killerSide, kill.flashAssistId), (setUp.get(contributionKey(kill.killerSide, kill.flashAssistId)) ?? 0) + 2);
        }
      }
    }
  }
```

5. Dentro do `for (const detail of details) { ... }`, logo antes do fechamento do laço (depois do bloco de `clutch`), acrescentar:

```ts
    if (model === 'v3') {
      const contributions = analyzeRound(detail, {
        roster: { a: [...roster.a], b: [...roster.b] },
        mapId: map.mapId,
        seed: `${series.id}:${map.map}:${detail.number}`,
        utilityWeight: (side, playerId) => 1 + (setUp.get(contributionKey(side, playerId)) ?? 0)
      });
      for (const [key, contribution] of contributions) {
        const playerId = key.slice(2);
        const line = ensurePlayer(playerId, names.get(key) ?? playerId, contribution.side);
        line.assists += contribution.assists;
        line.flashAssists += contribution.flashAssists;
        if (contribution.kast) line.kastRounds += 1;
        line.damage += contribution.damage;
        line.utilityDamage += contribution.utilityDamage;
        line.swing += contribution.swing;
        if (contribution.openingDeath) line.openingDeaths += 1;
        line.tradeKills += contribution.tradeKills;
        if (contribution.tradedDeath) line.tradedDeaths += 1;
        seen.add(playerKey(teamOf(contribution.side).id, playerId));
      }
    }
```

(Abates, mortes, headshots, aberturas e multi-kills continuam contados pelo laço existente; o bloco novo só soma o que o 1.0 não tem. No `'hltv1'` nada disso roda e `seen` fica exatamente como hoje.)

6. Trocar `toPlayerAward` por:

```ts
interface Scoring {
  model: RatingModel;
  /** Field baseline for Rating 3.0. */
  baseline: number;
}

const ratingFor = (line: PlayerLine, scoring: Scoring) =>
  scoring.model === 'v3' ? rating3(rawRating3(line), scoring.baseline) : ratingOf(line);

const rating3Fields = (line: PlayerLine) => ({
  assists: line.assists,
  flashAssists: line.flashAssists,
  kast: Number(kastPercent(line).toFixed(1)),
  adr: Math.round(adrOf(line)),
  utilityDamage: Number((line.utilityDamage / Math.max(1, line.rounds)).toFixed(1)),
  swing: Number(swingPerRound(line).toFixed(2)),
  impact: Number(impactOf(line).toFixed(2)),
  openingDeaths: line.openingDeaths,
  tradeKills: line.tradeKills,
  tradedDeaths: line.tradedDeaths
});

const toPlayerAward = (line: PlayerLine, placement: string, scoring: Scoring): MajorPlayerAward => ({
  playerId: line.playerId,
  name: line.name,
  teamId: line.teamId,
  teamName: line.teamName,
  rating: ratingFor(line, scoring),
  kills: line.kills,
  deaths: line.deaths,
  kdRatio: round2(line.kills / Math.max(1, line.deaths)),
  headshots: line.headshots,
  rounds: line.rounds,
  mapsPlayed: line.maps.size,
  clutches: line.clutches,
  openingKills: line.openingKills,
  multiKills: { triple: line.multi.triple, quad: line.multi.quad, ace: line.multi.ace },
  placement,
  ...(scoring.model === 'v3' ? rating3Fields(line) : {})
});
```

7. Trocar `computeMajorAwards` inteiro por:

```ts
export function computeMajorAwards(rounds: AwardsRound[], championId: string | null, options: { model?: RatingModel } = {}): MajorAwards | null {
  const model = options.model ?? 'v3';
  const players = new Map<string, PlayerLine>();
  const teams = new Map<string, TeamLine>();
  for (const round of rounds) {
    for (const series of round.series) {
      for (const map of series.maps) accountMap(map, series, players, teams, model);
    }
  }
  if (!players.size) return null;
  const scoring: Scoring = { model, baseline: model === 'v3' ? ratingBaseline([...players.values()]) : 0 };
  const placements = placementsOf(rounds, championId);
  const placementOf = (teamId: string) => placements.get(teamId) ?? 'placementStage3';
  const maxRounds = Math.max(...[...players.values()].map((line) => line.rounds));
  // A player who left early cannot be MVP on a hot map: at least a third of the deepest run is required.
  const eligible = [...players.values()].filter((line) => line.rounds >= Math.max(24, maxRounds / 3));
  const awards = (eligible.length ? eligible : [...players.values()]).map((line) => toPlayerAward(line, placementOf(line.teamId), scoring));
  // Rating 3.0 also rewards the rounds a player swung: one percentage point per round is worth 0.01 of MVP score.
  const mvpScore = (award: MajorPlayerAward) => award.rating + (PLACEMENT_BONUS[award.placement] ?? 0) + (model === 'v3' ? (award.swing ?? 0) / 100 : 0);
  const comparePlayers = (left: MajorPlayerAward, right: MajorPlayerAward) =>
    mvpScore(right) - mvpScore(left)
    || right.kills - left.kills
    || left.deaths - right.deaths
    || compareText(left.name, right.name)
    || compareText(left.teamId, right.teamId)
    || compareText(left.playerId, right.playerId);
  const topPlayers = [...awards].sort(comparePlayers).slice(0, 8);
  const teamAwards: MajorTeamAward[] = [...teams.values()].map((line) => {
    const lineup = [...line.players].map((id) => players.get(id)!);
    const weight = lineup.reduce((sum, player) => sum + player.rounds, 0);
    const rating = weight ? lineup.reduce((sum, player) => sum + ratingFor(player, scoring) * player.rounds, 0) / weight : 0;
    return { teamId: line.teamId, name: line.name, rating: round2(rating), mapsWon: line.mapsWon, mapsLost: line.mapsLost, roundsWon: line.roundsWon, roundsLost: line.roundsLost, placement: placementOf(line.teamId) };
  }).sort((left, right) =>
    right.rating - left.rating
    || right.mapsWon - left.mapsWon
    || (right.roundsWon - right.roundsLost) - (left.roundsWon - left.roundsLost)
    || compareText(left.name, right.name)
    || compareText(left.teamId, right.teamId));
  const all = [...players.values()].map((line) => toPlayerAward(line, placementOf(line.teamId), scoring));
  const clutchKing = [...all].sort((left, right) =>
    right.clutches - left.clutches
    || right.rating - left.rating
    || right.kills - left.kills
    || compareText(left.teamId, right.teamId)
    || compareText(left.playerId, right.playerId))[0] ?? null;
  const reel = [...all].filter((award) => award.multiKills.ace + award.multiKills.quad > 0)
    .sort((left, right) =>
      right.multiKills.ace - left.multiKills.ace
      || right.multiKills.quad - left.multiKills.quad
      || right.multiKills.triple - left.multiKills.triple
      || right.rating - left.rating
      || compareText(left.teamId, right.teamId)
      || compareText(left.playerId, right.playerId))[0] ?? null;
  return {
    mvp: topPlayers[0] ?? null,
    topPlayers,
    topTeam: teamAwards[0] ?? null,
    teams: teamAwards,
    clutchKing: clutchKing && clutchKing.clutches > 0 ? clutchKing : null,
    highlightReel: reel,
    ...(model === 'v3' ? { ratingModel: 'v3' as const, ratingBaseline: scoring.baseline } : {})
  };
}
```

8. Trocar `aggregatePlayerLines` por:

```ts
const collectLines = (series: SeriesResult[], model: RatingModel) => {
  const players = new Map<string, PlayerLine>();
  const teams = new Map<string, TeamLine>();
  for (const item of series) for (const map of item.maps) accountMap(map, item, players, teams, model);
  return [...players.values()];
};

/** Mean raw Rating 3.0 of every player in the given series. */
export const fieldRatingBaseline = (series: SeriesResult[]): number => ratingBaseline(collectLines(series, 'v3'));

/**
 * Per-player line of one team across the given series (for run statistics based on the real kill feed). With Rating 3.0,
 * pass the Major's `ratingBaseline` so a single map or a single team is rated against the whole field.
 */
export function aggregatePlayerLines(series: SeriesResult[], options: { model?: RatingModel; baseline?: number } = {}): MajorPlayerAward[] {
  const model = options.model ?? 'v3';
  const lines = collectLines(series, model);
  const scoring: Scoring = { model, baseline: model === 'v3' ? options.baseline ?? ratingBaseline(lines) : 0 };
  return lines.map((line) => toPlayerAward(line, 'placementStage3', scoring));
}
```

9. Em `src/lib/game/runStats.ts`, para as stats não mudarem antes da Task 3, trocar `aggregatePlayerLines(run.matches)` por `aggregatePlayerLines(run.matches, { model: 'hltv1' })` e `aggregatePlayerLines([{ ...match, maps: [map] }])` por `aggregatePlayerLines([{ ...match, maps: [map] }], { model: 'hltv1' })`. Nada mais muda nesse arquivo nesta tarefa.

10. Em `server/room-manager.ts`, trocar `room.awards = computeMajorAwards(result.rounds, result.championId);` por:

```ts
    // Online rooms stay on HLTV 1.0: live clients never receive the kill feed of other series (protocol 9).
    room.awards = computeMajorAwards(result.rounds, result.championId, { model: 'hltv1' });
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/rating3.test.ts tests/majorAwards.test.ts tests/onlineSeason.test.ts tests/normalRunGolden.test.ts && git status --short tests/__snapshots__`
Expected: todos passam; a última linha não imprime nada.

Run: `npm run check && npm run server:build`
Expected: `0 ERRORS 0 WARNINGS`; bundle do servidor gerado.

Run: `npx vitest run`
Expected: suíte completa verde (as stats da run ainda estão no 1.0 por causa do item 9). Qualquer falha fora de `tests/majorAwards.test.ts` que mencione rating ou MVP: parar e relatar o teste e a asserção.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/majorAwards.ts src/lib/game/runStats.ts server/room-manager.ts tests/majorAwards.test.ts
git commit -m "feat: prêmios do Major com Rating 3.0 e swing no offline, servidor online segue no 1.0

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Stats da run com Rating 3.0

**Files:**
- Modify: `src/lib/game/types.ts` (`PlayerRunStats`)
- Modify: `src/lib/game/runStats.ts` (`createRunStats`, `createKillFeedRunStats`)
- Modify: `server/room-manager.ts` (chamada de `createRunStats`)
- Modify: `tests/runStats.test.ts`

**Interfaces:**
- Consumes: `aggregatePlayerLines(series, { model, baseline })`, `fieldRatingBaseline(series)` (Task 2); `MajorAwards.ratingModel`/`ratingBaseline`.
- Produces:
  - `createRunStats(players, run, seed, lineup = [], userTeamId = 'user', options: { model?: RatingModel } = {})` (padrão `'v3'`)
  - `PlayerRunStats` com opcionais `assists`, `flashAssists`, `kast`, `swing`, `utilityDamage`, `openingDeaths`, `tradeKills`, `multiKills: { triple; quad; ace }` — presentes só no caminho do kill feed com `'v3'`. `runRating`, `adr` e `impact` passam a ser os do 3.0 nesse caminho.

- [ ] **Step 1: Tipo**

Em `PlayerRunStats` (`types.ts`), depois de `roundsLost: number;`:

```ts
  /** Rating 3.0 kill-feed stats only (absent in HLTV 1.0 and in the synthetic fallback). */
  assists?: number;
  flashAssists?: number;
  kast?: number;
  swing?: number;
  utilityDamage?: number;
  openingDeaths?: number;
  tradeKills?: number;
  multiKills?: { triple: number; quad: number; ace: number };
```

- [ ] **Step 2: Testes**

Em `tests/runStats.test.ts`:

1. Trocar a linha 7 por:

```ts
import { aggregatePlayerLines } from '../src/lib/game/majorAwards';
import type { MajorRun, Player, SelectedPlayer } from '../src/lib/game/types';
```

2. No teste `'takes kills, deaths, K/D and rating straight from the user series'`, trocar as quatro linhas de ADR e impacto:

```ts
      expect(stat.adr).toBeGreaterThanOrEqual(40);
      expect(stat.adr).toBeLessThanOrEqual(115);
      expect(stat.impact).toBeGreaterThanOrEqual(0.5);
      expect(stat.impact).toBeLessThanOrEqual(1.6);
```

por:

```ts
      // Rating 3.0: ADR comes from kill, assist and utility damage; impact from 2.13·KPR + 0.42·APR − 0.41.
      expect(stat.adr).toBeGreaterThan(0);
      expect(stat.adr).toBeLessThanOrEqual(200);
      expect(stat.impact).toBeGreaterThanOrEqual(-0.41);
      expect(stat.impact).toBeLessThanOrEqual(3);
      expect(stat.kast).toBeGreaterThanOrEqual(0);
      expect(stat.kast).toBeLessThanOrEqual(100);
      expect(Number.isFinite(stat.swing)).toBe(true);
      expect(stat.assists).toBeGreaterThanOrEqual(0);
      expect(stat.multiKills).toBeDefined();
```

3. Acrescentar dentro do `describe`, depois do último `it`:

```ts
  it('uses the Rating 3.0 of the kill feed against the whole Major field', () => {
    const stats = createRunStats(picked, run, 'run-stats-seed', lineup);
    expect(run.tournament?.awards?.ratingModel).toBe('v3');
    const lines = new Map(aggregatePlayerLines(run.matches, { baseline: run.tournament!.awards!.ratingBaseline })
      .filter((line) => line.teamId === 'user')
      .map((line) => [line.playerId, line] as const));
    for (const stat of stats) {
      const line = lines.get(stat.playerId)!;
      expect(stat.runRating).toBe(line.rating);
      expect(stat.adr).toBe(line.adr);
      expect(stat.kast).toBe(line.kast);
      expect(stat.swing).toBe(line.swing);
      expect(stat.tradeKills).toBe(line.tradeKills);
    }
  });

  it('keeps the HLTV 1.0 stats untouched for the online server', () => {
    const legacy = createRunStats(picked, run, 'run-stats-seed', lineup, 'user', { model: 'hltv1' });
    const keys = ['adr', 'assignedRole', 'clutches', 'consistency', 'deaths', 'impact', 'kdRatio', 'kills', 'mapsLost', 'mapsPlayed', 'mapsWon', 'mvpCount', 'openingKills', 'playerId', 'roundsLost', 'roundsWon', 'runRating'];
    for (const stat of legacy) {
      expect(Object.keys(stat).sort()).toEqual(keys);
      expect(stat.adr).toBeGreaterThanOrEqual(40);
      expect(stat.adr).toBeLessThanOrEqual(115);
      expect(stat.impact).toBeGreaterThanOrEqual(0.5);
      expect(stat.impact).toBeLessThanOrEqual(1.6);
    }
    expect(legacy).toEqual(createRunStats(picked, run, 'run-stats-seed', lineup, 'user', { model: 'hltv1' }));
  });
```

4. Em `tests/rating3.test.ts`, acrescentar `import { readFileSync } from 'node:fs';` como primeira linha do arquivo e, ao fim, o bloco abaixo (garante o servidor no 1.0 também nas stats):

```ts
describe('servidor online', () => {
  it('pede HLTV 1.0 para prêmios e stats', () => {
    const server = readFileSync('server/room-manager.ts', 'utf8');
    expect(server.match(/\{ model: 'hltv1' \}/g)).toHaveLength(2);
  });
});
```


Run: `npx vitest run tests/runStats.test.ts tests/rating3.test.ts`
Expected: FAIL (`createRunStats` ignora o 6º argumento; servidor com 1 ocorrência).

- [ ] **Step 3: `runStats.ts`**

1. Imports:

```ts
import { aggregatePlayerLines, fieldRatingBaseline } from './majorAwards';
import { getEligibleSlotRoles, getSelectedRoles } from './roleRules';
import { createSeededRng } from './simulation';
import type { LineupSlotRole, MajorPlayerAward, MajorRun, Player, PlayerRunStats, RatingModel, SelectedPlayer, SeriesResult } from './types';
```

2. No comentário de `createKillFeedRunStats`, trocar as linhas de `runRating`, `adr` e `impact` por:

```ts
 *   runRating   = Rating 3.0 approximation against the Major field (see rating.ts), or HLTV 1.0 with model 'hltv1'
 *   adr         = v3: (kill + assist + utility damage) / rounds; hltv1: kills / rounds · 105 + seeded noise in ±4, clamped to 40–115
 *   impact      = v3: 2.13·KPR + 0.42·APR − 0.41; hltv1: 0.3 + 2 · openingKills/rounds + 0.8 · kills/rounds + multi-kill weight, clamped to 0.5–1.6
```

3. Trocar a assinatura de `createKillFeedRunStats` e o bloco que monta `totals`:

```ts
function createKillFeedRunStats(
  players: Player[],
  run: MajorRun,
  seed: string,
  roleByPlayer: Map<string, SelectedPlayer>,
  userTeamId: string,
  summary: RunSummary,
  model: RatingModel
): PlayerRunStats[] | null {
  if (!hasCompleteKillFeed(run.matches)) return null;
  const lineupIds = new Set(players.map((player) => player.id));
  // The Major's awards were computed on the whole field before the other series lost their kill feeds: that is the baseline.
  const awards = run.tournament?.awards;
  const baseline = model === 'v3'
    ? (awards?.ratingModel === 'v3' && awards.ratingBaseline ? awards.ratingBaseline : fieldRatingBaseline(run.matches))
    : undefined;
  const scoring = { model, baseline };
  const totals = new Map(aggregatePlayerLines(run.matches, scoring)
    .filter((line) => line.teamId === userTeamId && lineupIds.has(line.playerId))
    .map((line) => [line.playerId, line] as const));
```

4. Na mesma função, trocar `const lines = aggregatePlayerLines([{ ...match, maps: [map] }], { model: 'hltv1' })` (fixado na Task 2) por `const lines = aggregatePlayerLines([{ ...match, maps: [map] }], scoring)`.

5. Trocar o `return players.map(...)` final de `createKillFeedRunStats` por:

```ts
  return players.map((player) => {
    const selected = roleByPlayer.get(player.id);
    const role = selected?.selectedSlotRole ?? getEligibleSlotRoles(player)[0] ?? 'rifler';
    const line = totals.get(player.id)!;
    const rounds = Math.max(1, line.rounds);
    const killsPerRound = line.kills / rounds;
    const consistency = Math.round(clamp(100 - standardDeviation(perMap.get(player.id) ?? []) * 90, 45, 99));
    let adr: number;
    let impact: number;
    if (model === 'v3') {
      adr = line.adr ?? 0;
      impact = line.impact ?? 0;
    } else {
      const rng = createSeededRng(`${seed}:stats-feed:${player.id}:${run.placement}`);
      const multiWeight = (line.multiKills.triple * 0.25 + line.multiKills.quad * 0.5 + line.multiKills.ace) / rounds * 4;
      adr = Math.round(clamp(killsPerRound * 105 + (rng() - 0.5) * 8, 40, 115));
      impact = Number(clamp(0.3 + (line.openingKills / rounds) * 2 + killsPerRound * 0.8 + multiWeight, 0.5, 1.6).toFixed(2));
    }
    return {
      playerId: player.id,
      assignedRole: role,
      runRating: line.rating,
      kills: line.kills,
      deaths: line.deaths,
      kdRatio: Number((line.kills / Math.max(1, line.deaths)).toFixed(2)),
      adr,
      impact,
      clutches: line.clutches,
      openingKills: line.openingKills,
      mvpCount: mvpCounts.get(player.id) ?? 0,
      consistency,
      mapsPlayed: summary.mapsPlayed,
      mapsWon: summary.mapsWon,
      mapsLost: summary.mapsLost,
      roundsWon: summary.roundsWon,
      roundsLost: summary.roundsLost,
      ...(model === 'v3'
        ? {
          assists: line.assists ?? 0,
          flashAssists: line.flashAssists ?? 0,
          kast: line.kast ?? 0,
          swing: line.swing ?? 0,
          utilityDamage: line.utilityDamage ?? 0,
          openingDeaths: line.openingDeaths ?? 0,
          tradeKills: line.tradeKills ?? 0,
          multiKills: { ...line.multiKills }
        }
        : {})
    };
  });
```

(No `'hltv1'` a ordem de chamadas do `rng` é a mesma de hoje: um `rng()` só, dentro do cálculo de ADR.)

6. Em `createRunStats`, trocar a assinatura e a chamada:

```ts
export function createRunStats(
  players: Player[],
  run: MajorRun,
  seed: string,
  lineup: SelectedPlayer[] = [],
  userTeamId = 'user',
  options: { model?: RatingModel } = {}
): PlayerRunStats[] {
  const summary = getRunSummary(run, userTeamId);
  const roleByPlayer = new Map(lineup.map((selected) => [selected.playerId, selected] as const));
  const real = createKillFeedRunStats(players, run, seed, roleByPlayer, userTeamId, summary, options.model ?? 'v3');
```

(O modelo sintético abaixo não muda.)

7. Em `server/room-manager.ts`, na chamada `createRunStats(runPlayers, run, `${room.seed}:participant-result:${participant.id}`, participant.draft.lineup, participant.id)`, acrescentar o 6º argumento `{ model: 'hltv1' }`:

```ts
      stats: createRunStats(runPlayers, run, `${room.seed}:participant-result:${participant.id}`, participant.draft.lineup, participant.id, { model: 'hltv1' })
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/runStats.test.ts tests/rating3.test.ts tests/majorAwards.test.ts tests/simulation.test.ts tests/normalRunGolden.test.ts && git status --short tests/__snapshots__`
Expected: todos passam; nenhuma linha de snapshot.

Run: `npx vitest run && npm run check && npm run server:build`
Expected: suíte completa verde; `0 ERRORS 0 WARNINGS`; bundle do servidor gerado. Se algum outro teste falhar por número de rating ou MVP (por exemplo `runCard`, `runHighlights`, `sandboxMajor`, `campaignMajor*`, `dynasty*`), parar e relatar o teste e a asserção: não afrouxar asserção sem registrar o motivo.

Medir o custo do 3.0 no Major ao vivo (o `toMajorRun` recalcula os prêmios a cada passo):

Run: `npx vitest run tests/campaignMajorStages.test.ts --reporter=verbose 2>&1 | grep -E "joga até o fim|passed|failed"`
Expected: passa. Registrar o tempo do teste "joga até o fim" no relato; se passar de 30 s (o timeout do teste), parar e relatar.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/runStats.ts server/room-manager.ts tests/runStats.test.ts tests/rating3.test.ts
git commit -m "feat: stats da run com Rating 3.0, KAST, swing, dano real e trocas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Tela de stats e prêmios

**Files:**
- Modify: `src/lib/game/i18n.ts`
- Modify: `src/lib/components/RunStatsGrid.svelte`
- Modify: `src/lib/components/MajorAwardsPanel.svelte`

**Interfaces:**
- Consumes: campos opcionais de `PlayerRunStats` (Task 3) e `MajorPlayerAward`/`MajorAwards` (Task 2).
- Produces: chaves i18n `rating3`, `rating3Help`, `statSwing`, `statKast`, `statUtility`, `statOpenings`, `statTrades`. Os componentes mostram as colunas novas só quando os campos existem, então o online (1.0) continua com a tela de hoje.

- [ ] **Step 1: Textos**

Em `src/lib/game/i18n.ts`, no bloco `pt`, logo depois de `  belowExpected: 'Abaixo do esperado',`:

```ts
  rating3: 'Rating 3.0',
  rating3Help: 'Rating 3.0 aproximado: a HLTV não publica os pesos oficiais. Combina KAST, abates, mortes, impacto, ADR e Round Swing; 1,00 é a média dos jogadores do Major.',
  statSwing: 'Swing',
  statKast: 'KAST',
  statUtility: 'Dano de utilitário',
  statOpenings: 'Aberturas V–D',
  statTrades: 'Trocas',
```

No bloco `es`, logo depois de `  belowExpected: 'Por debajo de lo esperado',`:

```ts
  rating3: 'Rating 3.0',
  rating3Help: 'Rating 3.0 aproximado: HLTV no publica los pesos oficiales. Combina KAST, bajas, muertes, impacto, ADR y Round Swing; 1,00 es la media de los jugadores del Major.',
  statSwing: 'Swing',
  statKast: 'KAST',
  statUtility: 'Daño de utilidad',
  statOpenings: 'Aperturas G–P',
  statTrades: 'Intercambios',
```

No bloco `en` (o `Object.assign(dictionaries.en, {` que contém `belowExpected:`; confira com `grep -n "belowExpected" src/lib/game/i18n.ts`), logo depois dessa linha:

```ts
  rating3: 'Rating 3.0',
  rating3Help: 'Approximate Rating 3.0: HLTV does not publish the official weights. It combines KAST, kills, deaths, impact, ADR and Round Swing; 1.00 is the average player of the Major.',
  statSwing: 'Swing',
  statKast: 'KAST',
  statUtility: 'Utility damage',
  statOpenings: 'Openings W–L',
  statTrades: 'Trades',
```

- [ ] **Step 2: `RunStatsGrid.svelte`**

No `<script>`, depois de `const resolve = ...`:

```ts
  $: hasRating3 = stats.some((stat) => stat.kast !== undefined);
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
```

Trocar a linha do rating:

```svelte
        <div class="rating"><small>{stat.kast !== undefined ? t('rating3').toUpperCase() : 'RUN RATING'}</small><b>{stat.runRating.toFixed(2)}</b>{#if stat.swing !== undefined}<i class="swing" class:up={stat.swing > 0} class:down={stat.swing < 0}>{t('statSwing').toUpperCase()} {signed(stat.swing)}</i>{/if}</div>
```

Trocar a linha `<div class="stat-numbers">...</div>` por:

```svelte
        <div class="stat-numbers">
          {#if stat.assists !== undefined}<span><small>K / D / A</small><b>{stat.kills} / {stat.deaths} / {stat.assists}</b></span>{:else}<span><small>K / D</small><b>{stat.kills} / {stat.deaths}</b></span>{/if}
          <span><small>K/D</small><b>{stat.kdRatio.toFixed(2)}</b></span>
          {#if stat.kast !== undefined}<span><small>{t('statKast')}</small><b>{stat.kast.toFixed(1)}%</b></span>{/if}
          <span><small>ADR</small><b>{stat.adr}</b></span>
          {#if stat.utilityDamage !== undefined}<span><small>{t('statUtility')}</small><b>{stat.utilityDamage.toFixed(1)}</b></span>{/if}
          <span><small>IMPACT</small><b>{stat.impact.toFixed(2)}</b></span>
          {#if stat.openingDeaths !== undefined}<span><small>{t('statOpenings')}</small><b>{stat.openingKills}–{stat.openingDeaths}</b></span>{:else}<span><small>OPENINGS</small><b>{stat.openingKills}</b></span>{/if}
          {#if stat.tradeKills !== undefined}<span><small>{t('statTrades')}</small><b>{stat.tradeKills}</b></span>{/if}
          {#if stat.multiKills}<span><small>3K / 4K / ACE</small><b>{stat.multiKills.triple} / {stat.multiKills.quad} / {stat.multiKills.ace}</b></span>{/if}
          <span><small>CLUTCHES</small><b>{stat.clutches}</b></span>
          <span><small>{t('mapsWon')} / {t('mapsLost')}</small><b>{stat.mapsWon} / {stat.mapsLost}</b></span>
          <span><small>{t('roundsWon')} / {t('roundsLost')}</small><b>{stat.roundsWon} / {stat.roundsLost}</b></span>
          <span><small>CONSISTENCY</small><b>{stat.consistency}</b></span>
        </div>
```

Depois do `</div>` que fecha `.run-stats-grid` (antes do `<style>`):

```svelte
{#if hasRating3}<p class="rating-help">{t('rating3Help')}</p>{/if}
```

No `<style>`, acrescentar:

```css
  .rating .swing{display:block;margin-top:4px;font-style:normal;font-size:.62rem;font-weight:800;letter-spacing:.06em;color:var(--muted)}
  .rating .swing.up{color:var(--accent)}
  .rating .swing.down{color:var(--danger)}
  .rating-help{margin:-6px 0 18px;color:var(--muted);font-size:.72rem;line-height:1.5}
```

- [ ] **Step 3: `MajorAwardsPanel.svelte`**

No `<script>`, depois de `const teamRecord = ...`:

```ts
  $: isRating3 = awards?.ratingModel === 'v3';
  $: ratingLabel = isRating3 ? t('rating3') : t('rating');
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
```

Trocar as quatro ocorrências de `{t('rating')}` no markup por `{ratingLabel}` (card do MVP, card do melhor time e o `<th>` da tabela de times).

No card do MVP, dentro de `<div class="award-numbers">`, depois do `<span>` de `K/D`:

```svelte
          {#if mvp.swing !== undefined}<span><small>{t('statSwing').toUpperCase()}</small><b>{signed(mvp.swing)}</b></span>{/if}
          {#if mvp.kast !== undefined}<span><small>{t('statKast')}</small><b>{mvp.kast.toFixed(1)}%</b></span>{/if}
          {#if mvp.adr !== undefined}<span><small>ADR</small><b>{mvp.adr}</b></span>{/if}
```

Na lista de top jogadores, depois de `<span class="line"><small>K–D</small>{award.kills}–{award.deaths}</span>`:

```svelte
              {#if award.swing !== undefined}<span class="line"><small>{t('statSwing').toUpperCase()}</small>{signed(award.swing)}</span>{/if}
```

Antes de `</section>` (fim do componente, depois do bloco `{/if}` principal):

```svelte
  {#if isRating3}<p class="awards-help">{t('rating3Help')}</p>{/if}
```

No `<style>`, acrescentar:

```css
  .awards-help{margin:12px 0 0;color:var(--muted);font-size:.72rem;line-height:1.5}
```

- [ ] **Step 4: Verificar**

Run: `npm run check && npx vitest run && npm run build`
Expected: `0 ERRORS 0 WARNINGS`; suíte completa verde; build ok.

Verificação no navegador (`npm run dev`), se houver navegador; senão, registrar que não foi feita:
1. Normal com a seed `dourado-normal-2026`: o resultado (campeão e séries) é o mesmo de antes; o painel de prêmios mostra "Rating 3.0", swing, KAST e ADR do MVP e o texto de ajuda; as stats mostram K/D/A, KAST, ADR, dano de utilitário, aberturas V–D, trocas e 3K/4K/ACE.
2. Tela `stats`: mesmos campos e texto de ajuda.
3. Sandbox: prêmios e stats com os campos novos.
4. Online (se houver sala de teste): prêmios e stats sem campos novos, rótulo "Rating".
5. Celular de 375 px: a grade de números quebra linha sem overflow horizontal.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/i18n.ts src/lib/components/RunStatsGrid.svelte src/lib/components/MajorAwardsPanel.svelte
git commit -m "feat: tela de stats e prêmios com Rating 3.0, swing, KAST, dano de utilitário e trocas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Gate final e fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (sequência de entregas)

- [ ] **Step 1: Gate**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected: svelte-check `0 ERRORS 0 WARNINGS`; vitest com todos os arquivos passando (inclui `rating3`); build do front e do servidor; nenhuma linha de snapshot.

- [ ] **Step 2: Confirmar que a partida não mudou**

Run: `git diff 8d0346b -- src/lib/game/rounds.ts src/lib/game/online/live-series.ts src/lib/game/online/tournament-engine.ts src/lib/game/online/contracts.ts | wc -l`
Expected: `0` (nenhuma linha alterada por esta entrega nesses arquivos; se a entrega C já tiver sido integrada antes, comparar só os commits desta entrega com `git log --oneline -- <arquivo>`).

- [ ] **Step 3: Registrar na spec**

Na seção "Sequência de entregas", trocar o início do item 4 `4. **Rating 3.0, Round Swing e stats**:` por `4. **Rating 3.0, Round Swing e stats** (plano `docs/superpowers/plans/2026-09-14-dinastia-d-rating3-swing-stats.md`, implementada):`. Na seção "Rating 3.0, Round Swing e stats", acrescentar ao fim do último item (sobre o online) a frase: "Nesta entrega o servidor chama `computeMajorAwards` e `createRunStats` com `{ model: 'hltv1' }`, e o protocolo 9 não muda."

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-14-dinastia-design.md
git commit -m "docs: aponta o plano da entrega D na spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

- [ ] **Step 5: Relato**

Relatar: arquivos e commits; contagem de testes; os dois testes existentes ajustados e por quê; tempo do teste "joga até o fim"; se a verificação no navegador foi feita; riscos (abaixo). Não fazer push.

## Riscos

- **Custo no Major ao vivo.** `toMajorRun` recalcula os prêmios do campo inteiro a cada passo da série do usuário, e o 3.0 analisa cada round. O Step 4 da Task 3 mede; se ficar lento, a otimização (memorizar por série concluída) é uma entrega separada.
- **Números diferentes do site da HLTV.** Os pesos do 3.0 não são públicos; dano e utilitário são estimados a partir do kill feed. A tela diz que é aproximação.
- **Online segue no 1.0.** Quem joga online vê "Rating" e as stats de hoje, diferentes do offline. Levar o 3.0 ao servidor exige kill feed completo no servidor e fica para depois, sem mudar o protocolo 9 nesta entrega.
- **Saves antigos.** Runs salvas antes desta entrega têm prêmios sem `ratingModel`; as stats recalculadas no load usam a base do campo das próprias séries do usuário (`fieldRatingBaseline`), um pouco diferente da base do Major inteiro.

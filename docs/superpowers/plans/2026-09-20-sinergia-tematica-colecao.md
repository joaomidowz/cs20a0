# Sinergia temática da coleção — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar bônus de poder para lines temáticas — mesmo time, mesmo país e mesmo ano — para que montar com critério valha mais que empilhar as cartas mais caras.

**Architecture:** Um módulo puro novo (`collection-theme.ts`) calcula as três linhas a partir dos jogadores, do coach e dos lookups de país/organização. `synergyOf` (em `collection-lineup.ts`) concatena o resultado às linhas que já existem, então o montador, o preview e o servidor herdam o comportamento sem mudança própria. O país vem do módulo gerado `collection-countries.ts`, que já vive dentro do limite do online.

**Tech Stack:** TypeScript, SvelteKit, Vitest. Sem dependência nova.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-09-20-sinergia-tematica-colecao-design.md`.
- Regras puras ficam em `src/lib/game/online/*.ts`, compartilhadas entre cliente e servidor. Sem I/O, sem `Date.now()`, sem aleatoriedade.
- **Não editar `src/lib/game/online/collection-countries.ts` à mão** — é gerado por `npm run sync:countries`.
- **Não alterar `tests/catalogGuards.test.ts`** — esta entrega não precisa de exceção nova.
- Nenhum arquivo novo pode ter "catalog" no nome, nem importar `identities.game.json` de dentro de `src/lib/game/online`, `src/routes/online` ou `server`.
- Escada do tema: 2 → 0,25% · 3 → 0,5% · 4 → 1% · 5 → 1,5% · 6 → 2%.
- Teto de 2% por linha e 6% no total.
- Comentários e nomes em inglês, seguindo `collection-lineup.ts`. Textos de tela em pt-BR, en e es.
- Commits `feat:` / `fix:` / `test:`, sem push e sem deploy dentro das tasks. O deploy é a Task 7, só depois da aprovação.
- Rodar o banco de teste quando precisar da suíte inteira: `docker compose -f docker-compose.dev.yml up -d` e `TEST_DATABASE_URL=postgres://cs13a0:cs13a0@127.0.0.1:5435/cs13a0`.

---

### Task 1: Países faltantes e regeneração do módulo

**Files:**
- Modify: `src/lib/data/cs/identities.game.json`
- Regenerate: `src/lib/game/online/collection-countries.ts` (via script, não editar)
- Test: `tests/collectionTheme.test.ts` (criar com o primeiro caso)

**Interfaces:**
- Consumes: `playerCountryOf(player)` de `src/lib/game/online/collection-countries.ts` (já existe).
- Produces: cobertura de país 542/542 por `baseId`, que a Task 3 assume.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/collectionTheme.test.ts`:

```ts
// tests/collectionTheme.test.ts
// Sinergia temática da coleção: contagem por time/país/ano, escada, tetos e o coach como sexto integrante.
import { describe, expect, it } from 'vitest';
import { collectionPlayers } from '../src/lib/game/online/collection-pool';
import { playerCountryOf } from '../src/lib/game/online/collection-countries';

describe('dados de país da coleção', () => {
  it('todo jogador do pool tem país, para a linha de país nunca depender de dado faltando', () => {
    const semPais = collectionPlayers.filter((player) => !playerCountryOf(player));
    expect(semPais.map((player) => player.baseId ?? player.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: FAIL, listando 15 baseIds (`magisk`, `adren`, `zeus`, `scream`, `steel`, `amanek`, `fox`, `znajder`, `adren-liquid`, `matys`, `lucky`, `fear`, `tiger`, `z4kr`, `sonic`).

- [ ] **Step 3: Preencher os 15 países em `identities.game.json`**

O arquivo é um objeto `{ "players": { "<baseId>": { "country": "<código>" } , ... }, "orgs": {}, "teamOrg": {} }`, com as chaves em ordem alfabética. Inserir cada entrada abaixo na posição alfabética correta, no mesmo formato das vizinhas (dois níveis de indentação, `"country"` como única chave):

| baseId | country |
|---|---|
| `adren` | `kz` |
| `adren-liquid` | `us` |
| `amanek` | `fr` |
| `fear` | `ua` |
| `fox` | `pt` |
| `lucky` | `fr` |
| `magisk` | `dk` |
| `matys` | `sk` |
| `scream` | `be` |
| `sonic` | `za` |
| `steel` | `br` |
| `tiger` | `cn` |
| `z4kr` | `cn` |
| `zeus` | `ua` |
| `znajder` | `se` |

Exemplo do formato exato de uma entrada:

```json
    "magisk": {
      "country": "dk"
    },
```

`adren` (cazaque, Dauren Kystaubayev) e `adren-liquid` (americano, Dan Gustaferro) são pessoas diferentes: as duas entradas existem, com países diferentes.

- [ ] **Step 4: Regenerar o módulo do online**

Run: `npm run sync:countries`
Expected: imprime `collection-countries.ts atualizado`.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: PASS.

- [ ] **Step 6: Confirmar que a guarda do catálogo continua verde**

Run: `npx vitest run tests/catalogGuards.test.ts`
Expected: PASS, sem nenhuma alteração no arquivo de guarda.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/cs/identities.game.json src/lib/game/online/collection-countries.ts tests/collectionTheme.test.ts
git commit -m "fix: país dos 15 jogadores que faltavam na coleção (Magisk, Zeus, ScreaM, AdreN e outros)"
```

---

### Task 2: Blocos da cena

**Files:**
- Create: `src/lib/game/online/collection-theme.ts`
- Test: `tests/collectionTheme.test.ts` (adicionar bloco novo)

**Interfaces:**
- Produces: `SCENE_BLOCS: Readonly<Record<string, string>>` (país → nome do bloco) e `blocOf(country: string | null): string | null`, usados pela Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `tests/collectionTheme.test.ts`:

```ts
import { SCENE_BLOCS, blocOf } from '../src/lib/game/online/collection-theme';

describe('blocos da cena', () => {
  it('todo país do pool cai num bloco', () => {
    const paises = new Set(collectionPlayers.map((player) => playerCountryOf(player)).filter((country): country is string => Boolean(country)));
    const orfaos = [...paises].filter((country) => !blocOf(country));
    expect(orfaos).toEqual([]);
    expect(paises.size).toBe(52);
  });

  it('agrupa a cena como ela se divide de verdade', () => {
    expect(blocOf('ru')).toBe('cis');
    expect(blocOf('ua')).toBe('cis');
    expect(blocOf('kz')).toBe('cis');
    expect(blocOf('dk')).toBe('nordic');
    expect(blocOf('se')).toBe('nordic');
    expect(blocOf('br')).toBe('latam');
    expect(blocOf('us')).toBe('northAmerica');
    expect(blocOf('ca')).toBe('northAmerica');
    expect(blocOf('fr')).toBe('westEurope');
    expect(blocOf('pl')).toBe('eastEurope');
    expect(blocOf('cn')).toBe('asiaOceania');
    expect(blocOf('mn')).toBe('asiaOceania');
    expect(blocOf('tr')).toBe('mena');
    expect(blocOf('za')).toBe('mena');
    expect(blocOf(null)).toBeNull();
    expect(blocOf('zz')).toBeNull();
  });

  it('nenhum país aparece em dois blocos', () => {
    expect(Object.keys(SCENE_BLOCS).length).toBe(new Set(Object.keys(SCENE_BLOCS)).size);
    expect(Object.keys(SCENE_BLOCS).length).toBe(52);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: FAIL com "Failed to resolve import ... collection-theme".

- [ ] **Step 3: Criar o módulo com os blocos**

Criar `src/lib/game/online/collection-theme.ts`:

```ts
/**
 * Thematic synergy of the collection: a lineup built around one team, one country or one year gets a bonus.
 * Pure and shared — the server applies it to the tournament team and the builder previews the same numbers.
 */

/** Scene blocs: the country groups Counter-Strike actually splits into. Every country of the pool belongs to one. */
export type SceneBloc = 'cis' | 'nordic' | 'latam' | 'westEurope' | 'eastEurope' | 'asiaOceania' | 'northAmerica' | 'mena';

const BLOC_COUNTRIES: Readonly<Record<SceneBloc, readonly string[]>> = {
  cis: ['ru', 'ua', 'kz', 'by', 'uz', 'az'],
  nordic: ['dk', 'se', 'fi', 'no'],
  latam: ['br', 'ar', 'uy', 'cl', 'gt'],
  westEurope: ['fr', 'de', 'gb', 'es', 'pt', 'nl', 'be', 'ch'],
  eastEurope: ['pl', 'cz', 'sk', 'hu', 'ro', 'bg', 'lt', 'lv', 'ee', 'xk', 'mk', 'ba', 'rs', 'me'],
  asiaOceania: ['cn', 'mn', 'au', 'nz', 'in', 'id', 'hk', 'my', 'tw'],
  northAmerica: ['us', 'ca'],
  mena: ['tr', 'il', 'jo', 'za']
};

/** Country (flag-icons code) to its bloc; the map the lookup reads. */
export const SCENE_BLOCS: Readonly<Record<string, SceneBloc>> = Object.fromEntries(
  Object.entries(BLOC_COUNTRIES).flatMap(([bloc, countries]) => countries.map((country) => [country, bloc as SceneBloc]))
);

export const blocOf = (country: string | null | undefined): SceneBloc | null => (country ? SCENE_BLOCS[country] ?? null : null);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/online/collection-theme.ts tests/collectionTheme.test.ts
git commit -m "feat: blocos da cena por país para a sinergia temática"
```

---

### Task 3: A regra do tema

**Files:**
- Modify: `src/lib/game/online/collection-theme.ts`
- Test: `tests/collectionTheme.test.ts`

**Interfaces:**
- Consumes: `blocOf` da Task 2.
- Produces:
  - `THEME_LADDER: Readonly<Record<number, number>>`
  - `THEME_LINE_CAP = 2`, `THEME_TOTAL_CAP = 6`
  - `interface ThemeMember { country: string | null; teamId: string | null; org: string | null; year: number | null }`
  - `interface ThemeLine { key: 'theme_team' | 'theme_country' | 'theme_year'; power: number; theme: string; count: number; exact: boolean }`
  - `themeLines(players: readonly ThemeMember[], coach: ThemeMember | null): ThemeLine[]`

A Task 4 chama `themeLines` e converte o resultado em `SynergyLine`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `tests/collectionTheme.test.ts`:

```ts
import { THEME_LADDER, THEME_LINE_CAP, THEME_TOTAL_CAP, themeLines, type ThemeMember } from '../src/lib/game/online/collection-theme';

const member = (over: Partial<ThemeMember> = {}): ThemeMember => ({ country: null, teamId: null, org: null, year: null, ...over });
const five = (over: Partial<ThemeMember>) => Array.from({ length: 5 }, () => member(over));
const powerOf = (lines: ReturnType<typeof themeLines>, key: string) => lines.find((line) => line.key === key)?.power ?? 0;

describe('regra do tema', () => {
  it('a escada premia fechar: 2 vale pouco e o último integrante vale o dobro do resto', () => {
    expect(THEME_LADDER).toMatchObject({ 2: 0.25, 3: 0.5, 4: 1, 5: 1.5, 6: 2 });
    expect(THEME_LADDER[1]).toBe(0);
    for (let count = 2; count <= 5; count += 1) {
      const players = Array.from({ length: 5 }, (_, index) => member(index < count ? { year: 2017 } : { year: 1900 + index }));
      expect(powerOf(themeLines(players, null), 'theme_year')).toBe(THEME_LADDER[count]);
    }
  });

  it('vale o maior grupo, não a soma dos grupos', () => {
    const players = [member({ country: 'br' }), member({ country: 'br' }), member({ country: 'br' }), member({ country: 'dk' }), member({ country: 'dk' })];
    expect(powerOf(themeLines(players, null), 'theme_country')).toBe(THEME_LADDER[3]);
  });

  it('time-ano exato vale cheio e a organização vale metade; conta o melhor dos dois', () => {
    const exato = five({ teamId: 'sk-2017', org: 'sk' });
    expect(powerOf(themeLines(exato, null), 'theme_team')).toBe(THEME_LINE_CAP);
    const soOrg = [
      member({ teamId: 'astralis-2016', org: 'astralis' }), member({ teamId: 'astralis-2017', org: 'astralis' }),
      member({ teamId: 'astralis-2018', org: 'astralis' }), member({ teamId: 'astralis-2019', org: 'astralis' }),
      member({ teamId: 'astralis-2020', org: 'astralis' })
    ];
    // Cinco da mesma org em anos diferentes: 1,5 / 2 = 0,75, e não 1,5.
    expect(powerOf(themeLines(soOrg, null), 'theme_team')).toBe(THEME_LADDER[5] / 2);
    expect(themeLines(soOrg, null).find((line) => line.key === 'theme_team')?.exact).toBe(false);
  });

  it('país exato vale cheio e o bloco vale metade: a NAVI russo-ucraniana ganha pelo bloco', () => {
    const navi = [member({ country: 'ua' }), member({ country: 'ru' }), member({ country: 'ru' }), member({ country: 'ru' }), member({ country: 'ua' })];
    // Exato: 3 russos = 0,5. Bloco CIS: 5 = 1,5 / 2 = 0,75. Vale o bloco.
    expect(powerOf(themeLines(navi, null), 'theme_country')).toBe(0.75);
    expect(themeLines(navi, null).find((line) => line.key === 'theme_country')?.exact).toBe(false);
    const spirit = five({ country: 'ru' });
    expect(powerOf(themeLines(spirit, null), 'theme_country')).toBe(THEME_LINE_CAP);
    expect(themeLines(spirit, null).find((line) => line.key === 'theme_country')?.exact).toBe(true);
  });

  it('o coach é o sexto de time e ano, e fica fora de país', () => {
    const players = five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' });
    const semCoach = themeLines(players, null);
    // Sem coach a escada para em 5.
    expect(powerOf(semCoach, 'theme_team')).toBe(THEME_LADDER[5]);
    expect(powerOf(semCoach, 'theme_year')).toBe(THEME_LADDER[5]);
    // Em país a escada fecha em 5, porque o coach não entra.
    expect(powerOf(semCoach, 'theme_country')).toBe(THEME_LINE_CAP);
    const comCoach = themeLines(players, member({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }));
    expect(powerOf(comCoach, 'theme_team')).toBe(THEME_LADDER[6]);
    expect(powerOf(comCoach, 'theme_year')).toBe(THEME_LADDER[6]);
    expect(powerOf(comCoach, 'theme_country')).toBe(THEME_LINE_CAP);
  });

  it('respeita o teto por linha e o teto total', () => {
    const perfeita = five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' });
    const lines = themeLines(perfeita, member({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }));
    for (const line of lines) expect(line.power).toBeLessThanOrEqual(THEME_LINE_CAP);
    expect(lines.reduce((sum, line) => sum + line.power, 0)).toBeLessThanOrEqual(THEME_TOTAL_CAP);
    expect(lines.reduce((sum, line) => sum + line.power, 0)).toBe(THEME_TOTAL_CAP);
  });

  it('line sem tema nenhum não gera linha, e dado faltando não quebra', () => {
    const soltos = [member({ country: 'br', year: 2013 }), member({ country: 'dk', year: 2014 }), member({ country: 'cn', year: 2015 }), member({ country: 'au', year: 2016 }), member({ country: 'tr', year: 2017 })];
    expect(themeLines(soltos, null)).toEqual([]);
    expect(themeLines(five({}), null)).toEqual([]);
    expect(themeLines([], null)).toEqual([]);
  });

  it('o rótulo do tema diz em volta do que a line foi montada', () => {
    const sk = themeLines(five({ teamId: 'sk-2017', org: 'sk', year: 2017, country: 'br' }), null);
    expect(sk.find((line) => line.key === 'theme_team')).toMatchObject({ theme: 'sk-2017', count: 5, exact: true });
    expect(sk.find((line) => line.key === 'theme_country')).toMatchObject({ theme: 'br', count: 5, exact: true });
    expect(sk.find((line) => line.key === 'theme_year')).toMatchObject({ theme: '2017', count: 5 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: FAIL com "themeLines is not a function" ou erro de import.

- [ ] **Step 3: Implementar a regra**

Acrescentar ao fim de `src/lib/game/online/collection-theme.ts`:

```ts
/** How much a shared theme is worth by how many share it: the last member is worth more than the others together. */
export const THEME_LADDER: Readonly<Record<number, number>> = { 0: 0, 1: 0, 2: 0.25, 3: 0.5, 4: 1, 5: 1.5, 6: 2 };
/** Each theme line is worth at most this much power... */
export const THEME_LINE_CAP = 2;
/** ...and the three of them together at most this much. */
export const THEME_TOTAL_CAP = 6;
/** The looser level of a line (same org, same bloc) pays this share of the ladder. */
export const THEME_LOOSE_RATIO = 0.5;

/** What the rule needs from one card: the coach fills the same shape, with `country` null (it never counts for country). */
export interface ThemeMember {
  country: string | null;
  teamId: string | null;
  /** Organization of the team-year, so Astralis 2016 and Astralis 2019 recognise each other. */
  org: string | null;
  year: number | null;
}

export interface ThemeLine {
  key: 'theme_team' | 'theme_country' | 'theme_year';
  power: number;
  /** What the lineup is built around, for the builder to name it: a team-year id, a country code, a bloc or a year. */
  theme: string;
  count: number;
  /** The tight level (same team-year, same country) instead of the loose one (same org, same bloc). */
  exact: boolean;
}

/** The value shared by most members, with how many share it; null values never form a group. */
function biggestGroup<T>(values: readonly (T | null | undefined)[]): { value: T; count: number } | null {
  const counts = new Map<T, number>();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best && best.count >= 2 ? best : null;
}

const ladder = (count: number) => THEME_LADDER[Math.min(count, 6)] ?? 0;

/** The better of the two levels of a line: the tight one at full value, the loose one at THEME_LOOSE_RATIO. */
function bestLevel<T, L>(tight: readonly (T | null)[], loose: readonly (L | null)[]): { power: number; theme: string; count: number; exact: boolean } | null {
  const exact = biggestGroup(tight);
  const wide = biggestGroup(loose);
  const exactPower = exact ? ladder(exact.count) : 0;
  const widePower = wide ? ladder(wide.count) * THEME_LOOSE_RATIO : 0;
  if (exactPower >= widePower && exact) return { power: Math.min(THEME_LINE_CAP, exactPower), theme: String(exact.value), count: exact.count, exact: true };
  if (wide) return { power: Math.min(THEME_LINE_CAP, widePower), theme: String(wide.value), count: wide.count, exact: false };
  return null;
}

/**
 * The thematic lines of a lineup. The coach counts as a sixth member for team and year — it is what closes the
 * ladder — and stays out of country, where only 13% of the coach cards know their own. Lines worth nothing are
 * left out, and the total is capped at THEME_TOTAL_CAP by trimming the smallest lines last.
 */
export function themeLines(players: readonly ThemeMember[], coach: ThemeMember | null): ThemeLine[] {
  if (!players.length) return [];
  const withCoach = coach ? [...players, coach] : [...players];
  const team = bestLevel(withCoach.map((member) => member.teamId), withCoach.map((member) => member.org));
  const country = bestLevel(players.map((member) => member.country), players.map((member) => blocOf(member.country)));
  const year = bestLevel(withCoach.map((member) => (member.year == null ? null : String(member.year))), []);
  const lines: ThemeLine[] = [];
  if (team?.power) lines.push({ key: 'theme_team', ...team });
  if (country?.power) lines.push({ key: 'theme_country', ...country });
  if (year?.power) lines.push({ key: 'theme_year', ...year });
  let budget = THEME_TOTAL_CAP;
  return lines
    .sort((left, right) => right.power - left.power)
    .map((line) => {
      const power = Math.min(line.power, budget);
      budget -= power;
      return { ...line, power };
    })
    .filter((line) => line.power > 0);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/collectionTheme.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/online/collection-theme.ts tests/collectionTheme.test.ts
git commit -m "feat: regra da sinergia temática (time, país e ano) com escada e tetos"
```

---

### Task 4: Ligar o tema à sinergia da line

**Files:**
- Modify: `src/lib/game/online/collection-lineup.ts`
- Test: `tests/collectionRules.test.ts`

**Interfaces:**
- Consumes: `themeLines`, `ThemeMember` da Task 3; `playerCountryOf` de `collection-countries.ts`; `collectionTeamById` de `collection-pool.ts`; `collectionCoachById` de `collection-pool.ts`.
- Produces: `CollectionLineupInput` ganha `coachId?: string | null`; `synergyOf` passa a devolver as linhas `theme_*`; `themeOf(input): ThemeLine[]` exportado para a tela mostrar o rótulo.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `describe('lineup da coleção')` de `tests/collectionRules.test.ts`:

```ts
  it('line temática ganha bônus e line de estrelas soltas quase nada', () => {
    const sk = collectionPlayers.filter((player) => player.teamId === 'sk-2017').sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
    expect(sk).toHaveLength(5);
    const skRoles = sk.map((player) => eligibleRolesOf(player)[0]);
    const temas = synergyOf({ players: sk, roles: skRoles, starPlayerId: null }).filter((line) => line.key.startsWith('theme_'));
    // Mesmo time-ano, mesmo ano e cinco brasileiros: as três linhas no teto, somando o teto total.
    expect(temas.map((line) => line.key).sort()).toEqual(['theme_country', 'theme_team', 'theme_year']);
    expect(temas.reduce((sum, line) => sum + line.power, 0)).toBe(THEME_TOTAL_CAP);
    const soltos = ['fallen-2019', 'coldzera-2017', 's1mple-2021', 'donk-2024', 'jl-2024'].map((id) => playerById.get(id)!).filter(Boolean);
    if (soltos.length === 5) {
      const total = synergyOf({ players: soltos, roles: soltos.map((player) => eligibleRolesOf(player)[0]), starPlayerId: null })
        .filter((line) => line.key.startsWith('theme_'))
        .reduce((sum, line) => sum + line.power, 0);
      expect(total).toBeLessThan(1);
    }
  });

  it('o coach entra na contagem de time e ano da line', () => {
    const sk = collectionPlayers.filter((player) => player.teamId === 'sk-2017').sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
    const roles = sk.map((player) => eligibleRolesOf(player)[0]);
    const coach = [...collectionCoachById.values()].find((item) => item.teamId === 'sk-2017');
    expect(coach).toBeTruthy();
    const comCoach = themeOf({ players: sk, roles, starPlayerId: null, coachId: coach!.id });
    expect(comCoach.find((line) => line.key === 'theme_team')).toMatchObject({ count: 6, exact: true });
  });
```

Acrescentar aos imports do arquivo:

```ts
import { themeOf } from '../src/lib/game/online/collection-lineup';
import { THEME_TOTAL_CAP } from '../src/lib/game/online/collection-theme';
import { collectionCoachById, collectionPlayers } from '../src/lib/game/online/collection-pool';
```

(`playerById` e `eligibleRolesOf` já estão importados no arquivo; `collectionPlayers` também — conferir e não duplicar.)

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/collectionRules.test.ts`
Expected: FAIL com "themeOf is not exported" / nenhuma linha `theme_`.

- [ ] **Step 3: Implementar a ligação**

Em `src/lib/game/online/collection-lineup.ts`, acrescentar aos imports do topo:

```ts
import { collectionCoachById, collectionTeamById } from './collection-pool';
import { playerCountryOf } from './collection-countries';
import { themeLines, type ThemeLine, type ThemeMember } from './collection-theme';
```

Acrescentar `coachId` à interface de entrada (junto dos campos existentes de `CollectionLineupInput`):

```ts
  /** Coach card of the collection: it counts as the sixth member of the team and year themes. */
  coachId?: string | null;
```

Acrescentar, logo antes de `synergyOf`:

```ts
/** Organization of a team-year, so Astralis 2016 and Astralis 2019 recognise each other. */
const orgOfTeam = (teamId: string | null | undefined): string | null => {
  const name = teamId ? collectionTeamById.get(teamId)?.name : null;
  return name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') || null : null;
};

const memberOfPlayer = (player: Player): ThemeMember => ({
  country: playerCountryOf(player),
  teamId: player.teamId ?? null,
  org: orgOfTeam(player.teamId),
  year: player.year ?? null
});

/** The thematic lines of a lineup, with their labels: the builder names the theme, `synergyOf` only takes the power. */
export function themeOf(input: CollectionLineupInput): ThemeLine[] {
  const coach = input.coachId ? collectionCoachById.get(input.coachId) : undefined;
  // The coach never counts for country: only 13% of the coach cards know their own.
  const coachMember: ThemeMember | null = coach ? { country: null, teamId: coach.teamId, org: orgOfTeam(coach.teamId), year: coach.year } : null;
  return themeLines(input.players.map(memberOfPlayer), coachMember);
}
```

Dentro de `synergyOf`, logo antes do `return lines;` final:

```ts
  for (const line of themeOf(input)) add(line.key, { power: line.power });
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run tests/collectionRules.test.ts tests/collectionTheme.test.ts`
Expected: PASS nos dois arquivos.

- [ ] **Step 5: Confirmar que o type-check passa**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/online/collection-lineup.ts tests/collectionRules.test.ts
git commit -m "feat: sinergia temática entra no cálculo da line da coleção"
```

---

### Task 5: Passar o coach e mostrar as linhas na tela

**Files:**
- Modify: `src/lib/components/online/CollectionWorkspace.svelte`
- Modify: `src/lib/game/online/i18n.ts`
- Modify: `server/room-manager.ts:1335`

**Interfaces:**
- Consumes: `themeOf` e o `coachId` da Task 4.
- Produces: nada que outra task use.

- [ ] **Step 1: Passar o `coachId` em todas as chamadas do montador**

Em `src/lib/components/online/CollectionWorkspace.svelte`, as quatro chamadas que montam o input de line recebem `coachId`. A variável `coachId` já existe no componente (linha ~75). Alterar:

```svelte
  $: synergy = complete ? synergyOf({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : [];
  $: synergized = baseTeam ? applyCollectionLineup(baseTeam, { players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : null;
  $: readyStyle = styleReady({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId });
  $: effects = complete ? cardEffects({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : {};
```

E na linha do time salvo (~133), acrescentar `coachId: savedLineup.coachId` ao objeto `input`.

- [ ] **Step 2: Passar o coach no servidor**

Em `server/room-manager.ts`, na chamada de `applyCollectionLineup` (linha ~1335), acrescentar `coachId: participant.prepared.coachId` ao objeto de input, para o tema valer na partida e não só no preview:

```ts
      ? applyCollectionLineup(built, { players: selected, roles: participant.draft.lineup.map(collectionRoleOf), starPlayerId: participant.prepared.starPlayerId, style: participant.prepared.style, coachId: participant.prepared.coachId })
```

- [ ] **Step 3: Adicionar os textos nos três idiomas**

Em `src/lib/game/online/i18n.ts`, acrescentar as seis chaves a cada um dos três blocos de idioma, junto das outras `syn_*`:

pt-BR:
```ts
syn_theme_team: 'Mesmo time', syn_theme_team_org: 'Mesma organização', syn_theme_country: 'Mesmo país', syn_theme_country_bloc: 'Mesma região', syn_theme_year: 'Mesmo ano', themeCards: 'cartas',
```

en:
```ts
syn_theme_team: 'Same team', syn_theme_team_org: 'Same organization', syn_theme_country: 'Same country', syn_theme_country_bloc: 'Same region', syn_theme_year: 'Same year', themeCards: 'cards',
```

es:
```ts
syn_theme_team: 'Mismo equipo', syn_theme_team_org: 'Misma organización', syn_theme_country: 'Mismo país', syn_theme_country_bloc: 'Misma región', syn_theme_year: 'Mismo año', themeCards: 'cartas',
```

- [ ] **Step 4: Mostrar o rótulo do tema na lista de sinergia**

Em `CollectionWorkspace.svelte`, acrescentar ao bloco `<script>` (junto dos outros `$:`):

```svelte
  import { themeOf } from '$lib/game/online/collection-lineup';
  import { countryName } from '$lib/game/visuals/flags';
  $: themes = complete ? themeOf({ players: lineupPlayers, roles: lineupRoles, starPlayerId, style, coachId }) : [];
  /** "Mesmo time: SK 2017 · 5 cartas" — o nome do tema vem do dado, o rótulo do idioma. */
  const themeLabel = (key: string): string => {
    const line = themes.find((item) => item.key === key);
    if (!line) return '';
    const name = key === 'theme_country' && line.exact ? countryName(line.theme, $language) : key === 'theme_team' && line.exact ? (collectionTeamById.get(line.theme)?.name ?? line.theme) : line.theme;
    return `: ${name} · ${line.count} ${t('themeCards')}`;
  };
```

Acrescentar `collectionTeamById` ao import que já traz `collectionCoachById` de `$lib/game/online/collection-pool`.

Na lista de sinergia (linha ~498), trocar o `<span>` da linha por:

```svelte
                      <span>{line.power < 0 || line.mental < 0 || line.consistency < 0 ? '▼' : '▲'} {t(`syn_${line.key}` as Parameters<typeof t>[0])}{line.key.startsWith('theme_') ? themeLabel(line.key) : ''}</span>
```

Para o nível metade, o rótulo base muda: quando `exact` for `false`, usar a chave `_org` / `_bloc`. Ajustar `themeLabel` para devolver também a chave do rótulo, ou — mais simples e sem tocar no `<span>` duas vezes — deixar `themeLabel` devolver o texto inteiro e trocar a chamada do `t()` por:

```svelte
                      <span>{line.power < 0 || line.mental < 0 || line.consistency < 0 ? '▼' : '▲'} {themeTitle(line.key)}{line.key.startsWith('theme_') ? themeLabel(line.key) : ''}</span>
```

com:

```svelte
  const themeTitle = (key: string): string => {
    const line = themes.find((item) => item.key === key);
    if (!line) return t(`syn_${key}` as Parameters<typeof t>[0]);
    if (key === 'theme_team' && !line.exact) return t('syn_theme_team_org');
    if (key === 'theme_country' && !line.exact) return t('syn_theme_country_bloc');
    return t(`syn_${key}` as Parameters<typeof t>[0]);
  };
```

- [ ] **Step 5: Rodar o type-check e a suíte**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

Run: `docker compose -f docker-compose.dev.yml up -d && TEST_DATABASE_URL=postgres://cs13a0:cs13a0@127.0.0.1:5435/cs13a0 npx vitest run`
Expected: só `tests/onlineCollection.test.ts > grava pontos, prêmio, awards e tabela uma vez só` falhando — é uma falha que já existe na `main`, anterior a esta entrega.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/online/CollectionWorkspace.svelte src/lib/game/online/i18n.ts server/room-manager.ts
git commit -m "feat: montador e partida mostram e aplicam a sinergia temática"
```

---

### Task 6: Conferir no navegador

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o servidor e o front**

Run: `docker compose -f docker-compose.dev.yml up -d`
Run: `npm run dev` (porta 8090 é o servidor online; 8080 é o Adminer de outro projeto, não usar).

- [ ] **Step 2: Conferir na tela da coleção**

Montar uma line com 5 jogadores do mesmo time-ano e conferir que aparecem as três linhas novas, com o nome do time, do país e do ano, e a contagem de cartas. Trocar um jogador por outro de país diferente e conferir que a linha de país cai de nível ou vira "Mesma região".

- [ ] **Step 3: Conferir o total**

Conferir que o "+ Sinergia" do painel de poder sobe junto, e que uma line temática completa não passa de +6% de tema.

---

### Task 7: Commits finais e deploy

**Pré-requisito:** aprovação explícita do dono para publicar. Não executar sem isso.

- [ ] **Step 1: Commitar o que estava solto da entrega anterior**

A correção da roleta e os bônus de star/plano estão no diretório de trabalho desde antes deste plano. Commitar em dois commits separados:

```bash
git add src/lib/game/online/fair.ts server/collection/upgrader.ts server/collection/service.ts server/db/migrations.ts src/lib/game/online/collection.ts src/lib/components/online/Upgrader.svelte tests/upgrader.test.ts
git commit -m "fix: aposta só de Comuns no upgrader paga coins em vez de devolver outra Comum"

git add src/lib/game/online/collection-lineup.ts src/lib/game/online/i18n.ts src/lib/components/online/CollectionWorkspace.svelte src/lib/components/online/CollectionCardSheet.svelte src/lib/game/online/collection.ts server/http/collection-routes.ts server/http/room-routes.ts server/room-manager.ts server/collection/service.ts tests/collectionRules.test.ts
git commit -m "feat: AWPer-IGL, star em todas as funções por plano e agressivo competitivo com o tático"
```

- [ ] **Step 2: Commitar o spec e o plano**

```bash
git add docs/superpowers/specs/2026-09-20-sinergia-tematica-colecao-design.md docs/superpowers/plans/2026-09-20-sinergia-tematica-colecao.md
git commit -m "docs: design e plano da sinergia temática da coleção"
```

- [ ] **Step 3: Rodar a suíte inteira uma última vez**

Run: `TEST_DATABASE_URL=postgres://cs13a0:cs13a0@127.0.0.1:5435/cs13a0 npx vitest run`
Expected: só a falha pré-existente de `tests/onlineCollection.test.ts`.

- [ ] **Step 4: Integrar na main**

A branch atual é `feat/historical-map-pools-pro-fix`, já no topo da `main`. Confirmar e fazer o merge:

```bash
git fetch origin
git log --oneline origin/main -1
git checkout main && git merge --ff-only feat/historical-map-pools-pro-fix
```

- [ ] **Step 5: Publicar o front**

```bash
git push origin main
```

Isso dispara o deploy da Vercel.

- [ ] **Step 6: Publicar o servidor**

O push na main **não** sobe o servidor. A correção da roleta é regra de servidor e depende da migração 24, que roda no boot:

```bash
railway up
```

- [ ] **Step 7: Conferir em produção**

Conferir no ar: apostar uma Comum no upgrader e verificar que a derrota paga coins e não devolve carta; abrir o montador e verificar que as linhas de tema aparecem.

---

## Auto-revisão

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| Escada 2/3/4/5/6 | 3 |
| Três linhas com teto de 2% e total de 6% | 3 |
| Maior grupo vence | 3 |
| Time-ano cheio, org metade, melhor dos dois | 3 |
| País exato cheio, bloco metade | 2 e 3 |
| Blocos cobrindo os 52 países | 2 |
| Coach como 6º em time/ano, fora de país | 3 e 4 |
| Coach mantém `coachAffinity` | nenhuma mudança — segue intacta |
| 15 países preenchidos | 1 |
| Guarda do catálogo | nada a fazer (Task 1 confirma que segue verde) |
| `collection-theme.ts` com a regra pura | 2 e 3 |
| Integração em `synergyOf` | 4 |
| Tema valendo na partida, não só no preview | 5 (Step 2) |
| i18n pt/en/es | 5 |
| Testes novos | 1, 2, 3, 4 |

**Consistência de tipos:** `ThemeMember` e `ThemeLine` são definidos na Task 3 e consumidos com os mesmos nomes na Task 4. `themeOf` é exportado na Task 4 e usado na Task 5. `blocOf` vem da Task 2 e é usado na Task 3. `THEME_TOTAL_CAP` aparece nas Tasks 3 e 4 com o mesmo nome.

**Fora de escopo, registrado:** o travamento de `MAX_TEAM_POWER` em 106 e o teto de 100 continuam em aberto e não entram em nenhuma task.

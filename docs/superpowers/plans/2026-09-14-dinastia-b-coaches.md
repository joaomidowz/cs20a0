# Dinastia B: dataset de coaches, validação do dataset e coach no draft — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar um coach real a cada um dos 286 times, validar o dataset de jogadores, times e coaches no gate do jogo e, no modo Dinastia, escolher um coach depois da 5ª escolha, com efeito no poder, na pausa tática, no lado T e na química.

**Architecture:** O studio (`cs13a0-management`, worktree `../cs13a0-studio-coaches`, branch `feat/coaches-dataset`) gera `coaches.game.json` a partir dos cards de time das páginas de Major na Liquipedia, com funções puras testadas por `node --test`. O jogo copia o arquivo, valida o dataset num teste de integridade, aplica o coach só na organização do usuário na Dinastia (campos opcionais em `CombatTeam`, sem efeito quando ausentes) e ganha a fase `coach-draft`.

**Tech Stack:** Studio: Node 24, ES modules `.mjs`, `node:test`. Jogo: SvelteKit estático, Svelte 5 em modo legado (`export let`, `$:`), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (seções "Coach", "Dataset de coaches" e "Validação do dataset").

## Global Constraints

- Idioma: docs, textos de UI e mensagens de commit em pt-BR; identificadores em inglês. Commits `feat: assunto em pt-BR` (jogo) e `feat: ...`/`chore: ...` (studio), sem escopo e sem gitmoji, terminados com as linhas:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM`
- Nunca fazer push em nenhum dos dois repositórios.
- Studio: trabalhar só em `/home/itcenterai/worktree/worktree-pessoal/cs13a0-studio-coaches`. Nunca trocar o branch do checkout `/home/itcenterai/worktree/worktree-pessoal/cs13a0-management`.
- Jogo: gate `npm run validate`. `tests/normalRunGolden.test.ts` passa sem reescrever o snapshot (nunca rodar vitest com `-u`). Normal, Ranked, PRO, Sandbox e online não mudam: todo efeito de coach depende de `coach` ser passado explicitamente, e isso só acontece na Dinastia.
- Liquipedia: no máximo 1 requisição a cada 2 s, sempre pelo `LiquipediaApiClient` do studio (ele respeita o limite e grava cache). Só as três páginas que faltam vão à rede; todo o resto sai do cache.
- Coaches: um por time (286). Nome público do coach é o único dado de pessoa. Coach `placeholder` nunca entra nas ofertas do draft.
- Dataset de jogadores e times não muda nesta entrega. Achados de dados vão para o relato, não para edição.

## Estrutura de arquivos

| Repositório | Arquivo | Responsabilidade |
|---|---|---|
| studio | `scripts/lib/coaches.mjs` | Funções puras: páginas de Major, extração de cards, limpeza de nome, chave de organização, escolha do coach, atributos, montagem do dataset. |
| studio | `scripts/lib/coaches.test.mjs` | Testes `node:test` das funções puras. |
| studio | `scripts/build-coaches.mjs` | Lê páginas (cache + rede para as faltantes), times e jogadores; grava `data/workspace/coaches.game.json` e `data/reports/coaches-report.json`. |
| studio | `data/config/coach-overrides.json` | Correções com fonte (EG 2019 herda o coach da NRG no Berlin Major). |
| studio | `data/config.json`, `package.json` | Caminho do jogo corrigido; scripts `build:coaches` e `test:coaches`. |
| jogo | `src/lib/data/cs/coaches.game.json` | Cópia do dataset gerado. |
| jogo | `src/lib/data/csData.ts`, `src/lib/game/data.ts`, `package.json` | Carregar coaches; `data:pull` com o caminho real do studio. |
| jogo | `src/lib/game/types.ts` | `Coach`, `CoachConfidence`, campos de coach em `CombatTeam`, `coachRerollsUsed` na dinastia, fase `coach-draft`. |
| jogo | `tests/datasetIntegrity.test.ts` | Validação de jogadores, times e coaches. |
| jogo | `src/lib/game/dynasty/coach.ts`, `src/lib/game/dynasty/coachOffer.ts` | Efeito do coach (puro) e ofertas do draft (seeded). |
| jogo | `src/lib/game/dynasty/state.ts` | `coachRerollsUsed` no estado. |
| jogo | `src/lib/game/simulation.ts`, `src/lib/game/rounds.ts`, `src/lib/game/campaign-major.ts` | Aplicar o coach no time do usuário; lado e pausa tática lendo os campos opcionais. |
| jogo | `src/lib/components/CoachDraft.svelte`, `src/lib/components/DynastyHeader.svelte`, `src/routes/+page.svelte`, `src/lib/game/store.ts`, `src/lib/game/i18n.ts` | Fase de escolha, cabeçalho, poder com coach, textos. |

---

### Task 1: Dataset de coaches no studio

**Files:**
- Create: `scripts/lib/coaches.mjs`, `scripts/lib/coaches.test.mjs`, `scripts/build-coaches.mjs`, `data/config/coach-overrides.json`
- Create (gerados): `data/workspace/coaches.game.json`, `data/reports/coaches-report.json`, três arquivos novos em `data/experiments/liquipedia-playoffs-importer/cache/`
- Modify: `package.json` (scripts), `data/config.json` (`mainRepoDataPath`)

Todos os caminhos relativos a `/home/itcenterai/worktree/worktree-pessoal/cs13a0-studio-coaches`.

**Interfaces:**
- Consumes: `LiquipediaApiClient` de `scripts/experiments/liquipedia-api-client.mjs` (`new LiquipediaApiClient({ cacheDir })`, `await client.getPageWikitext(title)` → `{ title, missing, wikitext }`, `client.requests` com `{ url, cache, status }`); `data/workspace/teams.game.json` e `players.game.json` (286 e 1430 itens).
- Produces: `data/workspace/coaches.game.json`, um objeto por time, ordenado por `teamId`, no formato `Coach` da Task 2.

- [ ] **Step 1: Testes das funções puras**

```js
// scripts/lib/coaches.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoaches, cleanCoachName, deriveAttributes, extractTeamCards, orgKey, pickCoach, slug } from './coaches.mjs';

test('extrai cards de time com template aninhado e ignora cards vazios', () => {
  const text = '{{TeamCard|team=Astralis|c=zonic|notes={{Abbr|x|y}}}}\n{{TeamCard|team=|c=}}\n{{TeamCard\n|team=FaZe Clan\n|coach=RobbaN\n}}';
  assert.deepEqual(extractTeamCards(text), [{ team: 'Astralis', coach: 'zonic' }, { team: 'FaZe Clan', coach: 'RobbaN' }]);
});

test('limpa nome de coach com comentário e link de wiki', () => {
  assert.equal(cleanCoachName('<!--confirmar--> zonic '), 'zonic');
  assert.equal(cleanCoachName('[[Zeus (Ukrainian player)|Zeus]]'), 'Zeus');
  assert.equal(cleanCoachName('[[kassad]]'), 'kassad');
  assert.equal(cleanCoachName('<!-- só comentário -->'), '');
  assert.equal(slug('André Akkari'), 'andre-akkari');
});

test('normaliza nome de organização com apelidos', () => {
  assert.equal(orgKey('Team Vitality'), 'vitality');
  assert.equal(orgKey('MOUZ'), 'mousesports');
  assert.equal(orgKey('FURIA Esports'), 'furia');
  assert.equal(orgKey('Ninjas in Pyjamas'), 'ninjasinpyjamas');
  assert.equal(orgKey('Counter Logic Gaming'), 'clg');
});

const index = new Map([
  ['astralis', new Map([[2018, [{ coach: 'zonic', order: 1, page: 'ELEAGUE/2018/Major' }, { coach: 'zonic', order: 2, page: 'FACEIT/2018/Major' }]]])],
  ['liquid', new Map([[2016, [{ coach: 'GBJame^s', order: 1, page: 'MLG/2016/Columbus' }, { coach: 'peacemaker', order: 2, page: 'ESL/One/2016/Cologne' }]]])],
  ['big', new Map([[2021, [{ coach: 'LEGIJA', order: 1, page: 'PGL/2021/Stockholm' }]]])]
]);

test('escolhe coach do próprio ano, do Major mais tardio e com confiança', () => {
  assert.deepEqual(pickCoach({ id: 'astralis-2018', name: 'Astralis', year: 2018 }, index, []), { name: 'zonic', confidence: 'high', page: 'FACEIT/2018/Major', year: 2018, note: 'Card do próprio ano.' });
  assert.equal(pickCoach({ id: 'liquid-2016', name: 'Team Liquid', year: 2016 }, index, []).name, 'peacemaker');
  assert.equal(pickCoach({ id: 'liquid-2016', name: 'Team Liquid', year: 2016 }, index, []).confidence, 'medium');
});

test('usa ano vizinho, override e placeholder nessa ordem', () => {
  const neighbor = pickCoach({ id: 'big-2020', name: 'BIG', year: 2020 }, index, []);
  assert.deepEqual([neighbor.name, neighbor.confidence, neighbor.year], ['LEGIJA', 'low', 2021]);
  const override = pickCoach({ id: 'evil-geniuses-2019', name: 'Evil Geniuses', year: 2019 }, index, [{ teamId: 'evil-geniuses-2019', name: 'ImAPet', page: 'StarLadder/2019/Major', note: 'Herdado da NRG.' }]);
  assert.deepEqual([override.name, override.confidence, override.page], ['ImAPet', 'medium', 'StarLadder/2019/Major']);
  const none = pickCoach({ id: 'monte-2023', name: 'Monte', year: 2023 }, index, []);
  assert.equal(none.confidence, 'placeholder');
  assert.equal(none.name, 'Coaching staff');
});

test('deriva atributos em 40..99 e desenvolvimento pela versão do ano seguinte', () => {
  const team = { id: 't-2018', year: 2018, players: ['a-2018', 'b-2018'], teamStats: { tactics: 90, mapPool: 80, mental: 100, consistency: 98 }, majorSummary: { titles: 1 } };
  const players = [
    { id: 'a-2018', baseId: 'a', year: 2018, overall: 80, entry: 90, firepower: 88 },
    { id: 'b-2018', baseId: 'b', year: 2018, overall: 90, entry: 20, firepower: 30 },
    { id: 'a-2019', baseId: 'a', year: 2019, overall: 86, entry: 90, firepower: 88 }
  ];
  const attributes = deriveAttributes(team, players);
  assert.deepEqual(attributes, { tactics: 85, discipline: 99, aggression: 57, development: 99, overall: 85, rarity: 'legend' });
  const noNext = deriveAttributes({ ...team, players: ['b-2018'], teamStats: {}, majorSummary: {} }, players);
  assert.equal(noNext.development, 70);
  assert.equal(noNext.tactics, 70);
  assert.equal(noNext.rarity, 'common');
  assert.ok(noNext.aggression >= 40);
});

test('monta um coach por time com id e baseId estáveis', () => {
  const teams = [{ id: 'astralis-2018', name: 'Astralis', year: 2018, game: 'CSGO', players: [], teamStats: {}, majorSummary: {} }, { id: 'monte-2023', name: 'Monte', year: 2023, game: 'CS2', players: [], teamStats: {}, majorSummary: {} }];
  const coaches = buildCoaches({ teams, players: [], index, overrides: [] });
  assert.equal(coaches.length, 2);
  assert.deepEqual(coaches.map((coach) => [coach.id, coach.baseId, coach.needsReview]), [['coach-astralis-2018', 'zonic', false], ['coach-monte-2023', 'staff', true]]);
  assert.equal(coaches[0].source.url, 'https://liquipedia.net/counterstrike/FACEIT/2018/Major');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test scripts/lib/coaches.test.mjs`
Expected: FAIL, `Cannot find module .../scripts/lib/coaches.mjs`.

- [ ] **Step 3: Implementar as funções puras**

```js
// scripts/lib/coaches.mjs
/** Major pages whose TeamCards list each team's coach. `order` ranks the two Majors of a year (later = closer to the December ranking). */
export const MAJOR_PAGES = [
  { title: 'MLG/2016/Columbus', year: 2016, order: 1 },
  { title: 'ESL/One/2016/Cologne', year: 2016, order: 2 },
  { title: 'ELEAGUE/2017/Major', year: 2017, order: 1 },
  { title: 'PGL/2017/Krakow', year: 2017, order: 2 },
  { title: 'ELEAGUE/2018/Major', year: 2018, order: 1 },
  { title: 'FACEIT/2018/Major', year: 2018, order: 2 },
  { title: 'Intel Extreme Masters/Season XIII/World Championship', year: 2019, order: 1 },
  { title: 'StarLadder/2019/Major', year: 2019, order: 2 },
  { title: 'PGL/2021/Stockholm', year: 2021, order: 1 },
  { title: 'PGL/2022/Antwerp', year: 2022, order: 1 },
  { title: 'Intel Extreme Masters/2022/Rio', year: 2022, order: 2 },
  { title: 'BLAST/Major/2023/Paris', year: 2023, order: 1 },
  { title: 'PGL/2024/Copenhagen', year: 2024, order: 1 },
  { title: 'Perfect World/Major/2024/Shanghai', year: 2024, order: 2 },
  { title: 'BLAST/Major/2025/Austin', year: 2025, order: 1 },
  { title: 'StarLadder/2025/Major', year: 2025, order: 2 },
  { title: 'Intel Extreme Masters/2026/Cologne', year: 2026, order: 1 }
];

export const PLACEHOLDER_NAME = 'Coaching staff';
const ORG_ALIASES = { mouz: 'mousesports', counterlogic: 'clg', teamenvyus: 'envyus', nip: 'ninjasinpyjamas', navi: 'natusvincere', flipsid3tactics: 'flipsid3', opticgaming: 'optic', vp: 'virtuspro' };

export const slug = (value = '') => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function orgKey(name = '') {
  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(team|esports|gaming|clan|e-sports|esport)\b/g, '').replace(/[^a-z0-9]/g, '');
  return ORG_ALIASES[key] ?? key;
}

export function cleanCoachName(raw = '') {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .trim();
}

/** Top-level `{{TeamCard ...}}` bodies with their team and first coach; nested templates never cut a card short. */
export function extractTeamCards(text = '') {
  const cards = [];
  let from = 0;
  while ((from = text.indexOf('{{TeamCard', from)) !== -1) {
    let depth = 0;
    let end = text.length;
    for (let index = from; index < text.length - 1; index += 1) {
      const pair = text.slice(index, index + 2);
      if (pair === '{{') { depth += 1; index += 1; }
      else if (pair === '}}') { depth -= 1; index += 1; if (depth === 0) { end = index + 1; break; } }
    }
    const body = text.slice(from, end);
    from = end;
    const field = (key) => body.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|}\\n]*)`, 'i'))?.[1] ?? '';
    const team = field('team').trim();
    const coach = cleanCoachName(field('c') || field('coach') || field('c1'));
    if (team && coach) cards.push({ team, coach });
  }
  return cards;
}

/** orgKey → year → [{ coach, order, page }] from every Major page. */
export function buildCoachIndex(pages) {
  const index = new Map();
  for (const page of pages) {
    for (const card of extractTeamCards(page.wikitext)) {
      const key = orgKey(card.team);
      if (!index.has(key)) index.set(key, new Map());
      const years = index.get(key);
      if (!years.has(page.year)) years.set(page.year, []);
      years.get(page.year).push({ coach: card.coach, order: page.order, page: page.title });
    }
  }
  return index;
}

const latest = (entries) => [...entries].sort((left, right) => right.order - left.order)[0];

export function pickCoach(team, index, overrides) {
  const override = overrides.find((item) => item.teamId === team.id);
  if (override) return { name: override.name, confidence: 'medium', page: override.page ?? null, year: team.year, note: override.note };
  const years = index.get(orgKey(team.name)) ?? index.get(orgKey(team.id.replace(/-\d{4}$/, '')));
  const same = years?.get(team.year);
  if (same?.length) {
    const chosen = latest(same);
    const changed = new Set(same.map((entry) => slug(entry.coach))).size > 1;
    return { name: chosen.coach, confidence: changed ? 'medium' : 'high', page: chosen.page, year: team.year, note: changed ? 'Coach trocou entre os Majors do ano; vale o do Major mais tardio.' : 'Card do próprio ano.' };
  }
  if (years) {
    const nearest = [...years.keys()].filter((year) => Math.abs(year - team.year) === 1).sort((left, right) => right - left)[0];
    if (nearest) {
      const chosen = latest(years.get(nearest));
      return { name: chosen.coach, confidence: 'low', page: chosen.page, year: nearest, note: `Card da mesma organização em ${nearest}; confirmar.` };
    }
  }
  return { name: PLACEHOLDER_NAME, confidence: 'placeholder', page: null, year: null, note: 'Sem registro de coach nas páginas de Major.' };
}

const clamp = (value) => Math.max(40, Math.min(99, Math.round(value)));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function deriveAttributes(team, players) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const roster = (team.players ?? []).map((id) => byId.get(id)).filter(Boolean);
  const stats = team.teamStats ?? {};
  const pair = (left, right) => (typeof left === 'number' && typeof right === 'number' ? (left + right) / 2 : 70);
  const tactics = clamp(pair(stats.tactics, stats.mapPool));
  const discipline = clamp(pair(stats.mental, stats.consistency));
  const aggression = clamp(roster.length ? mean(roster.map((player) => ((player.entry ?? 70) + (player.firepower ?? 70)) / 2)) : 70);
  const deltas = roster.flatMap((player) => {
    const next = players.filter((candidate) => candidate.baseId === player.baseId && candidate.year === player.year + 1);
    return next.length ? [mean(next.map((candidate) => candidate.overall)) - player.overall] : [];
  });
  const development = deltas.length ? clamp(50 + ((Math.max(-6, Math.min(6, mean(deltas))) + 6) / 12) * 49) : 70;
  const summary = team.majorSummary ?? {};
  const rarity = (summary.titles ?? 0) > 0 ? 'legend' : (summary.finals ?? 0) > 0 || (summary.semifinals ?? 0) > 0 ? 'elite' : (summary.top8 ?? 0) > 0 ? 'rare' : 'common';
  return { tactics, discipline, aggression, development, overall: Math.round((tactics + discipline + aggression + development) / 4), rarity };
}

export function buildCoaches({ teams, players, index, overrides }) {
  return [...teams]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((team) => {
      const pick = pickCoach(team, index, overrides);
      const placeholder = pick.confidence === 'placeholder';
      return {
        id: `coach-${team.id}`,
        baseId: placeholder ? 'staff' : slug(pick.name),
        name: pick.name,
        teamId: team.id,
        year: team.year,
        game: team.game ?? null,
        ...deriveAttributes(team, players),
        confidence: pick.confidence,
        needsReview: pick.confidence === 'low' || placeholder,
        source: { page: pick.page, url: pick.page ? `https://liquipedia.net/counterstrike/${pick.page.replaceAll(' ', '_')}` : null, year: pick.year, note: pick.note }
      };
    });
}
```

Observação sobre o teste de atributos: para o time do Step 1, tática = (90+80)/2 = 85; disciplina = (100+98)/2 = 99; agressão = média de (90+88)/2 = 89 e (20+30)/2 = 25 → 57; desenvolvimento: só `a` tem versão seguinte, delta +6 → 50 + 12/12·49 = 99; overall = round((85+99+57+99)/4) = 85; `titles: 1` → `legend`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test scripts/lib/coaches.test.mjs`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Override com fonte**

```json
[
  {
    "teamId": "evil-geniuses-2019",
    "name": "ImAPet",
    "page": "StarLadder/2019/Major",
    "note": "A EG de 2019 herdou o elenco e o coach da NRG, que disputou o StarLadder Berlin Major 2019 com ImAPet."
  }
]
```

Salvar em `data/config/coach-overrides.json`.

- [ ] **Step 6: Script de build**

```js
// scripts/build-coaches.mjs
import fs from 'node:fs';
import path from 'node:path';
import { LiquipediaApiClient } from './experiments/liquipedia-api-client.mjs';
import { buildCoachIndex, buildCoaches, MAJOR_PAGES } from './lib/coaches.mjs';

const ROOT = process.cwd();
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const teams = read('data/workspace/teams.game.json');
const players = read('data/workspace/players.game.json');
const overrides = read('data/config/coach-overrides.json');

const client = new LiquipediaApiClient({ cacheDir: path.join(ROOT, 'data/experiments/liquipedia-playoffs-importer/cache') });
const pages = [];
for (const major of MAJOR_PAGES) {
  const page = await client.getPageWikitext(major.title);
  if (page.missing || !page.wikitext) throw new Error(`Página de Major ausente na Liquipedia: ${major.title}`);
  pages.push({ ...major, wikitext: page.wikitext });
}

const coaches = buildCoaches({ teams, players, index: buildCoachIndex(pages), overrides });
if (coaches.length !== teams.length) throw new Error(`Esperava ${teams.length} coaches, gerou ${coaches.length}`);

const byConfidence = coaches.reduce((acc, coach) => ({ ...acc, [coach.confidence]: (acc[coach.confidence] ?? 0) + 1 }), {});
const report = {
  generatedAt: new Date().toISOString(),
  teams: teams.length,
  coaches: coaches.length,
  byConfidence,
  networkRequests: client.requests.filter((request) => !request.cache).map((request) => request.url),
  review: coaches.filter((coach) => coach.needsReview || coach.confidence === 'medium').map((coach) => ({ teamId: coach.teamId, name: coach.name, confidence: coach.confidence, note: coach.source.note }))
};

fs.writeFileSync(path.join(ROOT, 'data/workspace/coaches.game.json'), `${JSON.stringify(coaches, null, 2)}\n`);
fs.mkdirSync(path.join(ROOT, 'data/reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/reports/coaches-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`coaches: ${coaches.length} ${JSON.stringify(byConfidence)} | requisições de rede: ${report.networkRequests.length}`);
```

- [ ] **Step 7: Scripts e caminho do jogo**

Em `package.json`, dentro de `"scripts"`, acrescentar depois de `"experiment:hltv-rosters"`:

```json
    "build:coaches": "node scripts/build-coaches.mjs",
    "test:coaches": "node --test scripts/lib/coaches.test.mjs"
```

Em `data/config.json`, trocar `"../cs-20a0/src/lib/data/cs"` por `"../cs20a0/src/lib/data/cs"`.

- [ ] **Step 8: Gerar o dataset**

Run: `npm run build:coaches`
Expected: a primeira execução leva ~6 s (três páginas pela rede, 2 s de intervalo) e imprime `coaches: 286 {"high":...,"medium":...,"low":19,"placeholder":4} | requisições de rede: 3`. A soma de `high` + `medium` é 263 (262 cards do próprio ano + o override). Rodar de novo: mesma contagem e `requisições de rede: 0`.

Se `low` ou `placeholder` vierem diferentes, abrir `data/reports/coaches-report.json` e comparar com a tabela da spec antes de continuar; não ajuste o código para acertar números sem entender a diferença.

- [ ] **Step 9: Conferência rápida do resultado**

Run:
```bash
node -e "const c=require('./data/workspace/coaches.game.json');const g=id=>c.find(x=>x.teamId===id);for(const id of ['astralis-2018','vitality-2025','evil-geniuses-2019','monte-2023','big-2020'])console.log(id,g(id).name,g(id).confidence,g(id).overall,g(id).rarity);"
```
Expected: `astralis-2018 zonic high`, `vitality-2025 XTQZZZ high`, `evil-geniuses-2019 ImAPet medium`, `monte-2023 Coaching staff placeholder`, `big-2020 LEGIJA low`.

- [ ] **Step 10: Commit no studio**

```bash
git add scripts/lib/coaches.mjs scripts/lib/coaches.test.mjs scripts/build-coaches.mjs data/config/coach-overrides.json data/config.json package.json data/workspace/coaches.game.json data/reports/coaches-report.json data/experiments/liquipedia-playoffs-importer/cache
git commit -m "feat: dataset de coaches com um coach por time a partir das páginas de Major

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 2: Coaches no jogo e validação do dataset

**Files:**
- Create: `src/lib/data/cs/coaches.game.json` (cópia), `tests/datasetIntegrity.test.ts`
- Modify: `src/lib/game/types.ts` (tipo `Coach`), `src/lib/data/csData.ts`, `src/lib/game/data.ts`, `package.json` (`data:pull`)

**Interfaces:**
- Consumes: `data/workspace/coaches.game.json` da Task 1.
- Produces: `CoachConfidence`, `Coach` em `types.ts`; `getAllCoaches()`, `getCoachByTeamId(teamId)` em `csData.ts`; `coaches`, `coachById`, `coachByTeamId` exportados de `src/lib/game/data.ts`.

- [ ] **Step 1: Copiar o dataset e corrigir o `data:pull`**

Run: `cp /home/itcenterai/worktree/worktree-pessoal/cs13a0-studio-coaches/data/workspace/coaches.game.json src/lib/data/cs/coaches.game.json`

Em `package.json` trocar o script `data:pull` por:

```json
    "data:pull": "cp ../cs13a0-management/data/workspace/players.game.json ../cs13a0-management/data/workspace/teams.game.json ../cs13a0-management/data/workspace/coaches.game.json src/lib/data/cs/"
```

- [ ] **Step 2: Tipo `Coach` em `src/lib/game/types.ts`**

Logo depois de `export interface HistoricalTeam { ... }`:

```ts
export type CoachConfidence = 'high' | 'medium' | 'low' | 'placeholder';

/** Head coach of one historical team-year (one per team). `placeholder` fills teams with no known coach and is never offered in the draft. */
export interface Coach {
  id: string;
  baseId: string;
  name: string;
  teamId: string;
  year: number;
  game: string | null;
  tactics: number;
  discipline: number;
  aggression: number;
  development: number;
  overall: number;
  rarity: string;
  confidence: CoachConfidence;
  needsReview: boolean;
  source: { page: string | null; url: string | null; year: number | null; note: string };
}
```

- [ ] **Step 3: Carregar os coaches**

Em `src/lib/data/csData.ts`, acrescentar ao topo `import coaches from '$lib/data/cs/coaches.game.json';`, trocar o import de tipos por `import type { Coach, HistoricalTeam, Player } from '$lib/game/types';` e acrescentar ao fim:

```ts
const allCoaches = coaches as Coach[];
const coachByTeamId = new Map(allCoaches.map((coach) => [coach.teamId, coach]));

export function getAllCoaches() {
  return allCoaches;
}

export function getCoachByTeamId(teamId: string) {
  return coachByTeamId.get(teamId);
}
```

Em `src/lib/game/data.ts`, acrescentar `getAllCoaches` ao import vindo de `$lib/data/csData` e, depois de `export const teamById = ...`:

```ts
export const coaches = getAllCoaches();
export const coachById = new Map(coaches.map((coach) => [coach.id, coach]));
export const coachByTeamId = new Map(coaches.map((coach) => [coach.teamId, coach]));
```

- [ ] **Step 4: Teste de integridade**

```ts
// tests/datasetIntegrity.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, players, teams } from '../src/lib/game/data';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';

const ATTRIBUTES = ['overall', 'firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'] as const;
const RARITIES = new Set(['common', 'rare', 'elite', 'legend', 'superstar', 'goat']);
const TIERS = new Set(['underdog', 'dangerous-underdog', 'playoff-team', 'contender', 'finalist', 'champion', 'S', 'S+']);
const SLOTS = new Set(['awper', 'igl', 'entry', 'lurker', 'rifler', 'support']);
const COACH_ATTRIBUTES = ['tactics', 'discipline', 'aggression', 'development', 'overall'] as const;
const inRange = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const playerById = new Map(players.map((player) => [player.id, player]));
const teamById = new Map(teams.map((team) => [team.id, team]));

describe('integridade do dataset', () => {
  it('jogadores e times têm ids únicos', () => {
    expect(new Set(players.map((player) => player.id)).size).toBe(players.length);
    expect(new Set(teams.map((team) => team.id)).size).toBe(teams.length);
  });

  it('todo jogador tem atributos inteiros em 1..99, raridade e posições válidas', () => {
    const problems = players.flatMap((player) => [
      ...ATTRIBUTES.filter((key) => !inRange(player[key], 1, 99)).map((key) => `${player.id}.${key}=${player[key]}`),
      ...(RARITIES.has(player.rarity ?? '') ? [] : [`${player.id}.rarity=${player.rarity}`]),
      ...(player.baseId && player.nickname ? [] : [`${player.id} sem baseId ou nickname`]),
      ...getEligibleSlotRoles(player).filter((role) => !SLOTS.has(role)).map((role) => `${player.id} posição ${role}`)
    ]);
    expect(problems).toEqual([]);
  });

  it('todo jogador pertence ao próprio time, no mesmo ano', () => {
    const problems = players.flatMap((player) => {
      const team = player.teamId ? teamById.get(player.teamId) : undefined;
      if (!team) return [`${player.id} sem time ${player.teamId}`];
      return [
        ...(team.year === player.year ? [] : [`${player.id} ano ${player.year} ≠ time ${team.year}`]),
        ...((team.players ?? []).includes(player.id) ? [] : [`${player.id} fora da lista de ${team.id}`])
      ];
    });
    expect(problems).toEqual([]);
  });

  it('todo time tem 5 jogadores existentes e distintos, tier e estatísticas válidos', () => {
    const problems = teams.flatMap((team) => {
      const roster = team.players ?? [];
      const baseIds = new Set(roster.map((id) => playerById.get(id)?.baseId));
      return [
        ...(roster.length === 5 ? [] : [`${team.id} com ${roster.length} jogadores`]),
        ...roster.filter((id) => !playerById.has(id)).map((id) => `${team.id} → ${id} inexistente`),
        ...(baseIds.size === roster.length ? [] : [`${team.id} com jogador repetido`]),
        ...(TIERS.has(team.tier ?? '') ? [] : [`${team.id}.tier=${team.tier}`]),
        ...Object.entries(team.teamStats ?? {}).filter(([, value]) => !inRange(value, 1, 99)).map(([key, value]) => `${team.id}.teamStats.${key}=${value}`)
      ];
    });
    expect(problems).toEqual([]);
  });

  it('todo time tem exatamente um coach com atributos em 40..99', () => {
    expect(coaches).toHaveLength(teams.length);
    expect(new Set(coaches.map((coach) => coach.teamId)).size).toBe(teams.length);
    const problems = coaches.flatMap((coach) => [
      ...(teamById.has(coach.teamId) ? [] : [`${coach.id} → time inexistente`]),
      ...(coach.id === `coach-${coach.teamId}` ? [] : [`${coach.id} id fora do padrão`]),
      ...COACH_ATTRIBUTES.filter((key) => !inRange(coach[key], 40, 99)).map((key) => `${coach.id}.${key}=${coach[key]}`),
      ...(coach.overall === Math.round((coach.tactics + coach.discipline + coach.aggression + coach.development) / 4) ? [] : [`${coach.id} overall incoerente`]),
      ...(coach.year === teamById.get(coach.teamId)?.year ? [] : [`${coach.id} ano ≠ time`]),
      ...((coach.confidence === 'low' || coach.confidence === 'placeholder') && !coach.needsReview ? [`${coach.id} sem needsReview`] : [])
    ]);
    expect(problems).toEqual([]);
  });

  it('o sorteio de coaches tem pessoas reais suficientes', () => {
    const draftable = coaches.filter((coach) => coach.confidence !== 'placeholder');
    expect(draftable.length).toBeGreaterThanOrEqual(270);
    expect(new Set(draftable.map((coach) => coach.baseId)).size).toBeGreaterThanOrEqual(80);
    expect(draftable.filter((coach) => coach.overall >= 80).length).toBeGreaterThanOrEqual(20);
  });
});
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/datasetIntegrity.test.ts`
Expected: `6 passed`. Se "o sorteio tem pessoas reais suficientes" falhar só no mínimo de 80 pessoas distintas ou 20 coaches com overall ≥ 80, rodar `node -e "const c=require('./src/lib/data/cs/coaches.game.json').filter(x=>x.confidence!=='placeholder');console.log(new Set(c.map(x=>x.baseId)).size, c.filter(x=>x.overall>=80).length)"`, reportar os números e baixar o limite para o valor medido arredondado para baixo à dezena. Qualquer outro teste falhando é dado errado: pare e relate.

- [ ] **Step 6: Typecheck e build do servidor**

Run: `npm run check && npm run server:build`
Expected: `0 ERRORS 0 WARNINGS` e `dist-server/index.cjs` gerado.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/cs/coaches.game.json src/lib/game/types.ts src/lib/data/csData.ts src/lib/game/data.ts package.json tests/datasetIntegrity.test.ts
git commit -m "feat: coaches dos 286 times no jogo e teste de integridade do dataset

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 3: Efeito do coach, ofertas do draft e estado

**Files:**
- Create: `src/lib/game/dynasty/coach.ts`, `src/lib/game/dynasty/coachOffer.ts`, `tests/dynastyCoach.test.ts`
- Modify: `src/lib/game/types.ts` (`CombatTeam`, `DynastyState`), `src/lib/game/dynasty/state.ts`, `tests/dynastyState.test.ts` (só acrescentar asserção)

**Interfaces:**
- Consumes: `Coach` (Task 2); `createSeededRng` de `src/lib/game/simulation.ts`.
- Produces: `CombatTeam.coachId?`, `CombatTeam.coachSidePreference?`, `CombatTeam.timeoutFactor?`; `DynastyState.coachRerollsUsed: number`; em `coach.ts`: `COACH_REROLLS = 1`, `isDraftableCoach(coach)`, `coachAffinity(coach, players, teams): number`, `applyCoachToTeam(team, coach, affinity = 0): CombatTeam`; em `coachOffer.ts`: `COACH_OFFER_SIZE = 3`, `offerCoaches(coaches, seed, usedTeamIds, rerollsUsed = 0): Coach[]`.

- [ ] **Step 1: Tipos**

Em `CombatTeam` (`types.ts`), acrescentar depois de `consistency?: number;`:

```ts
  /** Dinastia: coach of the user's organization. Absent everywhere else. */
  coachId?: string;
  /** CT preference the coach adds to the side bias (negative favours the T side). */
  coachSidePreference?: number;
  /** Multiplier of this team's tactical timeout edge. */
  timeoutFactor?: number;
```

Em `DynastyState`, depois de `coachId: string | null;`:

```ts
  /** Coach offers redrawn in the current coach draft (one allowed). */
  coachRerollsUsed: number;
```

- [ ] **Step 2: Estado**

Em `src/lib/game/dynasty/state.ts`: em `createDynastyState` acrescentar `coachRerollsUsed: 0,` depois de `coachId: null,`; em `ensureDynastyState` acrescentar `coachRerollsUsed: positiveInt(raw.coachRerollsUsed, 0, 0),` depois da linha de `coachId`.

Em `tests/dynastyState.test.ts`, no teste "começa no Stage 1 como Challenger, sem caixa", acrescentar `coachRerollsUsed: 0` ao objeto de `toMatchObject`.

- [ ] **Step 3: Teste que falha**

```ts
// tests/dynastyCoach.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, getTeamPlayers, teams } from '../src/lib/game/data';
import { applyCoachToTeam, coachAffinity, COACH_REROLLS, isDraftableCoach } from '../src/lib/game/dynasty/coach';
import { COACH_OFFER_SIZE, offerCoaches } from '../src/lib/game/dynasty/coachOffer';
import type { CombatTeam, Coach } from '../src/lib/game/types';

const team: CombatTeam = { id: 'user', name: 'Org', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true };
const coach = (patch: Partial<Coach>): Coach => ({ id: 'coach-x-2018', baseId: 'x', name: 'X', teamId: 'x-2018', year: 2018, game: 'CSGO', tactics: 70, discipline: 70, aggression: 70, development: 70, overall: 70, rarity: 'common', confidence: 'high', needsReview: false, source: { page: null, url: null, year: 2018, note: '' }, ...patch });

describe('efeito do coach', () => {
  it('coach neutro (70 em tudo) não muda força nem mental', () => {
    const applied = applyCoachToTeam(team, coach({}));
    expect(applied.power).toBeCloseTo(80, 10);
    expect(applied.mental).toBeCloseTo(80, 10);
    expect(applied.coachSidePreference).toBeCloseTo(0, 10);
    expect(applied.timeoutFactor).toBeCloseTo(1, 10);
    expect(applied.coachId).toBe('coach-x-2018');
  });

  it('coach de elite fica dentro das faixas da spec', () => {
    const applied = applyCoachToTeam(team, coach({ tactics: 99, discipline: 99, aggression: 99 }), 0.015);
    expect(applied.power).toBeCloseTo(80 * (1 + 29 / 2000 + 0.015), 10);
    expect(applied.mental).toBeCloseTo(80 + 29 * 0.25, 10);
    expect(applied.coachSidePreference).toBeCloseTo(-0.029, 10);
    expect(applied.timeoutFactor).toBeCloseTo(1.145, 10);
    const weak = applyCoachToTeam(team, coach({ tactics: 40, discipline: 40, aggression: 40 }));
    expect(weak.power).toBeCloseTo(80 * (1 - 30 / 2000), 10);
    expect(weak.timeoutFactor).toBeCloseTo(0.85, 10);
    expect(applyCoachToTeam({ ...team, mental: 95 }, coach({ discipline: 99 })).mental).toBe(99);
  });

  it('afinidade: 2 jogadores do time do coach valem mais que 2 da mesma organização em outro ano', () => {
    const astralis2018 = teams.find((item) => item.id === 'astralis-2018')!;
    const astralis2019 = teams.find((item) => item.id === 'astralis-2019')!;
    const coachOf2018 = coach({ teamId: astralis2018.id });
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2018).slice(0, 2), teams)).toBe(0.015);
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2019).slice(0, 2), teams)).toBe(0.0075);
    expect(coachAffinity(coachOf2018, getTeamPlayers(astralis2018).slice(0, 1), teams)).toBe(0);
  });
});

describe('ofertas de coach no draft', () => {
  const used = ['astralis-2018', 'faze-2018'];

  it('oferece 3 pessoas distintas, sem placeholder nem time já usado, com uma de overall 80+', () => {
    const offer = offerCoaches(coaches, 'seed-coach', used);
    expect(offer).toHaveLength(COACH_OFFER_SIZE);
    expect(new Set(offer.map((item) => item.baseId)).size).toBe(COACH_OFFER_SIZE);
    expect(offer.every(isDraftableCoach)).toBe(true);
    expect(offer.some((item) => used.includes(item.teamId))).toBe(false);
    expect(offer.some((item) => item.overall >= 80)).toBe(true);
  });

  it('é determinístico pela seed e o ressorteio muda a oferta', () => {
    const ids = (rerolls: number, seed = 'seed-coach') => offerCoaches(coaches, seed, used, rerolls).map((item) => item.id);
    expect(ids(0)).toEqual(ids(0));
    expect(ids(1)).not.toEqual(ids(0));
    expect(ids(0, 'outra')).not.toEqual(ids(0));
    expect(offerCoaches(coaches, 'seed-coach', [...used].reverse()).map((item) => item.id)).toEqual(ids(0));
    expect(COACH_REROLLS).toBe(1);
  });
});
```

Run: `npx vitest run tests/dynastyCoach.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar `coach.ts` (sem importar a simulação, para não criar ciclo)**

```ts
// src/lib/game/dynasty/coach.ts
import type { Coach, CombatTeam, HistoricalTeam, Player } from '../types';

export const COACH_REROLLS = 1;

export const isDraftableCoach = (coach: Coach) => coach.confidence !== 'placeholder';

const orgOf = (name: string | null | undefined) => (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** +1.5% power with two or more players from the coach's own team-year; +0.75% with two or more from the same organization in another year. */
export function coachAffinity(coach: Coach, players: Player[], teams: HistoricalTeam[]): number {
  if (players.filter((player) => player.teamId === coach.teamId).length >= 2) return 0.015;
  const nameOf = new Map(teams.map((team) => [team.id, team.name]));
  const org = orgOf(nameOf.get(coach.teamId));
  if (!org) return 0;
  return players.filter((player) => player.teamId && orgOf(nameOf.get(player.teamId)) === org).length >= 2 ? 0.0075 : 0;
}

/** The coach's edge on a combat team. A coach with 70 in every attribute is neutral. */
export function applyCoachToTeam(team: CombatTeam, coach: Coach, affinity = 0): CombatTeam {
  return {
    ...team,
    power: team.power * (1 + (coach.tactics - 70) / 2000 + affinity),
    mental: Math.max(1, Math.min(99, team.mental + (coach.discipline - 70) * 0.25)),
    coachId: coach.id,
    coachSidePreference: -(coach.aggression - 70) / 1000,
    timeoutFactor: 1 + (coach.discipline - 70) / 200
  };
}
```

- [ ] **Step 5: Implementar `coachOffer.ts`**

```ts
// src/lib/game/dynasty/coachOffer.ts
import { createSeededRng } from '../simulation';
import type { Coach } from '../types';
import { isDraftableCoach } from './coach';

export const COACH_OFFER_SIZE = 3;

/** Three different people, from teams the user did not draft from, at least one with overall 80+. Same seed and rerolls → same offer. */
export function offerCoaches(coaches: Coach[], seed: string, usedTeamIds: readonly string[], rerollsUsed = 0): Coach[] {
  const used = new Set(usedTeamIds);
  const pool = coaches.filter((coach) => isDraftableCoach(coach) && !used.has(coach.teamId));
  const rng = createSeededRng(`${seed}:coach:${[...usedTeamIds].sort().join('|')}:${rerollsUsed}`);
  const offer: Coach[] = [];
  const people = new Set<string>();
  const draw = (candidates: Coach[]) => {
    const available = candidates.filter((coach) => !people.has(coach.baseId));
    if (!available.length) return false;
    const chosen = available[Math.floor(rng() * available.length)];
    offer.push(chosen);
    people.add(chosen.baseId);
    return true;
  };
  draw(pool.filter((coach) => coach.overall >= 80));
  while (offer.length < COACH_OFFER_SIZE && draw(pool));
  return offer;
}
```

- [ ] **Step 6: Rodar**

Run: `npx vitest run tests/dynastyCoach.test.ts tests/dynastyState.test.ts && npm run check`
Expected: testes passam; `0 ERRORS 0 WARNINGS`. Se o teste de afinidade falhar porque `astralis-2019` não existe no dataset, trocar por outro par de anos da mesma organização presente (`node -e "console.log(require('./src/lib/data/cs/teams.game.json').filter(t=>t.name==='Astralis').map(t=>t.id))"`) e registrar no relato.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/dynasty/coach.ts src/lib/game/dynasty/coachOffer.ts src/lib/game/dynasty/state.ts tests/dynastyCoach.test.ts tests/dynastyState.test.ts
git commit -m "feat: efeito do coach, afinidade e ofertas de coach da Dinastia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 4: Coach no motor (só quando passado)

**Files:**
- Modify: `src/lib/game/simulation.ts` (`createMajorField`), `src/lib/game/rounds.ts` (`roundProbabilityA`, `requestTimeout`), `src/lib/game/campaign-major.ts` (`CampaignMajorOptions`)
- Test: `tests/dynastyCoachEngine.test.ts`
- Regressão: `tests/normalRunGolden.test.ts` intacto; suíte completa.

**Interfaces:**
- Consumes: `applyCoachToTeam`, `coachAffinity` (Task 3); campos opcionais de `CombatTeam`.
- Produces: `createMajorField(..., options: { selectedMaps?; mode?; coach?: Coach })`; `CampaignMajorOptions.coach?: Coach`.

- [ ] **Step 1: Teste que falha**

```ts
// tests/dynastyCoachEngine.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, getTeamPlayers, players, teams } from '../src/lib/game/data';
import { createCampaignMajor } from '../src/lib/game/campaign-major';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createMajorField } from '../src/lib/game/simulation';
import type { Coach, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const strong: Coach = { ...coaches.find((coach) => coach.confidence === 'high')!, tactics: 99, discipline: 99, aggression: 99 };

describe('coach no motor', () => {
  it('sem coach o time do usuário não ganha campos de coach', () => {
    const { user } = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty' });
    expect(user.coachId).toBeUndefined();
    expect(user.coachSidePreference).toBeUndefined();
    expect(user.timeoutFactor).toBeUndefined();
  });

  it('com coach o time do usuário fica mais forte e carrega lado e pausa', () => {
    const plain = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty' }).user;
    const coached = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty', coach: strong }).user;
    expect(coached.power).toBeGreaterThan(plain.power);
    expect(coached.mental).toBeGreaterThan(plain.mental);
    expect(coached.coachSidePreference).toBeLessThan(0);
    expect(coached.timeoutFactor).toBeGreaterThan(1);
  });

  it('a campanha da Dinastia leva o coach para as séries do usuário e não para os bots', () => {
    const major = createCampaignMajor(roster, 'balanced', teams, players, 'motor-coach-campanha', lineup, { selectedMaps, mode: 'dynasty', dynastyEntryStage: 'stage1', coach: strong });
    const series = major.engine.rounds.flatMap((round) => round.series);
    const userSeries = series.find((item) => item.config.teamA.id === 'user' || item.config.teamB.id === 'user')!;
    const userTeam = userSeries.config.teamA.id === 'user' ? userSeries.config.teamA : userSeries.config.teamB;
    expect(userTeam.coachId).toBe(strong.id);
    const botTeams = series.flatMap((item) => [item.config.teamA, item.config.teamB]).filter((item) => item.id !== 'user');
    expect(botTeams.every((item) => item.coachId === undefined && item.timeoutFactor === undefined)).toBe(true);
  });
});
```

Run: `npx vitest run tests/dynastyCoachEngine.test.ts` → FAIL (erro de tipo em `coach` ou poder igual).

- [ ] **Step 2: `createMajorField` em `src/lib/game/simulation.ts`**

Acrescentar aos imports: `import { applyCoachToTeam, coachAffinity } from './dynasty/coach';` e `Coach` à lista de tipos de `./types`. Trocar a assinatura de `options` e a linha do `user`:

```ts
  options: { selectedMaps?: MapId[]; mode?: GameMode; coach?: Coach } = {}
) {
  const lineupKey = players.map((player) => player.id).join('|');
  const baseUser = calculateUserTeamPower(players, style, lineup, seed);
  // Dinastia only: the coach is passed explicitly, so every other mode keeps exactly the same user team.
  const user = options.coach ? applyCoachToTeam(baseUser, options.coach, coachAffinity(options.coach, players, teams)) : baseUser;
```

(O restante da função não muda. `buildMajorRun` repassa as `options` sem `coach`.)

- [ ] **Step 3: `rounds.ts`**

Em `roundProbabilityA`, trocar a linha do `sideBias` por:

```ts
  const sideBias = (sideA === 'ct' ? 1 : -1) * ((state.mapId ? MAP_SIDE_BIAS[state.mapId] : 0) + styleSidePreference(a.team.style) + styleSidePreference(b.team.style) + (a.team.coachSidePreference ?? 0) + (b.team.coachSidePreference ?? 0));
```

Em `requestTimeout`, trocar a linha do bônus por:

```ts
  state.pendingTimeoutBonus = timeoutBonus(state.mode, timing) * (state.teams[side].team.timeoutFactor ?? 1);
```

- [ ] **Step 4: `campaign-major.ts`**

Acrescentar `type Coach` aos imports de `./types` e, em `CampaignMajorOptions`:

```ts
  /** Dinastia: coach of the user's organization. */
  coach?: Coach;
```

(`createCampaignMajor` já repassa `options` a `createMajorField`.)

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/dynastyCoachEngine.test.ts tests/normalRunGolden.test.ts tests/rounds.test.ts tests/campaignMajorStages.test.ts && git status --short tests/__snapshots__`
Expected: todos passam; a última linha não imprime nada (snapshot intacto).

Run: `npx vitest run && npm run check && npm run server:build`
Expected: suíte completa verde, `0 ERRORS 0 WARNINGS`, bundle do servidor gerado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/simulation.ts src/lib/game/rounds.ts src/lib/game/campaign-major.ts tests/dynastyCoachEngine.test.ts
git commit -m "feat: coach da Dinastia pesa na força, no lado T e na pausa tática do time do usuário

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 5: Fase de escolha do coach na página

**Files:**
- Create: `src/lib/components/CoachDraft.svelte`
- Modify: `src/lib/game/types.ts` (`GamePhase`), `src/lib/game/i18n.ts`, `src/lib/game/store.ts`, `src/lib/components/DynastyHeader.svelte`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `coaches`, `coachById`, `teamById` de `$lib/game/data`; `offerCoaches` (Task 3); `applyCoachToTeam`, `coachAffinity`, `COACH_REROLLS` (Task 3); `CampaignMajorOptions.coach` (Task 4); `DynastyState.coachRerollsUsed`.
- Produces: fase `coach-draft`; `CoachDraft` (`offer: Coach[]`, `language: Language`, `rerollsLeft: number`, `teamLabel: (teamId: string) => string`, `onPick: (coach: Coach) => void`, `onReroll: () => void`); `DynastyHeader.coachName: string | null`.

- [ ] **Step 1: Fase e textos**

Em `GamePhase` (`types.ts`) acrescentar `| 'coach-draft'` depois de `| 'pro-reveal'`.

Em `src/lib/game/i18n.ts`, no bloco `pt` (vírgula no início da linha), depois de `,dynastyHistory: ...`:

```ts
  ,dynastyCoach: 'Coach'
  ,coachDraftTitle: 'Escolha o coach'
  ,coachDraftDesc: 'Três coaches reais de times que você não usou no draft. O coach pesa na força do time, na pausa tática, no lado TR e na química com jogadores do time dele.'
  ,coachReroll: 'Sortear outros coaches'
  ,coachPick: 'Contratar'
  ,coachTactics: 'Tática'
  ,coachDiscipline: 'Disciplina'
  ,coachAggression: 'Agressão'
  ,coachDevelopment: 'Desenvolvimento'
  ,coachNeedsReview: 'Coach de ano vizinho, a confirmar'
  ,coachStaff: 'Comissão técnica'
```

Nos blocos `es` e `en` (vírgula no fim), depois de `dynastyHistory: ...`:

```ts
  dynastyCoach: 'Coach', coachDraftTitle: 'Elige el coach', coachDraftDesc: 'Tres coaches reales de equipos que no usaste en el draft. El coach influye en la fuerza del equipo, la pausa táctica, el lado T y la química con jugadores de su equipo.', coachReroll: 'Sortear otros coaches', coachPick: 'Contratar', coachTactics: 'Táctica', coachDiscipline: 'Disciplina', coachAggression: 'Agresión', coachDevelopment: 'Desarrollo', coachNeedsReview: 'Coach de un año cercano, por confirmar', coachStaff: 'Cuerpo técnico',
```

```ts
  dynastyCoach: 'Coach', coachDraftTitle: 'Pick your coach', coachDraftDesc: 'Three real coaches from teams you did not draft from. The coach shapes team strength, the tactical timeout, the T side and chemistry with players from their own team.', coachReroll: 'Draw other coaches', coachPick: 'Hire', coachTactics: 'Tactics', coachDiscipline: 'Discipline', coachAggression: 'Aggression', coachDevelopment: 'Development', coachNeedsReview: 'Coach from a nearby year, to be confirmed', coachStaff: 'Coaching staff',
```

- [ ] **Step 2: Store**

Em `src/lib/game/store.ts`, em `loadState`, junto das normalizações de `mode`/`dynasty` feitas na Dinastia A:

```ts
    if ((parsed.phase as string) === 'coach-draft' && parsed.mode !== 'dynasty') parsed.phase = 'draft';
```

- [ ] **Step 3: Componente**

```svelte
<!-- src/lib/components/CoachDraft.svelte -->
<script lang="ts">
  import { translate } from '$lib/game/i18n';
  import type { Coach, Language } from '$lib/game/types';

  export let offer: Coach[] = [];
  export let language: Language = 'pt-BR';
  export let rerollsLeft = 0;
  export let teamLabel: (teamId: string) => string = (teamId) => teamId;
  export let onPick: (coach: Coach) => void = () => {};
  export let onReroll: () => void = () => {};

  $: t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const attributes = ['tactics', 'discipline', 'aggression', 'development'] as const;
  const labelKey = { tactics: 'coachTactics', discipline: 'coachDiscipline', aggression: 'coachAggression', development: 'coachDevelopment' } as const;
</script>

<section class="coach-draft">
  <div class="coach-grid">
    {#each offer as coach (coach.id)}
      <article class="coach-card panel rarity-{coach.rarity}">
        <header>
          <span class="coach-avatar" aria-hidden="true">{coach.name.slice(0, 2).toUpperCase()}</span>
          <div><h2>{coach.name}</h2><small>{teamLabel(coach.teamId)}</small></div>
          <b class="coach-overall">{coach.overall}</b>
        </header>
        <dl>
          {#each attributes as key}
            <div><dt>{t(labelKey[key])}</dt><dd><span style={`width:${coach[key]}%`}></span><b>{coach[key]}</b></dd></div>
          {/each}
        </dl>
        {#if coach.needsReview}<p class="coach-review">{t('coachNeedsReview')}</p>{/if}
        <button class="primary" type="button" on:click={() => onPick(coach)}>{t('coachPick')}</button>
      </article>
    {/each}
  </div>
  <button class="secondary" type="button" disabled={rerollsLeft <= 0} on:click={onReroll}>{t('coachReroll')} ({rerollsLeft})</button>
</section>

<style>
  .coach-draft { display: grid; gap: 16px; justify-items: start; }
  .coach-grid { display: grid; gap: 14px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .coach-card { display: grid; gap: 14px; padding: 18px; }
  .coach-card header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; }
  .coach-card h2 { margin: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
  .coach-card small { color: var(--muted); }
  .coach-avatar { display: grid; place-items: center; width: 44px; height: 44px; background: var(--surface-2); color: var(--accent); font-weight: 900; }
  .coach-overall { font-size: 1.6rem; color: var(--accent); }
  .coach-card dl { display: grid; gap: 8px; margin: 0; }
  .coach-card dl div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: center; font-size: .78rem; }
  .coach-card dd { position: relative; display: flex; align-items: center; gap: 8px; margin: 0; }
  .coach-card dd span { display: block; height: 6px; background: var(--accent); }
  .coach-review { margin: 0; color: var(--accent-2); font-size: .72rem; }
</style>
```

- [ ] **Step 4: Cabeçalho da dinastia**

Em `src/lib/components/DynastyHeader.svelte`, acrescentar `export let coachName: string | null = null;` depois de `export let language` e, no markup, depois do `<span>` do caixa:

```svelte
  {#if coachName}<span>{t('dynastyCoach')} <b>{coachName}</b></span>{/if}
```

- [ ] **Step 5: Página**

Em `src/routes/+page.svelte`:

1. Imports (acrescentar às listas existentes, sem duplicar): `CoachDraft` de `$lib/components/CoachDraft.svelte`; `coaches`, `coachById` e `teamById` de `$lib/game/data` (se `teamById` já vier de outro import, não repetir); `applyCoachToTeam`, `coachAffinity`, `COACH_REROLLS` de `$lib/game/dynasty/coach`; `offerCoaches` de `$lib/game/dynasty/coachOffer`; `type Coach` à lista de tipos de `$lib/game/types`.

2. Trocar `$: userTeam = calculateUserTeamPower(selectedPlayers, $game.style, selectedLineup, $game.seed);` por:

```ts
  $: dynastyCoach = isDynasty && $game.dynasty?.coachId ? coachById.get($game.dynasty.coachId) ?? null : null;
  $: baseUserTeam = calculateUserTeamPower(selectedPlayers, $game.style, selectedLineup, $game.seed);
  $: userTeam = dynastyCoach ? applyCoachToTeam(baseUserTeam, dynastyCoach, coachAffinity(dynastyCoach, selectedPlayers, teams)) : baseUserTeam;
  $: coachOffer = $game.phase === 'coach-draft' && $game.dynasty ? offerCoaches(coaches, $game.seed, $game.usedTeamIds, $game.dynasty.coachRerollsUsed) : [];
```

(Se `$: isDynasty` estiver declarado depois dessa linha, mover as quatro linhas para logo depois de `$: isDynasty = ...`.)

3. Trocar `beginMapSelection` e acrescentar as duas funções:

```ts
  function beginMapSelection() {
    if (!draftComplete || (isProMode && !$game.proRevealed)) return;
    if (isDynasty && $game.dynasty && !$game.dynasty.coachId) {
      update({ phase: 'coach-draft' });
      return;
    }
    update({ phase: 'map-selection', selectedMaps: [] });
  }

  function pickCoach(coach: Coach) {
    if (!$game.dynasty) return;
    update({ dynasty: { ...$game.dynasty, coachId: coach.id }, phase: 'map-selection', selectedMaps: [] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function rerollCoaches() {
    if (!$game.dynasty || $game.dynasty.coachRerollsUsed >= COACH_REROLLS) return;
    update({ dynasty: { ...$game.dynasty, coachRerollsUsed: $game.dynasty.coachRerollsUsed + 1 } });
  }

  const coachTeamLabel = (teamId: string) => {
    const team = teamById.get(teamId);
    return team ? `${translateTeamName($game.language, team.name ?? teamId)} ${team.year ?? ''}`.trim() : teamId;
  };
```

4. Em `launchMajor` e em `restoreCampaign`, nas opções de `createCampaignMajor`, logo depois do spread de `dynastyEntryStage`:

```ts
      ...(isDynasty && dynastyCoach ? { coach: dynastyCoach } : {}),
```

5. No markup, logo antes de `{:else if $game.phase === 'map-selection'}`:

```svelte
  {:else if $game.phase === 'coach-draft'}
    <section class="screen shell">
      <header class="screen-header"><span class="eyebrow">DINASTIA · COACH</span><h1>{t('coachDraftTitle')}</h1><p>{t('coachDraftDesc')}</p></header>
      <CoachDraft offer={coachOffer} language={$game.language} rerollsLeft={COACH_REROLLS - ($game.dynasty?.coachRerollsUsed ?? 0)} teamLabel={coachTeamLabel} onPick={pickCoach} onReroll={rerollCoaches} />
    </section>
```

6. No `<DynastyHeader ... />` acrescentar `coachName={dynastyCoach ? (dynastyCoach.confidence === 'placeholder' ? t('coachStaff') : dynastyCoach.name) : null}`.

- [ ] **Step 6: Verificar**

Run: `npm run check && npx vitest run && npm run build`
Expected: `0 ERRORS 0 WARNINGS`; suíte completa verde; build ok.

Verificação no navegador (`npm run dev`, `http://localhost:5173`), se houver navegador disponível; senão, registrar que não foi feita:
1. Dinastia → draft de 5 → "Escolher mapas" abre "Escolha o coach" com 3 cards e o botão de sortear com (1).
2. Sortear outros: a oferta muda e o botão fica desabilitado. Recarregar a página mantém a mesma oferta.
3. Contratar: vai para os mapas; o cabeçalho mostra o coach; o poder no painel do draft muda em relação a antes do coach.
4. Jogar o Major até o resultado e clicar "Próximo Major": vai direto para os mapas, mantendo o coach.
5. Normal com a seed `dourado-normal-2026`: nenhuma tela de coach; resultado igual ao snapshot.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/CoachDraft.svelte src/lib/components/DynastyHeader.svelte src/lib/game/types.ts src/lib/game/i18n.ts src/lib/game/store.ts src/routes/+page.svelte
git commit -m "feat: Dinastia escolhe o coach depois do draft e mostra o coach no cabeçalho

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

---

### Task 6: Gate final e fechamento

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-dinastia-design.md` (sequência de entregas)

- [ ] **Step 1: Gate do jogo**

Run: `npm run validate && git status --short tests/__snapshots__`
Expected: svelte-check `0 ERRORS 0 WARNINGS`; vitest com todos os arquivos passando (inclui `datasetIntegrity`, `dynastyCoach`, `dynastyCoachEngine`); build do front e do servidor; nenhuma linha de snapshot.

- [ ] **Step 2: Testes do studio**

Run (em `/home/itcenterai/worktree/worktree-pessoal/cs13a0-studio-coaches`): `npm run test:coaches && npm run build:coaches && git status --short`
Expected: `# fail 0`; `requisições de rede: 0`; `git status` vazio (o build é determinístico, exceto `generatedAt` do relatório; se só `data/reports/coaches-report.json` aparecer, descartar com `git checkout -- data/reports/coaches-report.json`).

- [ ] **Step 3: Registrar na spec**

Na seção "Sequência de entregas", trocar o início do item 2 `2. **Dinastia B**:` por `2. **Dinastia B** (plano `docs/superpowers/plans/2026-09-14-dinastia-b-coaches.md`, implementada):`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-14-dinastia-design.md
git commit -m "docs: aponta o plano da Dinastia B na spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TwA74ZcfiRtgYGBxy9sTjM"
```

- [ ] **Step 5: Relato**

Relatar: contagem de coaches por confiança, lista dos `low` e `placeholder` para revisão, achado `bntet-2019` (overall 74 com IGL 30), testes e contagens, que o branch `feat/coaches-dataset` do studio precisa ser mesclado no `main` do studio para o `data:pull` funcionar, e que nada foi enviado por push.

# SEO técnico e descoberta do cs13a0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar localmente todos os sinais técnicos de descoberta e compartilhamento definidos na especificação, com `https://cs13a0.com` como origem canônica.

**Architecture:** Um módulo TypeScript concentra URLs, conteúdo e metadados tipados; um componente Svelte emite as tags comuns por rota. Os arquivos estáticos de descoberta ficam em `static/`, e testes Vitest verificam o contrato público, a sincronização do sitemap e as diretivas do sandbox antes da validação completa.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript 5.9, Vitest 4, adapter-static, XML estático.

## Global Constraints

- Usar somente `https://cs13a0.com`, sem `www`, em referências SEO.
- Incluir `/online` e excluir `/sandbox` do sitemap.
- Declarar `noindex, nofollow` em `/sandbox`.
- Não criar `meta name="keywords"` nem lista artificial de palavras-chave.
- Só incluir `og:image` e `twitter:image` se já houver imagem social apropriada; nenhum asset atual atende ao requisito.
- Usar `applicationCategory: "GameApplication"` e `operatingSystem: "Web Browser"` no JSON-LD.
- Não fazer push, deploy ou alteração externa na Vercel.
- Preservar alterações preexistentes, especialmente `src/lib/data/cs/players.game.json`.

---

## File Structure

- Create `src/lib/seo.ts`: origem, rotas públicas, metadados, JSON-LD e texto semântico.
- Create `src/lib/components/SeoHead.svelte`: emissão compartilhada das tags de head.
- Create `static/sitemap.xml`: URLs públicas absolutas.
- Create `static/robots.txt`: política de crawl e localização do sitemap.
- Create `tests/seo.test.ts`: contrato público de metadados, arquivos de descoberta, JSON-LD e texto.
- Modify `src/routes/+page.svelte`: head compartilhado, JSON-LD e seção textual.
- Modify `src/routes/online/+page.svelte`: metadados da rota pública.
- Modify `src/routes/teams/+page.svelte`: metadados da rota pública.
- Modify `src/routes/players/+page.svelte`: metadados da rota pública.
- Modify `src/routes/about/+page.svelte`: metadados da rota pública.
- Modify `src/routes/contact/+page.svelte`: metadados da rota pública.
- Modify `src/routes/privacy/+page.svelte`: metadados da rota pública.
- Modify `src/routes/terms/+page.svelte`: metadados da rota pública.
- Modify `src/routes/sandbox/+page.svelte`: diretiva `noindex, nofollow`.

### Task 1: Contrato tipado de SEO por rota

**Files:**
- Create: `src/lib/seo.ts`
- Create: `tests/seo.test.ts`

**Interfaces:**
- Produces: `SITE_ORIGIN: "https://cs13a0.com"`, `PUBLIC_ROUTES`, `SEO_BY_ROUTE`, `SeoMetadata`, `getCanonicalUrl(path)`.

- [ ] **Step 1: Write the failing route metadata test**

```ts
import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, SEO_BY_ROUTE, SITE_ORIGIN, getCanonicalUrl } from '../src/lib/seo';

describe('SEO contract', () => {
  it('defines unique metadata for every public canonical route', () => {
    expect(SITE_ORIGIN).toBe('https://cs13a0.com');
    expect(PUBLIC_ROUTES).toEqual(['/', '/online', '/teams', '/players', '/about', '/contact', '/privacy', '/terms']);
    expect(new Set(PUBLIC_ROUTES.map((path) => SEO_BY_ROUTE[path].title)).size).toBe(PUBLIC_ROUTES.length);
    for (const path of PUBLIC_ROUTES) {
      expect(SEO_BY_ROUTE[path].description.length).toBeGreaterThan(50);
      expect(getCanonicalUrl(path)).toBe(`${SITE_ORIGIN}${path}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/seo.test.ts`

Expected: FAIL because `src/lib/seo.ts` does not exist.

- [ ] **Step 3: Implement the typed metadata module**

Create literal public-route types, a metadata record with unique PT-BR title/description values, and a canonical builder that returns `/` without a duplicated slash:

```ts
export const SITE_ORIGIN = 'https://cs13a0.com' as const;
export const PUBLIC_ROUTES = ['/', '/online', '/teams', '/players', '/about', '/contact', '/privacy', '/terms'] as const;
export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
}

export const getCanonicalUrl = (path: PublicRoute) => `${SITE_ORIGIN}${path}`;

const ROUTE_COPY: Record<PublicRoute, Omit<SeoMetadata, 'canonical'>> = {
  '/': {
    title: 'cs13a0 · Monte sua line e sobreviva ao Major',
    description: 'Monte uma line histórica de Counter-Strike, escolha funções e dispute um Major simulado por seed no cs13a0.'
  },
  '/online': {
    title: 'Major online de Counter-Strike · cs13a0',
    description: 'Crie uma sala, reúna de 2 a 16 jogadores e dispute online o draft e o Major histórico do cs13a0.'
  },
  '/teams': {
    title: 'Times históricos de Counter-Strike · cs13a0',
    description: 'Explore elencos históricos de Counter-Strike organizados por ano e conheça os times disponíveis no draft do cs13a0.'
  },
  '/players': {
    title: 'Ranking de jogadores de Counter-Strike · cs13a0',
    description: 'Compare jogadores históricos por função, overall, temporada e equipe antes de montar sua line no cs13a0.'
  },
  '/about': {
    title: 'Sobre o simulador cs13a0',
    description: 'Conheça o projeto independente cs13a0, um simulador de draft e campanha de Major inspirado na história do Counter-Strike.'
  },
  '/contact': {
    title: 'Contato · cs13a0',
    description: 'Envie sugestões, correções de dados e comentários para a equipe do simulador independente de Counter-Strike cs13a0.'
  },
  '/privacy': {
    title: 'Política de Privacidade · cs13a0',
    description: 'Entenda como o cs13a0 trata armazenamento local, dados da experiência online, serviços externos e informações de contato.'
  },
  '/terms': {
    title: 'Termos de Uso · cs13a0',
    description: 'Consulte os termos de uso, avisos de marcas, regras de conduta e condições do projeto independente cs13a0.'
  }
};

export const SEO_BY_ROUTE: Record<PublicRoute, SeoMetadata> = Object.fromEntries(
  PUBLIC_ROUTES.map((path) => [path, { ...ROUTE_COPY[path], canonical: getCanonicalUrl(path) }])
) as Record<PublicRoute, SeoMetadata>;
```

Keep `ROUTE_COPY` fully typed and provide concrete copy for all eight routes.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run tests/seo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add src/lib/seo.ts tests/seo.test.ts
git commit -m "feat: adiciona contrato tipado de SEO"
```

### Task 2: Sitemap e robots públicos

**Files:**
- Create: `static/sitemap.xml`
- Create: `static/robots.txt`
- Modify: `tests/seo.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_ROUTES`, `getCanonicalUrl`.
- Produces: `/sitemap.xml` e `/robots.txt` no build estático.

- [ ] **Step 1: Add failing discovery-file tests**

```ts
import { readFileSync } from 'node:fs';

it('publishes exactly the canonical public URLs in the sitemap', () => {
  const sitemap = readFileSync(new URL('../static/sitemap.xml', import.meta.url), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  expect(locations).toEqual(PUBLIC_ROUTES.map(getCanonicalUrl));
  expect(sitemap).not.toContain('/sandbox');
  expect(sitemap).not.toContain('www.cs13a0.com');
});

it('allows crawling and advertises the canonical sitemap', () => {
  const robots = readFileSync(new URL('../static/robots.txt', import.meta.url), 'utf8');
  expect(robots).toBe('User-agent: *\nAllow: /\n\nSitemap: https://cs13a0.com/sitemap.xml\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/seo.test.ts`

Expected: FAIL with missing `static/sitemap.xml` or `static/robots.txt`.

- [ ] **Step 3: Create the static files**

Create `static/sitemap.xml` exactly as follows; do not add synthetic `lastmod`, `changefreq` or `priority`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://cs13a0.com/</loc></url>
  <url><loc>https://cs13a0.com/online</loc></url>
  <url><loc>https://cs13a0.com/teams</loc></url>
  <url><loc>https://cs13a0.com/players</loc></url>
  <url><loc>https://cs13a0.com/about</loc></url>
  <url><loc>https://cs13a0.com/contact</loc></url>
  <url><loc>https://cs13a0.com/privacy</loc></url>
  <url><loc>https://cs13a0.com/terms</loc></url>
</urlset>
```

Create `static/robots.txt` exactly as follows:

```text
User-agent: *
Allow: /

Sitemap: https://cs13a0.com/sitemap.xml
```

- [ ] **Step 4: Validate the focused tests and XML syntax**

Run: `npx vitest run tests/seo.test.ts`

Expected: PASS.

Run: `xmllint --noout static/sitemap.xml` if `xmllint` is installed; otherwise use `ruby -r rexml/document -e 'REXML::Document.new(File.read("static/sitemap.xml"))'`.

Expected: exit code 0.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add static/sitemap.xml static/robots.txt tests/seo.test.ts
git commit -m "feat: publica sitemap e robots"
```

### Task 3: Metadados compartilhados e sandbox fora do índice

**Files:**
- Create: `src/lib/components/SeoHead.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/online/+page.svelte`
- Modify: `src/routes/teams/+page.svelte`
- Modify: `src/routes/players/+page.svelte`
- Modify: `src/routes/about/+page.svelte`
- Modify: `src/routes/contact/+page.svelte`
- Modify: `src/routes/privacy/+page.svelte`
- Modify: `src/routes/terms/+page.svelte`
- Modify: `src/routes/sandbox/+page.svelte`
- Modify: `tests/seo.test.ts`

**Interfaces:**
- Consumes: `SEO_BY_ROUTE`, `SeoMetadata`.
- Produces: `<SeoHead metadata={SEO_BY_ROUTE[path]} />` with canonical, robots, Open Graph and Twitter Card tags.

- [ ] **Step 1: Add a failing head-contract test**

```ts
it('provides complete share metadata without unsupported keyword or missing image claims', () => {
  for (const path of PUBLIC_ROUTES) {
    const metadata = SEO_BY_ROUTE[path];
    expect(metadata.canonical).toMatch(/^https:\/\/cs13a0\.com\//);
    expect(metadata.title).not.toMatch(/keywords/i);
    expect(metadata.description).not.toMatch(/keywords/i);
  }
});
```

Extend `SeoMetadata` only if the component needs a typed `robots` value; do not add image fields when no image exists.

- [ ] **Step 2: Run the focused test before component integration**

Run: `npx vitest run tests/seo.test.ts`

Expected: PASS for the existing metadata contract; the UI integration remains unimplemented and will be checked by Svelte compilation in Step 4.

- [ ] **Step 3: Implement the shared head and integrate all routes**

Create `SeoHead.svelte`:

```svelte
<script lang="ts">
  import type { SeoMetadata } from '$lib/seo';
  export let metadata: SeoMetadata;
</script>

<svelte:head>
  <title>{metadata.title}</title>
  <meta name="description" content={metadata.description} />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={metadata.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="cs13a0" />
  <meta property="og:title" content={metadata.title} />
  <meta property="og:description" content={metadata.description} />
  <meta property="og:url" content={metadata.canonical} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.description} />
</svelte:head>
```

Import and render it once in every public route, removing the existing duplicate `svelte:head` blocks from home and online. In `sandbox/+page.svelte`, retain its title and add:

```svelte
<meta name="robots" content="noindex, nofollow" />
```

Do not add `SeoHead` to the sandbox.

- [ ] **Step 4: Compile Svelte and TypeScript**

Run: `npm run check`

Expected: 0 errors and 0 warnings.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add src/lib/components/SeoHead.svelte src/routes tests/seo.test.ts
git commit -m "feat: adiciona metadados SEO às páginas públicas"
```

### Task 4: JSON-LD e conteúdo natural da home

**Files:**
- Modify: `src/lib/seo.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `tests/seo.test.ts`

**Interfaces:**
- Produces: `HOME_STRUCTURED_DATA` e `HOME_SEO_COPY`.

- [ ] **Step 1: Add failing structured-data and copy tests**

```ts
import { HOME_SEO_COPY, HOME_STRUCTURED_DATA } from '../src/lib/seo';

it('describes the home as a browser game in structured data', () => {
  expect(HOME_STRUCTURED_DATA).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web Browser',
    url: 'https://cs13a0.com/'
  });
});

it('provides useful natural Counter-Strike copy near one hundred words', () => {
  const words = HOME_SEO_COPY.trim().split(/\s+/);
  expect(words.length).toBeGreaterThanOrEqual(90);
  expect(words.length).toBeLessThanOrEqual(120);
  for (const term of ['CS 1.6', 'CS:GO', 'CS2', 'Major', 'smokes']) {
    expect(HOME_SEO_COPY).toContain(term);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/seo.test.ts`

Expected: FAIL because `HOME_STRUCTURED_DATA` and `HOME_SEO_COPY` are not exported.

- [ ] **Step 3: Implement and render structured content**

Export a frozen JSON-LD object with `name`, `url`, `description`, `applicationCategory`, `operatingSystem`, `applicationSubCategory`, `browserRequirements` and `offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }`.

Export this PT-BR paragraph and render it in a labeled home section visible only in the home phase, after the feature strip:

```ts
export const HOME_SEO_COPY = 'No cs13a0, você monta uma line com jogadores e elencos históricos de Counter-Strike, atravessando eras do CS 1.6, CS:GO e CS2. Cada campanha transforma o draft em um campeonato completo: escolha funções, combine estilos, prepare o veto de mapas e tente sobreviver até a final do Major. As partidas simulam rounds, economia, armamentos, posições e decisões táticas, incluindo utilitários, flashes e smokes. Compare estrelas, riflers, AWPers, capitães e suportes de diferentes temporadas, descubra confrontos improváveis e compartilhe sua campanha por seed. É um jogo gratuito de estratégia e memória competitiva, feito para fãs da história do Counter-Strike.';
```

Export a frozen JSON-LD object with `name`, `url`, `description`, `applicationCategory`, `operatingSystem`, `applicationSubCategory`, `browserRequirements` and `offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }`. Add the JSON-LD script to the home `svelte:head` using `JSON.stringify(HOME_STRUCTURED_DATA)` and Svelte's safe raw-HTML mechanism because the source object is fully local and controlled.

- [ ] **Step 4: Run focused test and compiler**

Run: `npx vitest run tests/seo.test.ts && npm run check`

Expected: all SEO tests pass; Svelte reports 0 errors and 0 warnings.

- [ ] **Step 5: Commit the vertical slice**

```bash
git add src/lib/seo.ts src/routes/+page.svelte tests/seo.test.ts
git commit -m "feat: adiciona conteúdo semântico e dados estruturados"
```

### Task 5: Validação integral e inspeção dos artefatos

**Files:**
- Modify only if validation exposes a defect in files already listed.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that the local implementation satisfies the acceptance criteria.

- [ ] **Step 1: Run focused SEO verification**

Run: `npx vitest run tests/seo.test.ts`

Expected: all SEO tests pass.

- [ ] **Step 2: Run the complete project gate**

Run: `npm run check && npm test && npm run build && npm run server:build`

Expected: all commands exit 0.

- [ ] **Step 3: Validate built discovery files**

Run: `cmp static/sitemap.xml build/sitemap.xml && cmp static/robots.txt build/robots.txt`

Expected: exit code 0 for both comparisons.

Run: `xmllint --noout build/sitemap.xml` or the documented Ruby fallback.

Expected: exit code 0.

- [ ] **Step 4: Inspect canonical consistency and forbidden routes**

Run: `rg -n "www\\.cs13a0\\.com|<meta name=\"keywords\"|<loc>.*sandbox" src static tests/seo.test.ts`

Expected: no matches, except the intentional production-migration note outside these implementation paths.

- [ ] **Step 5: Report local state**

Run: `git status --short --branch && git log -5 --oneline`

Expected: no push or deploy; any preexisting unrelated user modification remains untouched. Report exact test counts and any warnings.

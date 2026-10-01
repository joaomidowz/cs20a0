# SEO público com pré-render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as páginas públicas entregarem metadados e conteúdo indexável diretamente no HTML, sem depender da execução de JavaScript.

**Architecture:** O layout raiz volta a permitir SSR e ativa prerender estático para as rotas conhecidas. Estados persistidos continuam protegidos por `$app/environment`; o build gera arquivos HTML individuais, enquanto o fallback mantém navegação client-side e rotas operacionais.

**Tech Stack:** SvelteKit, adapter-static, Svelte, TypeScript, Vitest.

## Global Constraints

- Reutilizar textos e metadados existentes.
- Não usar texto oculto, keyword stuffing ou conteúdo diferente para crawler.
- Preservar comportamento client-side, contas, coleção e partidas.
- Páginas operacionais mantêm `noindex`.
- O HTML público precisa conter title, description, canonical e conteúdo antes do JavaScript.

---

### Task 1: Contrato de HTML indexável

**Files:**
- Create: `tests/seoBuild.test.ts`
- Modify: `src/routes/+layout.ts`

**Interfaces:**
- Produces: build estático com `build/index.html`, `build/teams.html`, `build/players.html`, `build/wiki.html` e `build/online.html`.

- [ ] Escrever teste que abre cada HTML gerado e exige `<title>`, description, canonical e texto visível da página.
- [ ] Rodar `npm run build && npx vitest run tests/seoBuild.test.ts`; confirmar falha porque hoje só existe o shell SPA.
- [ ] Trocar o layout raiz por `export const prerender = true;`, usando SSR padrão.
- [ ] Corrigir somente acessos de navegador que quebrarem o SSR com `browser` ou `onMount`.
- [ ] Rodar build e teste até passarem.
- [ ] Commit: `feat: prerenderiza paginas publicas para SEO`.

### Task 2: Dados estruturados e sitemap

**Files:**
- Modify: `src/lib/seo.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `static/sitemap.xml`
- Test: `tests/seo.test.ts`

**Interfaces:**
- Produces: grafo JSON-LD com `WebSite`, `Organization` e `WebApplication`, todos no domínio canônico.

- [ ] Estender os testes para nomes, URLs, descriptions e rotas do sitemap.
- [ ] Adicionar o grafo estruturado usando somente nome, URL, descrição, logo e oferta gratuita já comprovados no projeto.
- [ ] Acrescentar `lastmod` 2026-10-01, frequência e prioridade coerentes a cada URL pública.
- [ ] Rodar `npx vitest run tests/seo.test.ts tests/seoBuild.test.ts` e confirmar sucesso.
- [ ] Commit: `feat: fortalece dados estruturados e sitemap`.

### Task 3: Indicadores visuais sinalizados

**Files:**
- Modify: `src/lib/components/online/CollectionWorkspace.svelte`

**Interfaces:**
- Preserva classes `up`, `down`, `total` e `final`; altera apenas a apresentação.

- [ ] Substituir `border-left: 3px` por borda completa de 1px e superfícies/cores de texto de estado.
- [ ] Rodar o detector Impeccable no arquivo; nenhum `side-tab` deve permanecer.
- [ ] Rodar `npm run check`.
- [ ] Commit: `style: refina indicadores de sinergia`.

### Task 4: Verificação e publicação

**Files:**
- Verify only.

**Interfaces:**
- Produces: main publicada e Vercel Ready com HTML indexável.

- [ ] Rodar `npm run check`, testes de SEO, `npm run build` e `npm run server:build`.
- [ ] Inspecionar HTML local sem JavaScript para Home, Times, Jogadores, Wiki e Online.
- [ ] Enviar `main` e aguardar Vercel Production Ready.
- [ ] Consultar `https://www.cs13a0.com/` e confirmar title, description, canonical, JSON-LD e texto no HTML bruto.
- [ ] Informar que o recrawl do Google depende do Search Console e pode levar tempo.

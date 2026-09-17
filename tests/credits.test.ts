// tests/credits.test.ts
// Página /credits (W7): atribuição CC BY-SA 3.0 da Liquipedia, flag-icons MIT, visuais gerados e não afiliação, em
// pt-BR primeiro e nas outras línguas. As fontes da expansão vêm de sources.expansion.json, carregado só nessa rota.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { translate } from '../src/lib/game/i18n';
import { PUBLIC_ROUTES, SEO_BY_ROUTE } from '../src/lib/seo';
import type { Language } from '../src/lib/game/types';

const page = readFileSync('src/routes/credits/+page.svelte', 'utf8');
const sources = JSON.parse(readFileSync('src/lib/data/cs/sources.expansion.json', 'utf8')) as { version: number; pages: Array<{ title: string; revid: number | string; url: string }> };
const LANGUAGES: Language[] = ['pt-BR', 'en', 'es'];

describe('/credits', () => {
  it('linka a Liquipedia, o texto da CC BY-SA 3.0 e o flag-icons (MIT)', () => {
    expect(page).toContain('https://liquipedia.net/counterstrike/');
    expect(page).toContain('https://creativecommons.org/licenses/by-sa/3.0/');
    expect(page).toContain('https://github.com/lipis/flag-icons');
    expect(page).toContain('MIT License');
    expect(page).toContain('mailto:contato@cs13a0.com');
  });

  it('carrega sources.expansion.json só por import dinâmico e mostra o estado vazio', () => {
    expect(page).toMatch(/await import\(['"]\$lib\/data\/cs\/sources\.expansion\.json['"]\)/);
    expect(page).not.toMatch(/^\s*import .* from ['"]\$lib\/data\/cs\/sources\.expansion\.json['"]/m);
    expect(page).toContain("t('creditsSourcesEmpty')");
    expect(page).toContain("t('creditsRevision')");
  });

  it('o texto em pt-BR cobre CC BY-SA 3.0, Liquipedia, os arquivos da expansão, flag-icons MIT, visuais gerados e não afiliação', () => {
    const pt = (key: Parameters<typeof translate>[1]) => translate('pt-BR', key);
    expect(pt('creditsDataSource')).toContain('Liquipedia');
    expect(pt('creditsDataSource')).toContain('CC BY-SA 3.0');
    for (const file of ['teams.expansion.game.json', 'players.expansion.game.json', 'coaches.expansion.game.json', 'identities.game.json']) {
      expect(pt('creditsDataFiles')).toContain(file);
    }
    expect(pt('creditsDataFiles')).toContain('mesma licença CC BY-SA 3.0');
    expect(pt('creditsRatings')).toContain('modelados pelo próprio cs13a0');
    expect(pt('creditsFlags')).toContain('flag-icons');
    expect(pt('creditsFlags')).toContain('MIT');
    expect(pt('creditsVisuals')).toContain('gerados pelo próprio jogo');
    expect(pt('creditsVisuals')).toContain('sem reproduzir logo real de organização');
    expect(pt('creditsAffiliation')).toContain('não é afiliado, patrocinado nem endossado pela Valve, pela Liquipedia, pela HLTV');
    expect(pt('creditsAffiliation')).toContain('pertencem aos seus respectivos proprietários');
    expect(pt('creditsSourcesEmpty')).toContain('Nenhuma página registrada ainda');
    expect(pt('credits')).toBe('Créditos');
  });

  it('as outras línguas têm todas as chaves de créditos traduzidas (nada cai no pt-BR)', () => {
    // 'credits' fica de fora: é só o rótulo do link do rodapé ("Créditos"/"Créditos"), e pt-BR/es
    // compartilham legitimamente a mesma palavra — não é conteúdo não traduzido.
    const keys = ['creditsTitle', 'creditsIntro', 'creditsDataSource', 'creditsDataFiles', 'creditsRatings', 'creditsSourcesEmpty', 'creditsFlags', 'creditsVisuals', 'creditsAffiliation', 'creditsContact'] as const;
    for (const language of LANGUAGES.filter((entry) => entry !== 'pt-BR')) {
      for (const key of keys) {
        expect(translate(language, key), `${language}.${key}`).not.toBe(translate('pt-BR', key));
      }
      expect(translate(language, 'creditsFlags')).toContain('flag-icons');
      expect(translate(language, 'creditsFlags')).toContain('MIT');
      expect(translate(language, 'creditsDataSource')).toContain('CC BY-SA 3.0');
      expect(translate(language, 'creditsAffiliation')).toContain('Valve');
      expect(translate(language, 'creditsAffiliation')).toContain('Liquipedia');
      expect(translate(language, 'creditsAffiliation')).toContain('HLTV');
    }
  });

  it('está no mapa de SEO, no rodapé e no sitemap', () => {
    expect(PUBLIC_ROUTES).toContain('/credits');
    expect(SEO_BY_ROUTE['/credits'].canonical).toBe('https://cs13a0.com/credits');
    expect(readFileSync('src/lib/components/Footer.svelte', 'utf8')).toContain('href="/credits"');
    expect(readFileSync('static/sitemap.xml', 'utf8')).toContain('https://cs13a0.com/credits');
  });
});

describe('sources.expansion.json', () => {
  it('tem versão 1 e páginas { title, revid, url } da Liquipedia, sem repetição', () => {
    expect(sources.version).toBe(1);
    expect(Array.isArray(sources.pages)).toBe(true);
    const urls = sources.pages.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const entry of sources.pages) {
      expect(Object.keys(entry).sort()).toEqual(['revid', 'title', 'url']);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(String(entry.revid)).toMatch(/^\d+$/);
      expect(entry.url).toMatch(/^https:\/\/liquipedia\.net\/counterstrike\//);
    }
  });
});

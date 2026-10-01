import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_SEO_COPY, SEO_BY_ROUTE, type PublicRoute } from '../src/lib/seo';

const fileFor = (route: PublicRoute) => {
  if (route === '/') return 'build/index.html';
  const flat = `build${route}.html`;
  return existsSync(flat) ? flat : `build${route}/index.html`;
};

describe('HTML estático indexável', () => {
  for (const route of ['/', '/teams', '/players', '/wiki', '/online'] as const) {
    it(`${route} entrega SEO e conteúdo sem JavaScript`, () => {
      const path = fileFor(route);
      expect(existsSync(path), `${path} não foi gerado`).toBe(true);
      const html = readFileSync(path, 'utf8');
      expect(html).toContain(`<title>${SEO_BY_ROUTE[route].title}</title>`);
      expect(html).toContain(`name="description" content="${SEO_BY_ROUTE[route].description}"`);
      expect(html).toContain(`rel="canonical" href="${SEO_BY_ROUTE[route].canonical}"`);
      expect(html).toMatch(/<body[^>]*>[\s\S]*<(main|section|article)[^>]*>[\s\S]*\S+[\s\S]*<\/(main|section|article)>/);
    });
  }

  it('entrega o texto explicativo da home em português no HTML inicial', () => {
    const html = readFileSync(fileFor('/'), 'utf8');
    expect(html).toContain(HOME_SEO_COPY);
    const structuredData = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    expect(structuredData).toBeTruthy();
    expect(JSON.parse(structuredData!)).toMatchObject({ '@context': 'https://schema.org' });
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HOME_SEO_COPY,
  HOME_STRUCTURED_DATA,
  PUBLIC_ROUTES,
  SEO_BY_ROUTE,
  SITE_ORIGIN,
  getCanonicalUrl
} from '../src/lib/seo';

describe('SEO contract', () => {
  it('defines unique metadata for every public canonical route', () => {
    expect(SITE_ORIGIN).toBe('https://cs13a0.com');
    expect(PUBLIC_ROUTES).toEqual([
      '/',
      '/online',
      '/teams',
      '/players',
      '/about',
      '/contact',
      '/privacy',
      '/terms'
    ]);
    expect(new Set(PUBLIC_ROUTES.map((path) => SEO_BY_ROUTE[path].title)).size).toBe(PUBLIC_ROUTES.length);

    for (const path of PUBLIC_ROUTES) {
      expect(SEO_BY_ROUTE[path].description.length).toBeGreaterThan(50);
      expect(getCanonicalUrl(path)).toBe(`${SITE_ORIGIN}${path}`);
    }
  });

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
});

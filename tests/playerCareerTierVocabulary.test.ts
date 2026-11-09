// tests/playerCareerTierVocabulary.test.ts
// D5: uma régua só. Nenhum texto da Carreira (telas, componentes e motor) mostra "Tier 1", "Tier 2" ou "T1" para
// nível de time; os rótulos saem de tiers.ts (times) e de calendar.ts (campeonatos).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIER_LABEL } from '../src/lib/game/playerCareer/calendar';
import { TEAM_TIER_LABEL } from '../src/lib/game/playerCareer/tiers';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const OLD_TEAM_TIER = /\b[Tt]ier [12]\b|\bT[12]\b/;
/** Chave interna do catálogo de campeonatos (também em career-revivals.game.json); nunca aparece na tela. */
const INTERNAL_KEYS = new Set(["'Tier 2 do jogo (topo regional)'"]);
const stripComments = (source: string) => source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const literals = (source: string) => source.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
const careerTs = readdirSync(new URL('src/lib/game/playerCareer/', root)).filter((file) => file.endsWith('.ts')).map((file) => `src/lib/game/playerCareer/${file}`);
const careerSvelte = ['src/routes/player-career/+page.svelte', ...readdirSync(new URL('src/lib/components/', root)).filter((file) => /^Career.*\.svelte$/.test(file)).map((file) => `src/lib/components/${file}`)];

describe('régua única de tiers (D5)', () => {
  it('os rótulos de time e de campeonato são letras', () => {
    expect(Object.values(TEAM_TIER_LABEL)).toEqual(['Tier S', 'Tier A', 'Tier B', 'Tier C', 'Lan House']);
    expect(Object.values(TIER_LABEL)).toEqual(['Major', 'Tier S', 'Tier A', 'Tier B', 'Tier C']);
  });

  it('nenhuma tela da Carreira escreve Tier 1, Tier 2 ou T1', () => {
    const hits = careerSvelte.flatMap((path) => stripComments(read(path)).split('\n').filter((line) => OLD_TEAM_TIER.test(line)).map((line) => `${path}: ${line.trim().slice(0, 120)}`));
    expect(hits).toEqual([]);
  });

  it('nenhum texto do motor da Carreira escreve Tier 1 ou Tier 2', () => {
    const hits = careerTs.flatMap((path) => literals(stripComments(read(path))).filter((literal) => OLD_TEAM_TIER.test(literal) && !INTERNAL_KEYS.has(literal)).map((literal) => `${path}: ${literal.slice(0, 120)}`));
    expect(hits).toEqual([]);
  });

  it('a tela pega rótulo e nível de time só por tiers.ts', () => {
    const page = read('src/routes/player-career/+page.svelte');
    expect(page).not.toContain('LEVEL_LABEL');
    expect(page).not.toContain('Carreira · T{');
    expect(page).toContain("from '$lib/game/playerCareer/tiers'");
    expect(read('src/lib/components/CareerWrapped.svelte')).not.toContain('levelLabel');
  });

  it('a Elite e a descrição dos tiers aparecem na pirâmide, na ficha do time e nas ofertas', () => {
    const page = read('src/routes/player-career/+page.svelte');
    expect(page).toContain('teamTierTitle(offer.orgLevel)');
    expect(page.match(/teamTierAbout\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(page).toContain('TEAM_TIER_ABOUT');
  });
});

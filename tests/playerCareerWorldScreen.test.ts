// tests/playerCareerWorldScreen.test.ts
// Contrato de tela da Carreira: símbolos de títulos e MVPs nas cartas, a tela Mundo (abas sem rolagem lateral e
// carregamento por linha) e o botão Mundo no trilho.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DASH = /—/;

describe('símbolos de títulos e MVPs', () => {
  it('CareerHonors desenha troféu e estrela em SVG, com rótulo acessível, e some quando é zero', () => {
    const honors = source('src/lib/components/CareerHonors.svelte');
    expect(honors).toContain('role="img"');
    expect(honors).toContain('aria-label={label}');
    expect(honors.match(/viewBox="0 0 24 24"/g)?.length).toBe(2);
    expect(honors.match(/aria-hidden="true"/g)?.length).toBe(2);
    expect(honors).toContain('honors.titles > 0 || honors.mvps > 0');
    expect(honors).not.toMatch(DASH);
  });

  it('a carta e o Top 20 usam os símbolos sem mexer no overall, na função e no nick', () => {
    const card = source('src/lib/components/CareerCard.svelte');
    expect(card).toContain('export let honors: PlayerHonors | null = null;');
    expect(card).toContain('<CareerHonors {honors}');
    expect(card).toContain('<span class="top-side">');
    const top = source('src/lib/components/CareerHltvTop.svelte');
    expect(top).toContain('export let live = false;');
    expect(top).toContain('export let honorsOf');
    expect(top).toContain('<CareerHonors honors={honorsOf(player.nick)} />');
    expect(top).toContain("'Ranking dos últimos 12 meses'");
    expect(top).toContain('{reasonsLabel(player.reasons)}');
    expect(top).toContain('{#if player.points !== undefined}');
  });
});

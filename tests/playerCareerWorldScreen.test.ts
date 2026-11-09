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

describe('tela Mundo', () => {
  it('quatro abas em grade de duas colunas no celular e quatro no desktop, sem rolagem lateral', () => {
    const world = source('src/lib/components/CareerWorld.svelte');
    expect(world).toContain('role="tablist"');
    for (const label of ['Ranking', 'Top jogadores', 'Trocas', 'Campeonatos']) expect(world).toContain(`label: '${label}'`);
    expect(world).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(world).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(world).not.toContain('overflow-x');
    expect(world).not.toMatch(DASH);
  });

  it('carregamento na linha do campeonato e releitura do cache, sem simular nada', () => {
    const world = source('src/lib/components/CareerWorld.svelte');
    expect(world).toContain('Calculando o resultado');
    expect(world).toContain('setInterval');
    expect(world).toContain('clearInterval');
    expect(world).not.toContain('computeWorldResult');
    expect(world).toContain('top={top.rows}');
    expect(world).toContain('live={true}');
  });
});

describe('botão Mundo e cartas da página', () => {
  it('o trilho abre o Mundo e o Esc fecha', () => {
    const page = source('src/routes/player-career/+page.svelte');
    expect(page).toContain("import CareerWorld from '$lib/components/CareerWorld.svelte';");
    expect(page).toContain('<div class="rail-tools">');
    expect(page).toContain('class="rail-world"');
    expect(page).toContain('<CareerWorld state={career} onTeam={worldTeam} />');
    expect(page).toContain('else if (worldOpen) closeWorld();');
  });

  it('títulos e MVPs nas cartas do elenco, nas fichas, no elenco do time e na busca', () => {
    const page = source('src/routes/player-career/+page.svelte');
    expect(page.match(/honors=\{honorsFor\(honorIndex, /g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(page).toContain('<CareerHonors honors={honorsFor(honorIndex, hit.nick)} />');
    expect(page).toContain("$: honorIndex = career?.status === 'ACTIVE' ? honorsIndex(career) : null;");
  });
});

describe('ranking de jogadores por bloco na tela', () => {
  it('a aba diz os blocos fechados, o peso do ranking real e o que ainda calcula, e relê o cache', () => {
    const world = source('src/lib/components/CareerWorld.svelte');
    expect(world).toContain('blocos fechados');
    expect(world).toContain('ainda calculando: o ranking muda quando terminarem');
    expect(world).toContain('(top && top.pending > 0)');
    expect(world).not.toMatch(DASH);
  });
});

// tests/playerCareerMobile.test.ts
// D10: a Carreira no celular. Contrato do código (como em mobileMatchPresentation.test.ts): o botão de Títulos, a aba
// certa da sala de troféus e as regras de CSS que tiram o corte a 375px e 320px. A conferência de verdade é no
// navegador (plano 2026-11-09-carreira-08, "Como conferir no navegador").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const PAGE = 'src/routes/player-career/+page.svelte';
/** O último bloco de celular do <style> da página: vem depois das regras base, então é ele que vale no celular. */
const lastPhoneBlock = (text: string) => text.slice(text.lastIndexOf('@media (max-width: 680px) {'), text.lastIndexOf('</style>'));

describe('botão de Títulos (D10)', () => {
  it('abre a sala de troféus numa aba escolhida: Títulos pelo trilho, Prêmios pelo "Ver Top 20"', () => {
    const page = source(PAGE);
    expect(page).toMatch(/function openTrophies\(tab: RoomTab = 'titulos'\) \{\s*roomTab = tab;/);
    expect(page).not.toContain('on:click={openTrophies}');
    expect(page).not.toContain("roomTab = 'premios'; openTrophies()");
    expect(page.match(/openTrophies\('premios'\)/g)).toHaveLength(2);
  });

  it('é um botão de verdade: troféu em SVG, nome acessível com o número e a célula inteira de 44px', () => {
    const page = source(PAGE);
    expect(page).toContain('<svg class="trophy-ico"');
    expect(page).toMatch(/aria-label=\{`Títulos: \$\{trophies\.total\}/);
    expect(page).toContain('abrir sala de troféus`}');
    expect(page).toContain('.facts .trophy-fact { position: relative; min-height: 44px;');
    expect(page).toContain(".trophy-btn::after { content: ''; position: absolute; inset: 0; }");
    expect(page).not.toContain('border-bottom: 1px dashed var(--line); }');
  });
});

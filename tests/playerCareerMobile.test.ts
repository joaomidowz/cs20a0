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

describe('hub sem corte no celular', () => {
  it('a linha do último campeonato quebra e o texto encolhe', () => {
    const page = source(PAGE);
    expect(page).toContain('.report { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; padding-left: 18px; border-left: 1px solid var(--line); }');
    expect(page).toContain('.report-copy { display: grid; gap: 4px; min-width: 0; }');
    expect(lastPhoneBlock(page)).toContain('.report-copy { flex: 1 1 160px; }');
    expect(lastPhoneBlock(page)).toContain('.report-copy .label { max-width: 100%; }');
  });

  it('os botões do elenco quebram linha e a faixa do elenco sangra só até a borda do palco', () => {
    const page = source(PAGE);
    expect(lastPhoneBlock(page)).toContain('.squad-actions { flex: 1 1 100%; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }');
    expect(lastPhoneBlock(page)).toContain('.squad-actions .bench-btn { flex: 1 1 100%; white-space: normal; }');
    expect(page).toContain('.squad-strip { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 128px; gap: 6px; margin-inline: -10px; padding: 0 10px 8px; scroll-padding-inline: 10px; }');
  });
});

describe('ao vivo sem corte no celular', () => {
  it('a faixa ao vivo quebra linha e o chip do rival encolhe com reticências', () => {
    const block = lastPhoneBlock(source(PAGE));
    expect(block).toContain('.live-strip { flex-wrap: wrap; gap: 8px 10px; }');
    expect(block).toContain('.live-strip strong { flex: 1 1 140px; }');
    expect(block).toContain('.rival-chip { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }');
  });

  it('o cartão de mapa deixa o texto encolher (as reticências do "Pick · time" funcionam)', () => {
    expect(source('src/lib/components/SeriesViewer.svelte')).toContain('.decided-map-list article>div{min-width:0}');
  });
});

describe('sala de troféus e tabela de temporadas no celular', () => {
  it('as abas da sala quebram linha e têm 44px de toque no celular', () => {
    const page = source(PAGE);
    expect(page).toContain('.room-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); }');
    expect(lastPhoneBlock(page)).toContain('.room-tabs button { display: inline-flex; align-items: center; box-sizing: border-box; min-height: 44px; padding: 0 10px; }');
  });

  it('sem o cabeçalho da tabela (até 760px), Títulos e MVPs ganham rótulo na própria célula', () => {
    const page = source(PAGE);
    expect(page.match(/<span class="st-num" role="cell"><span class="st-cap">Títulos<\/span>/g)).toHaveLength(2);
    expect(page.match(/<span class="st-num" role="cell"><span class="st-cap">MVPs<\/span>/g)).toHaveLength(2);
    expect(page).toContain('  .st-cap { display: none; }');
    expect(page).toContain('    .st-cap { display: inline; color: var(--muted); font: 800 10px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; }');
  });
});

describe('nick longo, modais e grades em 320px', () => {
  it('nick longo quebra no sorteio e na aposentadoria; o título do confirmar cabe', () => {
    const page = source(PAGE);
    expect(page).toContain('.intro h1 { font-size: clamp(48px, 9vw, 96px); margin-bottom: 6px; overflow-wrap: anywhere; }');
    expect(page).toContain('.retired-head { min-width: 0; }');
    expect(page).toContain('.retired-head h1 { font-size: clamp(64px, 12vw, 140px); line-height: .8; overflow-wrap: anywhere; }');
    expect(page).toContain('.modal.confirm h2 { font-size: 36px; overflow-wrap: anywhere; }');
    expect(lastPhoneBlock(page)).toContain('.modal.confirm h2 { font-size: 28px; }');
  });

  it('grades com coluna mínima nunca passam da largura da tela', () => {
    const page = source(PAGE);
    for (const column of ['minmax(min(260px, 100%), 1fr)', 'minmax(min(220px, 100%), 1fr)', 'minmax(min(210px, 100%), 1fr)']) expect(page).toContain(column);
    expect(page).not.toMatch(/minmax\((?:260|220|210)px, 1fr\)/);
  });

  it('os números do parceiro no relatório viram linhas até 520px', () => {
    const report = source('src/lib/components/CareerEventReport.svelte');
    expect(report).toContain('.er-mini div { display: grid; gap: 2px; min-width: 0; padding: 4px 6px; border: 1px solid var(--line); background: var(--surface); }');
    expect(report).toContain('    .er-mini { grid-template-columns: minmax(0, 1fr); gap: 2px; }');
  });
});

describe('símbolos de títulos e MVPs na carta de 128px do celular', () => {
  it('a linha de cima da carta cabe na carta e os símbolos quebram em duas linhas quando não cabem', () => {
    expect(source('src/lib/components/CareerCard.svelte')).toContain('.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; min-width: 0; }');
    expect(source('src/lib/components/CareerHonors.svelte')).toContain('.honors { display: inline-flex; flex: none; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 3px 6px; box-sizing: border-box; max-width: 100%;');
  });
});

describe('ranking de jogadores da tela Mundo no celular', () => {
  it('o nick não some atrás dos símbolos: a linha respira menos e os símbolos descem quando não cabem', () => {
    const top = source('src/lib/components/CareerHltvTop.svelte');
    expect(top).toContain('.who-top { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-width: 0; }');
    expect(top).toContain('    .hltv-list li { grid-template-columns: 24px auto minmax(0, 1fr) 60px; gap: 6px; padding: 6px 4px; }');
  });
});

describe('tela inicial em 320px', () => {
  it('a linha do nick (campo e "Sortear") não alarga o rótulo além da coluna', () => {
    expect(source(PAGE)).toContain('.nick-row { display: flex; align-items: center; gap: 12px; min-width: 0; }');
  });
});

describe('round decisivo cabe na tela do celular', () => {
  it('a dica de cada call fica atrás de um toque no celular (e no title da call); no computador o botão some', () => {
    const page = source(PAGE);
    expect(page).toContain('let callHints = false;');
    expect(page).toContain('<p class="clutch-ctx" class:hints-only={!clutchCtx}>');
    expect(page).toContain('<button type="button" class="hints-btn" aria-expanded={callHints} aria-controls="clutch-calls" on:click={() => (callHints = !callHints)}>');
    expect(page).toContain('<div class="calls" class:hints-open={callHints} id="clutch-calls">');
    expect(page).toContain('title={RISK[alternative.profile].hint}');
    expect(page).toContain('.hints-btn, .clutch-ctx.hints-only { display: none; }');
    const block = lastPhoneBlock(page);
    expect(block).toContain('.call .risk-hint { display: none; font-size: 12px; line-height: 1.3; }');
    expect(block).toContain('.calls.hints-open .call .risk-hint { display: block; }');
    expect(block).toContain('.clutch-ctx.hints-only { display: flex; }');
    expect(block).toMatch(/\.hints-btn \{ display: inline-flex;[^}]*min-height: 44px;/);
  });

  it('calls com 52px de toque, situação menor e lados com dinheiro numa linha só', () => {
    const block = lastPhoneBlock(source(PAGE));
    expect(block).toContain('.call { grid-template-columns: 72px minmax(0, 1fr); align-content: center; gap: 4px 10px; min-height: 52px; padding: 8px 10px; }');
    expect(block).toContain('.call b { font-size: 18px; line-height: 1; }');
    expect(block).toContain('.clutch-q h2 { font-size: 25px; }');
    expect(block).toContain('.board { grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; padding-bottom: 8px; }');
    expect(block).toContain('.board .label { grid-column: auto; grid-row: auto;');
    expect(block).toContain('.clutch-foot { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }');
  });

  it('no celular o painel encosta embaixo da tela para o placar do mapa ficar à vista', () => {
    const page = source(PAGE);
    expect(page).toContain("const phone = window.matchMedia('(max-width: 680px)').matches && node.offsetHeight < window.innerHeight - 80;");
    expect(page).toContain("node.scrollIntoView({ behavior: 'smooth', block: phone ? 'end' : 'center' });");
  });
});

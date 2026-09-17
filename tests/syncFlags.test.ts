// tests/syncFlags.test.ts
// `scripts/sync-flags.mjs` (W7): a parte pura deduplica, normaliza e valida os códigos das identidades; a cópia real
// só acontece pelo CLI (`npm run sync:flags`), aqui exercitada em pasta temporária com uma fonte falsa.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFlagCodes, FLAG_CODE_PATTERN, syncFlags } from '../scripts/sync-flags.mjs';
import { FLAG_CODE_PATTERN as COMPONENT_FLAG_CODE_PATTERN } from '../src/lib/game/visuals/flags';

describe('collectFlagCodes', () => {
  it('deduplica, normaliza e ordena os códigos de jogadores, organizações e extras', () => {
    const codes = collectFlagCodes({
      identities: {
        players: { device: { country: 'dk' }, fallen: { country: ' BR ' }, coldzera: { country: 'br' }, unknown: { country: null }, empty: { country: '' } },
        orgs: { astralis: { country: 'DK' }, furia: { country: 'br' }, mixed: {} }
      },
      extraCodes: ['gb-eng', 'ua']
    });
    expect(codes).toEqual(['br', 'dk', 'gb-eng', 'ua']);
  });

  it('com identidades vazias devolve lista vazia', () => {
    expect(collectFlagCodes({ identities: { players: {}, orgs: {} } })).toEqual([]);
    expect(collectFlagCodes({ identities: null })).toEqual([]);
  });

  it('identities.game.json real (2026-09-17: 527 jogadores com país pesquisado na Liquipedia) gera códigos válidos', () => {
    const real = JSON.parse(readFileSync('src/lib/data/cs/identities.game.json', 'utf8'));
    const codes = collectFlagCodes({ identities: real });
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(code).toMatch(FLAG_CODE_PATTERN);
  });

  it('rejeita códigos fora do padrão em vez de copiar lixo', () => {
    expect(() => collectFlagCodes({ identities: { players: { x: { country: 'Brazil' } } } })).toThrow(/inválido/);
    expect(() => collectFlagCodes({ identities: { players: { x: { country: 'bra' } } } })).toThrow(/inválido/);
    expect(() => collectFlagCodes({ extraCodes: [42] })).toThrow(/inválido/);
    expect(() => collectFlagCodes({ extraCodes: ['br-'] })).toThrow(/inválido/);
  });

  it('usa o mesmo padrão de código do componente', () => {
    expect(FLAG_CODE_PATTERN.source).toBe(COMPONENT_FLAG_CODE_PATTERN.source);
  });
});

describe('syncFlags', () => {
  const scaffold = () => {
    const root = mkdtempSync(join(tmpdir(), 'cs13a0-flags-'));
    const sourceDir = join(root, 'source');
    const targetDir = join(root, 'target');
    mkdirSync(sourceDir);
    mkdirSync(targetDir);
    for (const code of ['br', 'dk', 'gb-eng']) writeFileSync(join(sourceDir, `${code}.svg`), `<svg id="${code}"/>`);
    writeFileSync(join(root, 'LICENSE'), 'MIT');
    return { sourceDir, targetDir, licensePath: join(root, 'LICENSE') };
  };

  it('copia só os códigos pedidos, remove SVGs antigos e traz a LICENSE', () => {
    const paths = scaffold();
    writeFileSync(join(paths.targetDir, 'ua.svg'), '<svg id="stale"/>');
    writeFileSync(join(paths.targetDir, 'README.md'), 'keep');
    const result = syncFlags({ codes: ['br', 'gb-eng'], ...paths });
    expect(result).toEqual({ copied: ['br', 'gb-eng'], removed: ['ua.svg'] });
    expect(readdirSync(paths.targetDir).sort()).toEqual(['LICENSE', 'README.md', 'br.svg', 'gb-eng.svg']);
    expect(readFileSync(join(paths.targetDir, 'br.svg'), 'utf8')).toBe('<svg id="br"/>');
    expect(readFileSync(join(paths.targetDir, 'LICENSE'), 'utf8')).toBe('MIT');
  });

  it('falha antes de tocar no destino quando um código não tem SVG na fonte', () => {
    const paths = scaffold();
    expect(() => syncFlags({ codes: ['br', 'xx'], ...paths })).toThrow(/xx/);
    expect(readdirSync(paths.targetDir)).toEqual([]);
  });
});

describe('static/flags no repositório', () => {
  it('contém a LICENSE do flag-icons, o README e apenas as bandeiras das identidades atuais', () => {
    const files = readdirSync('static/flags').sort();
    expect(files).toContain('LICENSE');
    expect(files).toContain('README.md');
    expect(readFileSync('static/flags/LICENSE', 'utf8')).toContain('MIT License');
    const identities = JSON.parse(readFileSync('src/lib/data/cs/identities.game.json', 'utf8'));
    const expected = collectFlagCodes({ identities }).map((code) => `${code}.svg`);
    expect(files.filter((file) => file.endsWith('.svg'))).toEqual(expected);
  });
});

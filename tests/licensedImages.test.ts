// tests/licensedImages.test.ts
// Slot de imagem licenciada (W7): vazio hoje. Toda entrada futura precisa de licença completa, evidência escrita em
// docs/permissions/granted/, arquivo local em static/licensed/ e nunca uma URL remota (nem Liquipedia, HLTV ou bo3.gg).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LICENSED_IMAGES, licensedImageFor, licensedImageSrc, type LicensedImageEntry } from '../src/lib/game/visuals/licensed';

const FILE = 'src/lib/data/licensed-images.json';
const KINDS = ['team', 'org', 'player'];
const LICENSE_FIELDS = ['holder', 'type', 'scope', 'grantedAt', 'evidence'];
const FORBIDDEN_HOSTS = ['liquipedia', 'hltv', 'bo3.gg'];

const raw = JSON.parse(readFileSync(FILE, 'utf8')) as { version: number; entries: LicensedImageEntry[] };

describe('licensed-images.json', () => {
  it('tem a forma { version: 1, entries: [] } e é o que o módulo carrega', () => {
    expect(Object.keys(raw).sort()).toEqual(['entries', 'version']);
    expect(raw.version).toBe(1);
    expect(Array.isArray(raw.entries)).toBe(true);
    expect(LICENSED_IMAGES).toEqual(raw);
  });

  it('nenhuma chave se repete dentro do mesmo tipo', () => {
    const keys = raw.entries.map((entry) => `${entry.kind}:${entry.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const [index, entry] of raw.entries.entries()) {
    describe(`entrada ${index} (${entry.kind}:${entry.key})`, () => {
      it('tem tipo, chave, arquivo, atribuição e todos os campos da licença', () => {
        expect(KINDS).toContain(entry.kind);
        expect(typeof entry.key).toBe('string');
        expect(entry.key.length).toBeGreaterThan(0);
        expect(typeof entry.attribution).toBe('string');
        expect(entry.attribution.length).toBeGreaterThan(0);
        for (const field of LICENSE_FIELDS) {
          expect(typeof entry.license?.[field as keyof typeof entry.license], field).toBe('string');
          expect(entry.license[field as keyof typeof entry.license].length, field).toBeGreaterThan(0);
        }
        expect(entry.license.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      });

      it('a evidência escrita existe em docs/permissions/granted/ e o arquivo existe em static/licensed/', () => {
        const evidence = join('docs/permissions/granted', entry.license.evidence);
        expect(existsSync(evidence), evidence).toBe(true);
        expect(statSync(evidence).isFile()).toBe(true);
        expect(entry.file).toMatch(/^licensed\/[^.].*\.(svg|png|webp|jpg|jpeg)$/);
        expect(entry.file).not.toContain('..');
        const file = join('static', entry.file);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).isFile()).toBe(true);
        expect(licensedImageSrc(entry)).toBe(`/${entry.file}`);
      });

      it('nada aponta para URL remota nem para hosts proibidos', () => {
        const values = [entry.file, entry.attribution, ...Object.values(entry.license)];
        for (const value of values) {
          expect(value).not.toMatch(/^(https?:)?\/\//i);
          expect(value).not.toMatch(/https?:\/\//i);
          for (const host of FORBIDDEN_HOSTS) expect(value.toLowerCase(), value).not.toContain(host);
        }
      });
    });
  }
});

describe('licensedImageFor', () => {
  it('responde null para chaves ausentes e resolve cada entrada registrada', () => {
    expect(licensedImageFor('org', 'astralis')).toBeNull();
    expect(licensedImageFor('player', null)).toBeNull();
    expect(licensedImageFor('team', '')).toBeNull();
    for (const entry of raw.entries) expect(licensedImageFor(entry.kind, entry.key)).toEqual(entry);
  });
});

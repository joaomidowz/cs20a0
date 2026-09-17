#!/usr/bin/env node
// scripts/sync-flags.mjs
// Copia para static/flags/ apenas as bandeiras do flag-icons (MIT) que as identidades usam, mais a LICENSE do pacote.
// Uso: npm run sync:flags [-- --extra=br,dk]   (códigos extras além dos de identities.game.json)
// Nunca baixa nada: a fonte é node_modules/flag-icons/flags/4x3, instalado com versão fixa no package.json.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Mesmo padrão de `src/lib/game/visuals/flags.ts`: ISO 3166-1 alpha-2 minúsculo, com subdivisão opcional (`gb-eng`). */
export const FLAG_CODE_PATTERN = /^[a-z]{2}(-[a-z]{3})?$/;

/**
 * @typedef {{ country?: string | null }} IdentityWithCountry
 * @typedef {{ players?: Record<string, IdentityWithCountry>; orgs?: Record<string, IdentityWithCountry> }} IdentitiesLike
 */

/**
 * Pura: códigos únicos e ordenados usados pelas identidades (jogadores e organizações) mais `extraCodes`.
 * Ignora vazios e nulos; lança em qualquer código fora do padrão, para a sincronização nunca copiar lixo.
 * @param {{ identities?: IdentitiesLike | null; extraCodes?: readonly unknown[] }} input
 * @returns {string[]}
 */
export function collectFlagCodes({ identities, extraCodes = [] }) {
  const raw = [
    ...Object.values(identities?.players ?? {}).map((entry) => entry?.country),
    ...Object.values(identities?.orgs ?? {}).map((entry) => entry?.country),
    ...extraCodes
  ];
  const codes = new Set();
  for (const value of raw) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'string') throw new Error(`Código de país inválido: ${JSON.stringify(value)}`);
    const code = value.trim().toLowerCase();
    if (!FLAG_CODE_PATTERN.test(code)) {
      throw new Error(`Código de país inválido: "${value}" (esperado ISO 3166-1 alpha-2 minúsculo, ex.: "br" ou "gb-eng")`);
    }
    codes.add(code);
  }
  return [...codes].sort();
}

/**
 * Copia `<code>.svg` de `sourceDir` para `targetDir` para cada código, remove SVGs que sobraram e copia a LICENSE.
 * Falha antes de tocar no destino se algum código não tiver SVG na fonte.
 * @param {{ codes: readonly string[]; sourceDir: string; targetDir: string; licensePath: string }} input
 * @returns {{ copied: string[]; removed: string[] }}
 */
export function syncFlags({ codes, sourceDir, targetDir, licensePath }) {
  const missing = codes.filter((code) => !existsSync(join(sourceDir, `${code}.svg`)));
  if (missing.length) throw new Error(`Sem SVG no flag-icons para: ${missing.join(', ')}`);
  mkdirSync(targetDir, { recursive: true });
  const wanted = new Set(codes.map((code) => `${code}.svg`));
  const removed = readdirSync(targetDir).filter((file) => file.endsWith('.svg') && !wanted.has(file));
  for (const file of removed) rmSync(join(targetDir, file));
  for (const code of codes) copyFileSync(join(sourceDir, `${code}.svg`), join(targetDir, `${code}.svg`));
  copyFileSync(licensePath, join(targetDir, 'LICENSE'));
  return { copied: [...codes], removed };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const extra = process.argv
    .filter((argument) => argument.startsWith('--extra='))
    .flatMap((argument) => argument.slice('--extra='.length).split(','))
    .map((code) => code.trim())
    .filter(Boolean);
  const identities = JSON.parse(readFileSync(join(root, 'src/lib/data/cs/identities.game.json'), 'utf8'));
  const codes = collectFlagCodes({ identities, extraCodes: extra });
  const result = syncFlags({
    codes,
    sourceDir: join(root, 'node_modules/flag-icons/flags/4x3'),
    targetDir: join(root, 'static/flags'),
    licensePath: join(root, 'node_modules/flag-icons/LICENSE')
  });
  console.log(`static/flags: ${result.copied.length} bandeira(s) copiada(s)${result.copied.length ? ` (${result.copied.join(', ')})` : ''}, ${result.removed.length} removida(s), LICENSE atualizada.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

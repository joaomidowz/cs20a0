// tests/catalogGuards.test.ts
// Guardas do catálogo (W0 da expansão de jogadores): o modo online precisa continuar byte-idêntico ao v1
// até o deploy coordenado do servidor. O servidor Node responde 409 "Dataset mismatch" quando o hash do
// cliente difere (server/app.ts), então qualquer mudança nos arquivos v1 ou no grafo de imports do online
// tem que falhar aqui, em vez de derrubar o online em produção.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ONLINE_DATA_HASH } from '../src/lib/game/online/dataset';

/** Só muda no deploy coordenado do online v2 (cliente e servidor publicados juntos). */
const FROZEN_ONLINE_DATA_HASH = '13afb71201a6db3a';

/** SHA-256 dos bytes crus dos arquivos v1. Só mudam no deploy coordenado do online v2. */
const FROZEN_V1_FILES: Record<string, string> = {
  'src/lib/data/cs/players.game.json': '647cb3e92761cc24873a7998195e371e39fea3e6555700531fbfb6ad9a3876d6',
  'src/lib/data/cs/teams.game.json': 'd98444dbe7625265481e0190d2f91fa40ed63bc734c39a9c43c14870b817bf4d',
  'src/lib/data/cs/coaches.game.json': 'aa958df2d6c44c0721c45c9b8ac96a5b2a3c8f50b77e9ab08c19e053e7df79c0'
};

/** Diretórios cujo grafo de imports define o que o online (cliente + servidor) enxerga. */
const ONLINE_BOUNDARY_DIRS = ['src/routes/online', 'src/lib/game/online', 'server'];

/** Os únicos arquivos de dados que o online pode ler; qualquer outro JSON muda o hash ou o pool sem o servidor saber. */
const ONLINE_DATASET_FILES = ['players.game.json', 'teams.game.json'];

/** Módulos que ainda não existem, mas que a expansão vai criar: o online não pode passar a importá-los. */
const FORBIDDEN_SPECIFIER_PATTERNS = [/catalog/i, /\.expansion\./, /expansion\.game/, /identities\.game/, /catalog-manifest/];

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const readSourceFiles = (dir: string): Array<[string, string]> =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return readSourceFiles(full);
    return full.endsWith('.ts') || full.endsWith('.svelte') ? [[full, readFileSync(full, 'utf8')] as [string, string]] : [];
  });

/** Todo especificador de `import ... from`, `export ... from`, `import()` e import de efeito, independente de quebra de linha. */
const importSpecifiers = (source: string): string[] => [
  ...[...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ...[...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
  ...[...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)].map((match) => match[1])
];

const boundaryFiles = ONLINE_BOUNDARY_DIRS.flatMap((dir) => readSourceFiles(dir));

describe('hash online congelado', () => {
  it('ONLINE_DATA_HASH continua o mesmo do servidor publicado', () => {
    expect(ONLINE_DATA_HASH).toBe(FROZEN_ONLINE_DATA_HASH);
  });
});

describe('arquivos v1 congelados', () => {
  for (const [file, digest] of Object.entries(FROZEN_V1_FILES)) {
    it(`${basename(file)} tem os mesmos bytes do v1`, () => {
      expect(sha256(file), file).toBe(digest);
    });
  }
});

describe('fronteira de import do online', () => {
  it('a varredura cobre os arquivos que definem o online', () => {
    const paths = boundaryFiles.map(([path]) => path);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain(join('src/routes/online', '+page.svelte'));
    expect(paths).toContain(join('src/lib/game/online', 'dataset.ts'));
    expect(paths).toContain(join('server', 'data.ts'));
    expect(paths).toContain(join('server', 'app.ts'));
  });

  it('nenhum arquivo do online importa módulo do catálogo expandido', () => {
    for (const [file, source] of boundaryFiles) {
      for (const specifier of importSpecifiers(source)) {
        for (const pattern of FORBIDDEN_SPECIFIER_PATTERNS) {
          expect(specifier, `${file} importa '${specifier}'`).not.toMatch(pattern);
        }
      }
    }
  });

  it('nenhum arquivo do online importa JSON além de players.game.json e teams.game.json', () => {
    for (const [file, source] of boundaryFiles) {
      const jsonImports = importSpecifiers(source).filter((specifier) => specifier.endsWith('.json'));
      for (const specifier of jsonImports) {
        expect(ONLINE_DATASET_FILES, `${file} importa '${specifier}'`).toContain(basename(specifier));
        expect(specifier, `${file} importa '${specifier}' fora de src/lib/data/cs`).toMatch(/(^|\/)data\/cs\/[^/]+\.json$/);
      }
    }
  });

  it('server/data.ts e online/dataset.ts leem exatamente players.game.json e teams.game.json de src/lib/data/cs', () => {
    for (const file of ['server/data.ts', join('src/lib/game/online', 'dataset.ts')]) {
      const datasetImports = importSpecifiers(readFileSync(file, 'utf8'))
        .filter((specifier) => specifier.includes('data/cs/'))
        .map((specifier) => basename(specifier))
        .sort();
      expect(datasetImports, file).toEqual([...ONLINE_DATASET_FILES].sort());
    }
  });
});

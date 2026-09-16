// tests/catalogGuards.test.ts
// Guardas do catálogo (W0 da expansão de jogadores): o modo online precisa continuar byte-idêntico ao v1
// até o deploy coordenado do servidor. O servidor Node responde 409 "Dataset mismatch" quando o hash do
// cliente difere (server/app.ts), então qualquer mudança nos arquivos v1 ou no grafo de imports do online
// tem que falhar aqui, em vez de derrubar o online em produção.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getCatalog } from '../src/lib/game/catalog';
import { coachById, coaches, playerById, players, teamById, teams } from '../src/lib/game/data';
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

/** Módulos do catálogo expandido (W1): o online não pode passar a importá-los. */
const FORBIDDEN_SPECIFIER_PATTERNS = [/catalog/i, /\.expansion\./, /expansion\.game/, /identities\.game/, /catalog-manifest/];

/** Módulos core: o online importa `$lib/game/data` (rota) e ambos alimentam o hash, então só podem ler os três JSON v1. */
const CORE_ONLY_MODULES = ['src/lib/data/csData.ts', join('src/lib/game', 'data.ts')];

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

/** Arquivos da expansão que o online nunca pode alcançar, nem por componente compartilhado (o bundle cresceria com dados que ele não usa). */
const isExpansionFile = (file: string) =>
  file === join('src/lib/game', 'catalog.ts') ||
  /\.expansion\.game\.json$/.test(file) ||
  basename(file) === 'identities.game.json' ||
  basename(file) === 'catalog-manifest.json';

/** `import type … from` e `export type … from` somem na compilação: não entram no grafo. */
const stripTypeOnlyImports = (source: string) =>
  source.replace(/\b(?:import|export)\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*from\s+['"][^'"]+['"]/g, '');

/** Resolve `$lib/…` e caminhos relativos para um arquivo do repo; pacotes, `$app/*` e `$env/*` ficam de fora. */
const resolveSpecifier = (from: string, specifier: string): string | null => {
  const base = specifier.startsWith('$lib/')
    ? join('src/lib', specifier.slice('$lib/'.length))
    : specifier.startsWith('.')
      ? join(dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.svelte`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

/** Todo arquivo do repo alcançável a partir do online, seguindo imports de valor de `.ts` e `.svelte`. */
const reachableFromOnline = (): string[] => {
  const queue = boundaryFiles.map(([path]) => path);
  const seen = new Set(queue);
  while (queue.length) {
    const file = queue.shift()!;
    if (!file.endsWith('.ts') && !file.endsWith('.svelte')) continue;
    for (const specifier of importSpecifiers(stripTypeOnlyImports(readFileSync(file, 'utf8')))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return [...seen];
};

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

  it('src/routes/online/+page.svelte nunca importa o catálogo', () => {
    const specifiers = importSpecifiers(readFileSync(join('src/routes/online', '+page.svelte'), 'utf8'));
    expect(specifiers).toContain('$lib/game/data');
    for (const specifier of specifiers) {
      for (const pattern of FORBIDDEN_SPECIFIER_PATTERNS) {
        expect(specifier, `online/+page.svelte importa '${specifier}'`).not.toMatch(pattern);
      }
    }
  });
});

describe('grafo transitivo de imports do online', () => {
  const reachable = reachableFromOnline();

  it('a varredura atravessa os componentes compartilhados até o contexto do catálogo', () => {
    expect(reachable).toContain(join('src/routes/online', '+page.svelte'));
    expect(reachable).toContain(join('src/lib/components', 'DraftHud.svelte'));
    expect(reachable).toContain(join('src/lib/game', 'catalogContext.ts'));
    expect(reachable).toContain(join('src/lib/game', 'catalogCore.ts'));
    expect(reachable).toContain(join('src/lib/data/cs', 'players.game.json'));
  });

  it('nenhum arquivo alcançável pelo online é o catálogo expandido nem um arquivo da expansão', () => {
    expect(reachable.filter(isExpansionFile)).toEqual([]);
  });
});

describe('módulos core continuam só com o v1', () => {
  it('csData.ts importa exatamente os três JSON v1 e data.ts nenhum outro JSON', () => {
    const v1Files = Object.keys(FROZEN_V1_FILES).map((file) => basename(file)).sort();
    const jsonImportsOf = (file: string) =>
      importSpecifiers(readFileSync(file, 'utf8')).filter((specifier) => specifier.endsWith('.json')).map((specifier) => basename(specifier)).sort();
    expect(jsonImportsOf('src/lib/data/csData.ts')).toEqual(v1Files);
    expect(jsonImportsOf(join('src/lib/game', 'data.ts'))).toEqual([]);
  });

  it('csData.ts e data.ts não importam nada do catálogo nem da expansão', () => {
    for (const file of CORE_ONLY_MODULES) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        for (const pattern of FORBIDDEN_SPECIFIER_PATTERNS) {
          expect(specifier, `${file} importa '${specifier}'`).not.toMatch(pattern);
        }
      }
    }
  });

  it("getCatalog('core') devolve as mesmas referências de data.ts", () => {
    const core = getCatalog('core');
    expect(core.version).toBe('core');
    expect(core.teams).toBe(teams);
    expect(core.players).toBe(players);
    expect(core.coaches).toBe(coaches);
    expect(core.teamById).toBe(teamById);
    expect(core.playerById).toBe(playerById);
    expect(core.coachById).toBe(coachById);
    // Todo time do v1 é de evento principal com cinco jogadores: o pool de draft e de bots é o dataset inteiro, na mesma ordem.
    expect(core.draftTeams.map((team) => team.id)).toEqual(teams.map((team) => team.id));
    expect(core.botTeams.map((team) => team.id)).toEqual(teams.map((team) => team.id));
  });
});

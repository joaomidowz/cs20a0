// tests/styleContract.test.ts
// Contrato de fonte: TODO schema z.enum que valida estilo aceita os SEIS planos. Nasceu do bug de PRD de
// 2026-09-21 — o lineupSchema do servidor ficou nas três tags antigas e salvar Tempo/Reativo/Resiliente
// devolvia 400 "Invalid option" (os testes de API que pegariam isso precisam de Postgres e pulam sem ele).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORG_STYLES } from '../src/lib/game/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .ts file under server/ and src/ that mentions aggressive (cheap pre-filter for the scan). */
function tsFilesMentioningStyles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'node_modules' || entry === '.svelte-kit' || entry === 'dist') continue;
        walk(path);
      } else if (entry.endsWith('.ts') || entry.endsWith('.svelte')) {
        const content = readFileSync(path, 'utf8');
        if (content.includes('z.enum([\'aggressive\'') || content.includes('z.enum(["aggressive"')) found.push(path);
      }
    }
  };
  walk(dir);
  return found;
}

describe('contrato de fonte: schemas de estilo', () => {
  it('todo z.enum de estilo aceita os seis planos', () => {
    const files = [...tsFilesMentioningStyles(join(root, 'server')), ...tsFilesMentioningStyles(join(root, 'src'))];
    // A referência e a rota da lineup existem; se a varredura não acha nada, ela quebrou.
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      const enums = [...source.matchAll(/z\.enum\(\[([^\]]*'aggressive'[^\]]*)\]\)/g)].map((match) => match[1]);
      for (const schema of enums) {
        for (const style of ORG_STYLES) {
          expect(schema, `${path}: enum de estilo sem '${style}'`).toContain(`'${style}'`);
        }
      }
    }
  });

  it('a régua canônica tem os seis, e o servidor valida a lineup pela mesma régua', async () => {
    expect(ORG_STYLES).toEqual(['aggressive', 'balanced', 'tactical', 'tempo', 'reativo', 'resiliente']);
    // A rota da lineup (sem Postgres não dá para chamar a API): o schema do arquivo aceita cada plano.
    const source = readFileSync(join(root, 'server/http/collection-routes.ts'), 'utf8');
    for (const style of ORG_STYLES) expect(source).toContain(`'${style}'`);
  });
});

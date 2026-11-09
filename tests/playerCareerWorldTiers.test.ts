// tests/playerCareerWorldTiers.test.ts
// O mundo aparece na tela pelo tier de hoje (currentLevelOf, passado de fora), mas evolui pelo nível base do
// catálogo: world.ts nunca lê o nível desta carreira (D6).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sceneOrgById } from '../src/lib/game/playerCareer/data';
import { headlineTransfers, risingProspects, sceneWorld } from '../src/lib/game/playerCareer/world';

describe('mundo: tela no tier de hoje, evolução no nível base', () => {
  it('as trocas chamativas ordenam pelo nível que a tela passa', () => {
    const transfers = sceneWorld('w-1', 2).transfers;
    const base = (id: string) => sceneOrgById.get(id)?.level ?? 9;
    // A troca de tier mais baixo no catálogo: pelo catálogo, ela ficaria no fim.
    const lowest = [...transfers].sort((a, b) => Math.min(base(b.fromId), base(b.toId)) - Math.min(base(a.fromId), base(a.toId)))[0];
    const levelOf = (orgId: string) => (orgId === lowest.fromId || orgId === lowest.toId ? 0 : 5);
    const top = headlineTransfers('w-1', 2, 1, levelOf)[0];
    expect(Math.min(levelOf(top.fromId), levelOf(top.toId))).toBe(0);
    expect(headlineTransfers('w-1', 2, 4)).toHaveLength(4);
  });

  it('cada promessa traz o id do time (a tela pega o tier por currentLevelOf)', () => {
    const kids = risingProspects('kids-1', 2, 4);
    expect(kids.length).toBeGreaterThan(0);
    for (const kid of kids) expect(sceneOrgById.get(kid.orgId)?.name).toBe(kid.orgName);
    expect(kids.some((kid) => 'level' in kid)).toBe(false);
  });

  it('a evolução do mundo não lê o nível desta carreira', () => {
    const world = readFileSync(new URL('../src/lib/game/playerCareer/world.ts', import.meta.url), 'utf8');
    expect(world).not.toContain('currentLevelOf');
    expect(world).not.toContain("from './tiers'");
    expect(world).not.toContain('orgLevels');
  });
});

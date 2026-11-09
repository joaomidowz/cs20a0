// tests/careerTeamLogos.test.ts
// Logos do pacote do dono (ranking mundial de novembro de 2026): cada entrada aponta para um arquivo que existe, com
// o nome pelo id da org, leve, e todo time do top 60 do ranking resolve uma logo no escudo, com ou sem orgId.
import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { realRanking, sceneOrgById } from '../src/lib/game/playerCareer/data';
import { LICENSED_IMAGES, orgLogoFor } from '../src/lib/game/visuals/licensed';

const PACK = LICENSED_IMAGES.entries.filter((entry) => entry.attribution.includes('pacote do dono, ranking mundial 2026-11'));

describe('logos dos times do ranking de novembro de 2026', () => {
  it('cada logo do pacote existe em static/, tem o nome pelo id da org e fica abaixo de 100 KB', () => {
    expect(PACK.length).toBeGreaterThan(150);
    const orgIds = new Set(realRanking.teams.map((team) => team.orgId));
    for (const entry of PACK) {
      const file = join('static', entry.file);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(100 * 1024);
      const id = entry.file.replace(/^licensed\/orgs\//, '').replace(/\.(svg|png|webp)$/, '');
      expect(orgIds.has(id), entry.file).toBe(true);
    }
  });

  it('todo time do top 60 resolve uma logo, pelo nome e pelo id da cena', () => {
    for (const team of realRanking.teams.filter((entry) => entry.rank <= 60)) {
      const org = sceneOrgById.get(team.orgId)!;
      expect(orgLogoFor({ name: org.name, id: org.id }), org.name).not.toBeNull();
      expect(orgLogoFor({ orgId: org.id, name: org.name, id: org.id }), org.name).not.toBeNull();
    }
  });

  it('time sem logo continua com o escudo gerado', () => {
    expect(orgLogoFor({ name: 'Time Inventado do Teste', id: 'time-inventado-2026' })).toBeNull();
  });
});

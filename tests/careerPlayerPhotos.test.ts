// tests/careerPlayerPhotos.test.ts
// Fotos do pacote do dono (ranking mundial de novembro de 2026): cada entrada aponta para um WebP leve que existe, e
// todo jogador real dos times do top 60 tem foto na carta da Carreira (a mesma busca da CareerCard: baseId do
// catálogo ou o nick em minúsculas).
import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { memberNick, realRanking, sceneOrgById } from '../src/lib/game/playerCareer/data';
import { LICENSED_IMAGES, licensedImageFor } from '../src/lib/game/visuals/licensed';

const PACK = LICENSED_IMAGES.entries.filter((entry) => entry.kind === 'player' && entry.attribution.includes('pacote do dono, ranking mundial 2026-11'));
/** Sem foto na HLTV (silhueta padrão): fica o fundo da carta. */
const WITHOUT_PHOTO = ['MRcreed'];

describe('fotos dos jogadores de 2026', () => {
  it('cada foto do pacote é um WebP que existe em static/ e tem até 15 KB', () => {
    expect(PACK.length).toBeGreaterThan(700);
    for (const entry of PACK) {
      expect(entry.file).toMatch(/^licensed\/players\/[a-z0-9_-]+\.webp$/);
      const file = join('static', entry.file);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThanOrEqual(15 * 1024);
    }
  });

  it('todo jogador real dos times do top 60 tem foto na carta', () => {
    const missing: string[] = [];
    for (const team of realRanking.teams.filter((entry) => entry.rank <= 60)) {
      const org = sceneOrgById.get(team.orgId)!;
      for (const member of org.roster.filter((candidate) => !candidate.generated)) {
        const photo = licensedImageFor('player', member.catalogBaseId ?? member.nick.toLowerCase()) ?? licensedImageFor('player', memberNick(member).toLowerCase());
        if (!photo) missing.push(member.nick);
      }
    }
    expect(missing).toEqual(WITHOUT_PHOTO);
  });
});

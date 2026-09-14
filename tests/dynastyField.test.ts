import { describe, expect, it } from 'vitest';
import { players, teams } from '../src/lib/game/data';
import { buildDynastyStageFields, FALLEN_GIANT_ODDS, STAGE_TIERS, stageOfTier } from '../src/lib/game/dynasty/field';
import type { TournamentOrganization } from '../src/lib/game/online/tournament-engine';
import type { MajorStage } from '../src/lib/game/types';

const user: TournamentOrganization = { id: 'user', name: 'Sua Org', seed: 1, team: { id: 'user', name: 'Sua Org', power: 80, mental: 80, clutch: 80, experience: 80, isUser: true }, human: true };
const tierOf = new Map(teams.map((team) => [team.id, team.tier ?? null]));
const build = (entryStage: MajorStage, seed = 'campo-1') => buildDynastyStageFields({ teams, allPlayers: players, user, entryStage, seed });

describe('campos por estágio da Dinastia', () => {
  it('classifica cada tier no estágio certo e tier desconhecido no Stage 1', () => {
    expect(stageOfTier('underdog')).toBe('stage1');
    expect(stageOfTier('contender')).toBe('stage2');
    expect(stageOfTier('S+')).toBe('stage3');
    expect(stageOfTier(null)).toBe('stage1');
    expect(FALLEN_GIANT_ODDS).toEqual([0.5, 0.2]);
  });

  it('monta 16, 8 e 8 sem repetir time e com o usuário no estágio de entrada', () => {
    for (const entry of ['stage1', 'stage2', 'stage3'] as const) {
      const fields = build(entry);
      expect(fields.stage1).toHaveLength(16);
      expect(fields.stage2).toHaveLength(8);
      expect(fields.stage3).toHaveLength(8);
      const ids = [...fields.stage1, ...fields.stage2, ...fields.stage3].map((organization) => organization.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(fields[entry].some((organization) => organization.id === 'user')).toBe(true);
      expect(ids.filter((id) => id === 'user')).toHaveLength(1);
    }
  });

  it('nunca desce um time mais de um degrau', () => {
    for (let index = 0; index < 30; index += 1) {
      const fields = build('stage1', `degrau-${index}`);
      for (const organization of fields.stage1) {
        if (organization.id === 'user') continue;
        expect(['stage1', 'stage2']).toContain(stageOfTier(tierOf.get(organization.id)));
      }
      for (const organization of fields.stage2) {
        expect(['stage2', 'stage3']).toContain(stageOfTier(tierOf.get(organization.id)));
      }
      for (const organization of fields.stage3) {
        expect(STAGE_TIERS.stage3).toContain(tierOf.get(organization.id) ?? '');
      }
    }
  });

  it('às vezes um gigante cai um degrau', () => {
    const seeds = Array.from({ length: 30 }, (_, index) => `gigante-${index}`);
    const fell = seeds.some((seed) => build('stage1', seed).stage1.some((organization) => stageOfTier(tierOf.get(organization.id)) === 'stage2'));
    expect(fell).toBe(true);
  });

  it('é determinístico pela seed', () => {
    const ids = (seed: string) => build('stage2', seed).stage3.map((organization) => organization.id);
    expect(ids('a')).toEqual(ids('a'));
    expect(ids('a')).not.toEqual(ids('b'));
  });
});

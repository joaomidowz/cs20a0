// tests/playerCareerRankFloor.test.ts
// D11 (decisão do dono): time subestimado sobe de nível base pelo ranking real. Do 1º ao 16º segue a regra de antes
// (Tier S); do 17º ao 30º, Tier A (nível 2); do 31º ao 60º, Tier B (nível 3). Nunca desce ninguém.
import { describe, expect, it } from 'vitest';
import { ORG_BASE_POWER, liftByRealRank, rankFloorLevel, sceneOrgs, type SceneOrg } from '../src/lib/game/playerCareer/data';

const byName = (name: string) => sceneOrgs.find((org) => org.name === name)!;
const tierAPower = (rank: number) => Math.round(Math.max(78, 84 - (rank - 16) * 0.4) * 10) / 10;

describe('nível base pelo ranking real', () => {
  it('Fnatic, Imperial e Virtus.pro (17º a 30º do ranking real) estão no Tier A com a força do ranking', () => {
    for (const name of ['Fnatic', 'Imperial Esports', 'Virtus.pro']) {
      const org = byName(name);
      expect(org.worldRank, name).toBeGreaterThan(16);
      expect(org.worldRank, name).toBeLessThanOrEqual(30);
      expect(org.level, name).toBe(2);
      expect(org.power, name).toBe(tierAPower(org.worldRank!));
    }
  });

  it('nenhum time do 17º ao 60º fica abaixo do nível que o ranking real pede', () => {
    for (const org of sceneOrgs) {
      const floor = rankFloorLevel(org.worldRank ?? null);
      if (floor !== null) expect(org.level, org.name).toBeLessThanOrEqual(floor);
    }
  });

  it('a regra só sobe: quem já está acima ou fora da faixa não muda', () => {
    const org = (level: number, worldRank: number | null, power = 50): SceneOrg => ({ ...byName('Fnatic'), level, worldRank, power });
    expect(rankFloorLevel(5)).toBeNull();
    expect(rankFloorLevel(17)).toBe(2);
    expect(rankFloorLevel(30)).toBe(2);
    expect(rankFloorLevel(31)).toBe(3);
    expect(rankFloorLevel(60)).toBe(3);
    expect(rankFloorLevel(61)).toBeNull();
    expect(rankFloorLevel(null)).toBeNull();
    for (const kept of [org(0, 25), org(1, 40), org(2, 28), org(3, 45), org(4, 61), org(4, null), org(1, 5)]) {
      expect(liftByRealRank(kept)).toEqual(kept);
    }
    expect(liftByRealRank(org(4, 29))).toMatchObject({ level: 2, power: tierAPower(29) });
    expect(liftByRealRank(org(3, 21))).toMatchObject({ level: 2, power: tierAPower(21) });
    expect(liftByRealRank(org(4, 45))).toMatchObject({ level: 3, power: ORG_BASE_POWER[3] });
  });

  it('na cena, só os três subestimados mudaram (do Tier C para o Tier A)', () => {
    const counts: Record<number, number> = {};
    for (const org of sceneOrgs) counts[org.level] = (counts[org.level] ?? 0) + 1;
    // Antes da regra: 7, 8, 49, 83 e 118 times nos níveis 0 a 4.
    expect(counts).toEqual({ 0: 7, 1: 8, 2: 52, 3: 83, 4: 115 });
  });
});

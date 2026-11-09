// tests/playerCareerTiers.test.ts
// D5: a régua única de tiers (times e campeonatos com letras) e a fonte única do nível de hoje de um time.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { TEAM_TIER_ABOUT, TEAM_TIER_BY_LEVEL, TEAM_TIER_LABEL, baseLevelOf, currentLevelOf, isEliteLevel, teamTierAbout, teamTierLabel, teamTierTitle } from '../src/lib/game/playerCareer/tiers';

const career = (): PlayerCareerState => ({ ...createPlayerCareer({ nick: 'tiers', country: 'Brazil', role: 'rifler', seed: 'tiers-1' }), pendingDraw: null, drawDone: true });

describe('régua de tiers', () => {
  it('nível 0 a 5 vira S, S, A, B, C e LAN, com os rótulos da spec (D5 revisada)', () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => TEAM_TIER_BY_LEVEL[level])).toEqual(['S', 'S', 'A', 'B', 'C', 'LAN']);
    expect(TEAM_TIER_LABEL).toEqual({ S: 'Tier S', A: 'Tier A', B: 'Tier B', C: 'Tier C', LAN: 'Lan House' });
    expect([0, 1, 2, 3, 4, 5].map(teamTierLabel)).toEqual(['Tier S', 'Tier S', 'Tier A', 'Tier B', 'Tier C', 'Lan House']);
  });

  it('o top 8 (nível 0) tem o selo Elite dentro do Tier S', () => {
    expect([0, 1, 2, 3, 4, 5].map(isEliteLevel)).toEqual([true, false, false, false, false, false]);
    expect([0, 1, 2, 5].map(teamTierTitle)).toEqual(['Tier S · Elite', 'Tier S', 'Tier A', 'Lan House']);
  });

  it('cada tier tem a descrição do dono, curta e sem travessão', () => {
    expect(Object.keys(TEAM_TIER_ABOUT).sort()).toEqual(['A', 'B', 'C', 'LAN', 'S']);
    for (const about of Object.values(TEAM_TIER_ABOUT)) {
      expect(about.length).toBeGreaterThan(0);
      expect(about.length).toBeLessThanOrEqual(140);
      expect(about).not.toMatch(/[—–]/);
    }
    expect(teamTierAbout(1)).toBe(TEAM_TIER_ABOUT.S);
    expect(teamTierAbout(4)).toBe(TEAM_TIER_ABOUT.C);
    expect(teamTierAbout(9)).toBe('');
  });

  it('nível fora da régua aparece como número, sem inventar tier', () => {
    expect(teamTierLabel(9)).toBe('Nível 9');
    expect(teamTierTitle(9)).toBe('Nível 9');
  });
});

describe('currentLevelOf', () => {
  it('sem nada desta carreira, é o nível do catálogo', () => {
    const state = career();
    const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!;
    const challenger = sceneOrgs.find((org) => org.level === 3)!;
    expect(currentLevelOf(state, vitality.id)).toBe(0);
    expect(currentLevelOf(state, challenger.id)).toBe(3);
    expect(currentLevelOf(state, 'lan-house')).toBe(5);
    expect(currentLevelOf(state, 'time-que-nao-existe')).toBe(5);
  });

  it('o time que você levou para cima (orgLevels) vale no nível novo; os outros não mudam', () => {
    const challenger = sceneOrgs.find((org) => org.level === 3)!;
    const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!;
    const state: PlayerCareerState = { ...career(), orgLevels: { [challenger.id]: 2 } };
    expect(currentLevelOf(state, challenger.id)).toBe(2);
    expect(currentLevelOf(state, vitality.id)).toBe(0);
    expect(baseLevelOf(challenger.id)).toBe(3);
  });
});

// tests/playerCareerCards.test.ts
// A raridade da carta da Carreira sobe com o overall, na escada do modo online.
import { describe, expect, it } from 'vitest';
import { careerRarity } from '../src/lib/game/playerCareer/cards';

describe('raridade da carta da carreira', () => {
  it('sobe degrau a degrau com o overall', () => {
    expect(careerRarity(66).rarity).toBe('common');
    expect(careerRarity(70).rarity).toBe('rare');
    expect(careerRarity(77).rarity).toBe('elite');
    expect(careerRarity(83).rarity).toBe('superstar');
    expect(careerRarity(96).rarity).toBe('superstar');
    expect(careerRarity(97).rarity).toBe('legend');
    expect(careerRarity(98).rarity).toBe('legend');
    expect(careerRarity(99).rarity).toBe('goat');
  });

  it('diz quanto falta para a próxima e para no topo', () => {
    expect(careerRarity(66).next).toEqual({ rarity: 'rare', at: 70, missing: 4 });
    expect(careerRarity(80).next).toEqual({ rarity: 'superstar', at: 83, missing: 3 });
    expect(careerRarity(97).next).toEqual({ rarity: 'goat', at: 99, missing: 2 });
    expect(careerRarity(99).next).toBeNull();
    expect(careerRarity(99).progress).toBe(1);
  });

  it('o progresso do degrau fica entre 0 e 1', () => {
    expect(careerRarity(60).progress).toBe(0);
    expect(careerRarity(65).progress).toBe(0.5);
    expect(careerRarity(40).progress).toBe(0);
  });
});
